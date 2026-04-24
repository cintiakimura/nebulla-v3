/**
 * Render-first backend: PostgreSQL (Render) + cookie sessions + GitHub/Google OAuth.
 * Mount with mountRenderStack(app) from server.ts.
 */

import type { Express, Request, Response } from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import pg from "pg";
import crypto from "crypto";

const SESSION_COOKIE = "nebula_session";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const OAUTH_REMEMBER_COOKIE = "oauth_remember";

let pool: pg.Pool | null = null;

function getPool(): pg.Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: url,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
      max: 10,
    });
  }
  return pool;
}

export function getRenderPublicConfig() {
  return {
    cloudStorageReady: Boolean(process.env.DATABASE_URL?.trim()),
    githubOAuthReady: Boolean(
      process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim()
    ),
    googleOAuthReady: Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()
    ),
  };
}

async function ensureTables(p: pg.Pool) {
  await p.query(`
    CREATE TABLE IF NOT EXISTS nebula_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      email TEXT,
      display_name TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(provider, provider_user_id)
    );
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS nebula_projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES nebula_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      pages JSONB NOT NULL DEFAULT '[]',
      edges JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, name)
    );
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_nebula_projects_user ON nebula_projects(user_id);`);
}

function sessionSecret(): string {
  const s = process.env.SESSION_SECRET?.trim();
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    console.warn("[nebula] SESSION_SECRET missing or short; set a strong secret in production.");
  }
  return process.env.SESSION_SECRET || "dev-only-nebula-session-change-me";
}

type JwtPayload = { uid: string; v: 1 };

function signSession(uid: string): string {
  return jwt.sign({ uid, v: 1 } as JwtPayload, sessionSecret(), { expiresIn: "30d" });
}

function readSession(req: Request): string | null {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (!raw || typeof raw !== "string") return null;
  try {
    const p = jwt.verify(raw, sessionSecret()) as JwtPayload;
    if (p?.v === 1 && typeof p.uid === "string") return p.uid;
  } catch {
    /* invalid */
  }
  return null;
}

function publicBaseUrl(req: Request): string {
  // Admin-configured canonical callback origin takes precedence.
  const explicit = process.env.PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  // Fallback to request-derived origin for local/dev and proxy-only setups.
  const forwardedHost = (req.get("x-forwarded-host") || "").split(",")[0]?.trim();
  const host = (req.get("host") || "").trim();
  const finalHost = forwardedHost || host;
  const forwardedProto = (req.get("x-forwarded-proto") || "").split(",")[0]?.trim();
  const proto = forwardedProto || (req.protocol === "https" ? "https" : "http");
  if (finalHost) return `${proto}://${finalHost}`.replace(/\/$/, "");

  return `http://localhost:${process.env.PORT || 3000}`;
}

function setSessionCookie(res: Response, token: string, remember: boolean) {
  const secure = process.env.NODE_ENV === "production";
  const cookieOptions: Record<string, unknown> = {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
  };
  if (remember) cookieOptions.maxAge = SESSION_MAX_AGE_MS;
  res.cookie(SESSION_COOKIE, token, cookieOptions);
}

