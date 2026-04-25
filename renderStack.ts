/**
 * Render-first backend: PostgreSQL (Render) + cookie sessions + email/password + GitHub OAuth.
 * Mount with mountRenderStack(app) from server.ts.
 */

import type { Express, Request, Response } from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import pg from "pg";
import crypto from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(crypto.scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  try {
    const derived = (await scryptAsync(password, salt, 64)) as Buffer;
    const expected = Buffer.from(hashHex, "hex");
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const t = email.trim().toLowerCase();
  if (!t || t.length > 254 || !EMAIL_RE.test(t)) return null;
  return t;
}

function validateNewPassword(password: unknown): string | null {
  if (typeof password !== "string") return "Password is required.";
  if (!password.length) return "Password is required.";
  if (password.length > 128) return "Password is too long.";
  return null;
}

async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim() || "onboarding@resend.dev";
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[nebula] Password reset link (set RESEND_API_KEY to email users in production):", resetUrl);
    }
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "Reset your nebulla password",
        html: `<p>We received a request to reset your nebulla password.</p><p><a href="${resetUrl.replace(/"/g, "&quot;")}">Set a new password</a> (link expires in one hour).</p><p>If you did not request this, you can ignore this email.</p>`,
      }),
    });
    if (!res.ok) {
      console.error("[nebula] Resend failed:", await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[nebula] Resend error:", e);
    return false;
  }
}

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
  const db = Boolean(process.env.DATABASE_URL?.trim());
  return {
    cloudStorageReady: db,
    emailAuthReady: db,
    githubOAuthReady: Boolean(
      process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim()
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
  await p.query(`ALTER TABLE nebula_projects ADD COLUMN IF NOT EXISTS workspace_id TEXT;`);
  await p.query(`
    CREATE TABLE IF NOT EXISTS nebula_client_workspaces (
      user_id UUID PRIMARY KEY REFERENCES nebula_users(id) ON DELETE CASCADE,
      email TEXT,
      workspace_id TEXT NOT NULL UNIQUE,
      workspace_name TEXT NOT NULL,
      render_payload JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await p.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_nebula_client_workspaces_email_lower
     ON nebula_client_workspaces (LOWER(email))
     WHERE email IS NOT NULL;`
  );
  await p.query(`ALTER TABLE nebula_users ADD COLUMN IF NOT EXISTS password_hash TEXT;`);
  await p.query(`
    CREATE TABLE IF NOT EXISTS nebula_password_resets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES nebula_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await p.query(
    `CREATE INDEX IF NOT EXISTS idx_nebula_pw_reset_token ON nebula_password_resets(token_hash);`
  );
  await p.query(
    `CREATE INDEX IF NOT EXISTS idx_nebula_pw_reset_expires ON nebula_password_resets(expires_at);`
  );
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

function requestDerivedBaseUrl(req: Request): string | null {
  const forwardedHost = (req.get("x-forwarded-host") || "").split(",")[0]?.trim();
  const host = (req.get("host") || "").trim();
  const finalHost = forwardedHost || host;
  const forwardedProto = (req.get("x-forwarded-proto") || "").split(",")[0]?.trim();
  const proto = forwardedProto || (req.protocol === "https" ? "https" : "http");
  if (finalHost) return `${proto}://${finalHost}`.replace(/\/$/, "");
  return null;
}

function publicBaseUrl(req: Request): string {
  // Admin-configured canonical origin (emails, production SPA links).
  const explicit = process.env.PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const fromReq = requestDerivedBaseUrl(req);
  if (fromReq) return fromReq;

  return `http://localhost:${process.env.PORT || 3000}`;
}

/** GitHub redirect_uri must match the host the user actually hit (local dev vs Render). */
function githubOAuthRedirectBase(req: Request): string {
  if (process.env.NODE_ENV !== "production") {
    const fromReq = requestDerivedBaseUrl(req);
    if (fromReq) return fromReq;
    return `http://localhost:${process.env.PORT || 3000}`;
  }
  return publicBaseUrl(req);
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

function normalizeWorkspaceNameFromEmail(email: string): string {
  const local = email.split("@")[0] || "client";
  const cleaned = local.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `nebula-${cleaned || "client"}`.slice(0, 63);
}

async function createRenderWorkspace(workspaceName: string): Promise<{ id: string; name: string; raw: unknown }> {
  const renderApiKey = process.env.RENDER_API_KEY?.trim();
  if (!renderApiKey) {
    throw new Error("RENDER_API_KEY is not configured.");
  }
  const baseUrl = (process.env.RENDER_API_BASE_URL || "https://api.render.com/v1").replace(/\/$/, "");
  const renderRes = await fetch(`${baseUrl}/workspaces`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${renderApiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ name: workspaceName }),
  });
  if (!renderRes.ok) {
    const errorText = await renderRes.text();
    throw new Error(`Render workspace creation failed: ${errorText.slice(0, 300)}`);
  }
  const payload: any = await renderRes.json();
  const workspaceId =
    payload?.id || payload?.workspace?.id || payload?.workspaceId || payload?.workspace_id || null;
  if (!workspaceId) throw new Error("Render response did not include a workspace ID.");
  return {
    id: String(workspaceId),
    name: payload?.name || payload?.workspace?.name || workspaceName,
    raw: payload,
  };
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

  const ensureWorkspaceForUser = async (uid: string): Promise<{ id: string; name: string }> => {
    if (!p) throw new Error("Database not configured");
    const userRes = await p.query(`SELECT email FROM nebula_users WHERE id = $1`, [uid]);
    const userRow = userRes.rows[0] as { email: string | null } | undefined;
    if (!userRow?.email) throw new Error("User email is required to provision workspace.");
    const normalizedEmail = normalizeEmail(userRow.email);
    if (!normalizedEmail) throw new Error("User email is invalid for workspace provisioning.");

    const existingByUser = await p.query(
      `SELECT workspace_id, workspace_name FROM nebula_client_workspaces WHERE user_id = $1`,
      [uid]
    );
    const byUser = existingByUser.rows[0] as { workspace_id: string; workspace_name: string } | undefined;
    if (byUser?.workspace_id) {
      await p.query(`UPDATE nebula_projects SET workspace_id = $2 WHERE user_id = $1`, [uid, byUser.workspace_id]);
      return { id: byUser.workspace_id, name: byUser.workspace_name };
    }

    const existingByEmail = await p.query(
      `SELECT user_id, workspace_id, workspace_name
       FROM nebula_client_workspaces
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [normalizedEmail]
    );
    const byEmail = existingByEmail.rows[0] as
      | { user_id: string; workspace_id: string; workspace_name: string }
      | undefined;
    if (byEmail?.workspace_id) {
      if (byEmail.user_id !== uid) {
        await p.query(
          `UPDATE nebula_client_workspaces
           SET user_id = $1, email = $2, updated_at = NOW()
           WHERE user_id = $3`,
          [uid, normalizedEmail, byEmail.user_id]
        );
      }
      await p.query(`UPDATE nebula_projects SET workspace_id = $2 WHERE user_id = $1`, [uid, byEmail.workspace_id]);
      return { id: byEmail.workspace_id, name: byEmail.workspace_name };
    }

    const workspaceName = normalizeWorkspaceNameFromEmail(normalizedEmail);
    const created = await createRenderWorkspace(workspaceName);
    await p.query(
      `INSERT INTO nebula_client_workspaces (user_id, email, workspace_id, workspace_name, render_payload, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET email = EXCLUDED.email,
           workspace_id = EXCLUDED.workspace_id,
           workspace_name = EXCLUDED.workspace_name,
           render_payload = EXCLUDED.render_payload,
           updated_at = NOW()`,
      [uid, normalizedEmail, created.id, created.name, JSON.stringify(created.raw ?? {})]
    );
    await p.query(`UPDATE nebula_projects SET workspace_id = $2 WHERE user_id = $1`, [uid, created.id]);
    return { id: created.id, name: created.name };
  };

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

  const githubApiHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "Nebulla-OAuth/1.0",
  });

  // --- GitHub OAuth (any GitHub account — use a standard OAuth App, not org-locked SSO-only flows) ---
  app.get("/api/auth/github", (req, res) => {
    if (!p) return res.status(503).send("Database not configured (DATABASE_URL)");
    const id = process.env.GITHUB_CLIENT_ID?.trim();
    if (!id) return res.status(503).send("GITHUB_CLIENT_ID not configured");
    const redirectUri = `${githubOAuthRedirectBase(req)}/api/auth/github/callback`;
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

    const redirectUri = `${githubOAuthRedirectBase(req)}/api/auth/github/callback`;
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
      const ghAccessToken = tokJson.access_token;
      const uRes = await fetch("https://api.github.com/user", {
        headers: githubApiHeaders(ghAccessToken),
      });
      const gh = (await uRes.json()) as {
        id: number;
        email?: string | null;
        name?: string | null;
        avatar_url?: string | null;
        login?: string;
      };
      const providerUserId = String(gh.id);
      let email = (gh.email && String(gh.email).trim()) || "";
      if (!email) {
        const emRes = await fetch("https://api.github.com/user/emails", {
          headers: githubApiHeaders(ghAccessToken),
        });
        const list = (await emRes.json()) as { email?: string; primary?: boolean; verified?: boolean }[];
        if (Array.isArray(list)) {
          const primary = list.find((e) => e.primary && e.email);
          const verified = list.find((e) => e.verified && e.email);
          const any = list.find((e) => e.email);
          email = (primary?.email || verified?.email || any?.email || "").trim();
        }
      }
      if (!email) {
        email = `${gh.login || "user"}@users.noreply.github.com`;
      }
      const display = gh.name || gh.login || "GitHub User";

      const ins = await p.query(
        `INSERT INTO nebula_users (provider, provider_user_id, email, display_name, avatar_url, password_hash)
         VALUES ('github', $1, $2, $3, $4, NULL)
         ON CONFLICT (provider, provider_user_id) DO UPDATE
         SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url
         RETURNING id`,
        [providerUserId, email, display, gh.avatar_url || null]
      );
      const userId = ins.rows[0].id as string;
      await ensureWorkspaceForUser(userId);
      const sessionJwt = signSession(userId);
      setSessionCookie(res, sessionJwt, remember);

      res.send(oauthPopupHtml(true, "Signed in with GitHub"));
    } catch (e) {
      console.error("[nebula] GitHub callback:", e);
      res.status(500).send(oauthPopupHtml(false, "GitHub sign-in failed"));
    }
  });

  // --- Email + password ---
  app.post("/api/auth/register", async (req, res) => {
    if (!p) return res.status(503).json({ error: "Database not configured" });
    const email = normalizeEmail(req.body?.email);
    const pwErr = validateNewPassword(req.body?.password);
    const remember = Boolean(req.body?.remember);
    if (!email) return res.status(400).json({ error: "Valid email is required." });
    if (pwErr) return res.status(400).json({ error: pwErr });
    const password = req.body.password as string;
    const display =
      email.split("@")[0].slice(0, 80).replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "User";
    try {
      const hash = await hashPassword(password);
      const ins = await p.query(
        `INSERT INTO nebula_users (provider, provider_user_id, email, display_name, avatar_url, password_hash)
         VALUES ('email', $1, $2, $3, NULL, $4)
         RETURNING id`,
        [email, email, display, hash]
      );
      const userId = ins.rows[0].id as string;
      await ensureWorkspaceForUser(userId);
      setSessionCookie(res, signSession(userId), remember);
      return res.json({ ok: true });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code === "23505") {
        return res.status(409).json({ error: "An account with this email already exists." });
      }
      console.error("[nebula] register:", e);
      return res.status(500).json({ error: "Registration failed." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    if (!p) return res.status(503).json({ error: "Database not configured" });
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const remember = Boolean(req.body?.remember);
    if (!email || typeof password !== "string") {
      return res.status(400).json({ error: "Email and password are required." });
    }
    try {
      const r = await p.query(
        `SELECT id, password_hash FROM nebula_users WHERE provider = 'email' AND provider_user_id = $1`,
        [email]
      );
      const row = r.rows[0] as { id: string; password_hash: string | null } | undefined;
      if (!row?.password_hash || !(await verifyPassword(password, row.password_hash))) {
        return res.status(401).json({ error: "Invalid email or password." });
      }
      await ensureWorkspaceForUser(row.id);
      setSessionCookie(res, signSession(row.id), remember);
      return res.json({ ok: true });
    } catch (e) {
      console.error("[nebula] login:", e);
      return res.status(500).json({ error: "Login failed." });
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    if (!p) return res.status(503).json({ error: "Database not configured" });
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: "Valid email is required." });
    try {
      const r = await p.query(`SELECT id FROM nebula_users WHERE provider = 'email' AND provider_user_id = $1`, [
        email,
      ]);
      const row = r.rows[0] as { id: string } | undefined;
      if (row) {
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = hashResetToken(rawToken);
        const expires = new Date(Date.now() + 60 * 60 * 1000);
        await p.query(`DELETE FROM nebula_password_resets WHERE user_id = $1 AND used_at IS NULL`, [row.id]);
        await p.query(
          `INSERT INTO nebula_password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
          [row.id, tokenHash, expires.toISOString()]
        );
        const base = publicBaseUrl(req);
        const resetUrl = `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
        await sendPasswordResetEmail(email, resetUrl);
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error("[nebula] forgot-password:", e);
      return res.status(500).json({ error: "Request failed." });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    if (!p) return res.status(503).json({ error: "Database not configured" });
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const pwErr = validateNewPassword(req.body?.password);
    if (!token || token.length < 20) return res.status(400).json({ error: "Invalid or missing reset token." });
    if (pwErr) return res.status(400).json({ error: pwErr });
    const password = req.body.password as string;
    const tokenHash = hashResetToken(token);
    try {
      const r = await p.query(
        `SELECT id, user_id FROM nebula_password_resets
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
        [tokenHash]
      );
      const row = r.rows[0] as { id: string; user_id: string } | undefined;
      if (!row) {
        return res.status(400).json({ error: "This reset link is invalid or has expired. Request a new one." });
      }
      const hash = await hashPassword(password);
      await p.query(`UPDATE nebula_users SET password_hash = $1 WHERE id = $2 AND provider = 'email'`, [
        hash,
        row.user_id,
      ]);
      await p.query(`UPDATE nebula_password_resets SET used_at = NOW() WHERE id = $1`, [row.id]);
      await p.query(`DELETE FROM nebula_password_resets WHERE user_id = $1 AND id <> $2`, [row.user_id, row.id]);
      return res.json({ ok: true });
    } catch (e) {
      console.error("[nebula] reset-password:", e);
      return res.status(500).json({ error: "Password reset failed." });
    }
  });

  // --- Projects API ---
  app.get("/api/projects", async (req, res) => {
    const uid = readSession(req);
    if (!uid || !p) return res.status(401).json({ error: "Unauthorized" });
    const oneName = typeof req.query.name === "string" ? req.query.name.trim() : "";
    try {
      await ensureWorkspaceForUser(uid);
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
      const workspace = await ensureWorkspaceForUser(uid);
      await p.query(
        `INSERT INTO nebula_projects (user_id, name, pages, edges, workspace_id, updated_at)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, NOW())
         ON CONFLICT (user_id, name) DO UPDATE
         SET pages = EXCLUDED.pages, edges = EXCLUDED.edges, workspace_id = EXCLUDED.workspace_id, updated_at = NOW()
         RETURNING name, pages, edges, updated_at`,
        [uid, name.trim(), JSON.stringify(pages ?? []), JSON.stringify(edges ?? []), workspace.id]
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