export async function mountRenderStack(app: Express) {
  app.use(cookieParser() as any);

  const p = getPool();
  if (p) {
    try {
      await ensureTables(p);
      console.log("[nebula] PostgreSQL (Render) schema ready.");
    } catch (e) {
      console.error("[nebula] PostgreSQL init failed:", e);
    }
  }

  app.get("/api/auth/session", async (req, res) => {
    const uid = readSession(req);
    if (!uid || !p) {
      return res.json({ user: null });
    }
    try {
      const r = await p.query(
        `SELECT id, email, display_name, avatar_url FROM nebula_users WHERE id = $1`,
        [uid]
      );
      const row = r.rows[0];
      if (!row) return res.json({ user: null });
      res.json({
        user: {
          uid: row.id,
          displayName: row.display_name,
          email: row.email,
          photoURL: row.avatar_url,
        },
      });
    } catch (e) {
      console.error("[nebula] /api/auth/session:", e);
      res.status(500).json({ error: "Session lookup failed" });
    }
  });

  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.json({ ok: true });
  });

  // --- GitHub OAuth ---
  app.get("/api/auth/github", (req, res) => {
    if (!p) return res.status(503).send("Database not configured (DATABASE_URL)");
    const id = process.env.GITHUB_CLIENT_ID?.trim();
    if (!id) return res.status(503).send("GITHUB_CLIENT_ID not configured");
    const redirectUri = `${publicBaseUrl(req)}/api/auth/github/callback`;
    const state = crypto.randomBytes(16).toString("hex");
    const remember = String(req.query.remember || "").toLowerCase() === "1" || String(req.query.remember || "").toLowerCase() === "true";
    res.cookie("oauth_state", state, { httpOnly: true, maxAge: 600000, path: "/", sameSite: "lax" });
    res.cookie(OAUTH_REMEMBER_COOKIE, remember ? "1" : "0", { httpOnly: true, maxAge: 600000, path: "/", sameSite: "lax" });
    const q = new URLSearchParams({
      client_id: id,
      redirect_uri: redirectUri,
      scope: "read:user user:email",
      state,
    });
    res.redirect(`https://github.com/login/oauth/authorize?${q}`);
  });

  app.get("/api/auth/github/callback", async (req, res) => {
    if (!p) return res.status(500).send("Database not configured");
    const secret = process.env.GITHUB_CLIENT_SECRET?.trim();
    const id = process.env.GITHUB_CLIENT_ID?.trim();
    if (!secret || !id) return res.status(500).send("GitHub OAuth not configured");

    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const cookieState = req.cookies?.oauth_state;
    const remember = req.cookies?.[OAUTH_REMEMBER_COOKIE] === "1";
    res.clearCookie("oauth_state", { path: "/" });
    res.clearCookie(OAUTH_REMEMBER_COOKIE, { path: "/" });
    if (!code || !state || state !== cookieState) {
      return res.status(400).send("Invalid OAuth state");
    }

    const redirectUri = `${publicBaseUrl(req)}/api/auth/github/callback`;
    try {
      const tokRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: id,
          client_secret: secret,
          code,
          redirect_uri: redirectUri,
        }),
      });
      const tokJson = (await tokRes.json()) as { access_token?: string; error?: string };
      if (!tokJson.access_token) {
        return res.status(400).send(tokJson.error || "GitHub token exchange failed");
      }
      const uRes = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${tokJson.access_token}`, Accept: "application/vnd.github+json" },
      });
      const gh = (await uRes.json()) as {
        id: number;
        email?: string | null;
        name?: string | null;
        avatar_url?: string | null;
        login?: string;
      };
      const providerUserId = String(gh.id);
      const email = gh.email || `${gh.login || "user"}@users.noreply.github.com`;
      const display = gh.name || gh.login || "GitHub User";

      const ins = await p.query(
        `INSERT INTO nebula_users (provider, provider_user_id, email, display_name, avatar_url)
         VALUES ('github', $1, $2, $3, $4)
         ON CONFLICT (provider, provider_user_id) DO UPDATE
         SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url
         RETURNING id`,
        [providerUserId, email, display, gh.avatar_url || null]
      );
      const userId = ins.rows[0].id as string;
      const token = signSession(userId);
      setSessionCookie(res, token, remember);

      res.send(oauthPopupHtml(true, "Signed in with GitHub"));
    } catch (e) {
      console.error("[nebula] GitHub callback:", e);
      res.status(500).send(oauthPopupHtml(false, "GitHub sign-in failed"));
    }
  });

  // --- Google OAuth ---
  app.get("/api/auth/google", (req, res) => {
    if (!p) return res.status(503).send("Database not configured (DATABASE_URL)");
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId) return res.status(503).send("GOOGLE_CLIENT_ID not configured");
    const redirectUri = `${publicBaseUrl(req)}/api/auth/google/callback`;
    const state = crypto.randomBytes(16).toString("hex");
    const remember = String(req.query.remember || "").toLowerCase() === "1" || String(req.query.remember || "").toLowerCase() === "true";
    res.cookie("oauth_state_google", state, { httpOnly: true, maxAge: 600000, path: "/", sameSite: "lax" });
    res.cookie(OAUTH_REMEMBER_COOKIE, remember ? "1" : "0", { httpOnly: true, maxAge: 600000, path: "/", sameSite: "lax" });
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    if (!p) return res.status(500).send("Database not configured");
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return res.status(500).send("Google OAuth not configured");

    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const cookieState = req.cookies?.oauth_state_google;
    const remember = req.cookies?.[OAUTH_REMEMBER_COOKIE] === "1";
    res.clearCookie("oauth_state_google", { path: "/" });
    res.clearCookie(OAUTH_REMEMBER_COOKIE, { path: "/" });
    if (!code || !state || state !== cookieState) {
      return res.status(400).send("Invalid OAuth state");
    }

    const redirectUri = `${publicBaseUrl(req)}/api/auth/google/callback`;
    try {
      const tokRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const tokJson = (await tokRes.json()) as { access_token?: string; error?: string };
      if (!tokJson.access_token) {
        return res.status(400).send(tokJson.error || "Google token exchange failed");
      }
      const uRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokJson.access_token}` },
      });
      const g = (await uRes.json()) as { sub: string; email?: string; name?: string; picture?: string };
      const providerUserId = g.sub;
      const email = g.email || "unknown@google.local";

      const ins = await p.query(
        `INSERT INTO nebula_users (provider, provider_user_id, email, display_name, avatar_url)
         VALUES ('google', $1, $2, $3, $4)
         ON CONFLICT (provider, provider_user_id) DO UPDATE
         SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url
         RETURNING id`,
        [providerUserId, email, g.name || "Google User", g.picture || null]
      );
      const userId = ins.rows[0].id as string;
      const token = signSession(userId);
      setSessionCookie(res, token, remember);

      res.send(oauthPopupHtml(true, "Signed in with Google"));
    } catch (e) {
      console.error("[nebula] Google callback:", e);
      res.status(500).send(oauthPopupHtml(false, "Google sign-in failed"));
    }
  });

  // --- Projects API ---
  app.get("/api/projects", async (req, res) => {
    const uid = readSession(req);
    if (!uid || !p) return res.status(401).json({ error: "Unauthorized" });
    const oneName = typeof req.query.name === "string" ? req.query.name.trim() : "";
    try {
      if (oneName) {
        const r = await p.query(
          `SELECT name, pages, edges, updated_at FROM nebula_projects WHERE user_id = $1 AND name = $2`,
          [uid, oneName]
        );
        return res.json({ projects: r.rows, project: r.rows[0] || null });
      }
      const r = await p.query(
        `SELECT name, pages, edges, updated_at FROM nebula_projects WHERE user_id = $1 ORDER BY updated_at DESC`,
        [uid]
      );
      res.json({ projects: r.rows });
    } catch (e) {
      console.error("[nebula] GET /api/projects:", e);
      res.status(500).json({ error: "Failed to list projects" });
    }
  });

  app.post("/api/projects", async (req, res) => {
    const uid = readSession(req);
    if (!uid || !p) return res.status(401).json({ error: "Unauthorized" });
    const { name, pages, edges } = req.body || {};
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    try {
      await p.query(
        `INSERT INTO nebula_projects (user_id, name, pages, edges, updated_at)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
         ON CONFLICT (user_id, name) DO UPDATE
         SET pages = EXCLUDED.pages, edges = EXCLUDED.edges, updated_at = NOW()
         RETURNING name, pages, edges, updated_at`,
        [uid, name.trim(), JSON.stringify(pages ?? []), JSON.stringify(edges ?? [])]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error("[nebula] POST /api/projects:", e);
      res.status(500).json({ error: "Failed to save project" });
    }
  });

  app.delete("/api/projects/:name", async (req, res) => {
    const uid = readSession(req);
    if (!uid || !p) return res.status(401).json({ error: "Unauthorized" });
    const name = req.params.name;
    if (!name) return res.status(400).json({ error: "name required" });
    try {
      await p.query(`DELETE FROM nebula_projects WHERE user_id = $1 AND name = $2`, [uid, name]);
      res.json({ ok: true });
    } catch (e) {
      console.error("[nebula] DELETE /api/projects:", e);
      res.status(500).json({ error: "Failed to delete project" });
    }
  });
}

function oauthPopupHtml(ok: boolean, message: string): string {
  const safe = message.replace(/</g, "&lt;");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${ok ? "OK" : "Error"}</title></head>
<body style="font-family:system-ui;background:#040f1a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
<div style="text-align:center;max-width:360px;padding:2rem;">
<p>${safe}</p>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
    setTimeout(function(){ window.close(); }, 800);
  } else {
    setTimeout(function(){ window.location.href = '/'; }, 1200);
  }
</script>
</div></body></html>`;
}
