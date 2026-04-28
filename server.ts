import dotenv from "dotenv";
import path from "path";
import express from "express";
import fs from "fs";
import { exec, execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
import {
  appendConversationTurn,
  appendWriterAuditEvent,
  buildMemorySystemContent,
  injectMemoryIntoMessages,
} from "./conversationLog";
import {
  initGuardianProcessHandlers,
  registerGuardianRoutes,
  guardianExpressErrorHandler,
  captureError,
} from "./guardian/nebulaGuardian";
import { mountRenderStack, getRenderPublicConfig } from "./renderStack";
import {
  resolvePencilApiKey,
  resolvePencilMockupsUrl,
  useBundledDemoMockupWithoutKey,
  loadBundledDemoMockupSvg,
  buildNebulaUiStudioPromptBody,
  callPencilMockupsGenerate,
} from "./lib/nebulaPencilDev";
import {
  callGrokGenerateUiSvg,
  heuristicSvgEditRisks,
  callGrokAnalyzeSvgEdit,
  callGrokAdaptUserSvg,
} from "./lib/nebulaUiStudioGrok";
import { getNebullaPersistRoot, getNebulaProjectDocsRoot } from "./lib/nebulaWorkspaceRoot";

const REPO_ROOT = getNebullaPersistRoot();
const NEBULA_PROJECT_ROOT = getNebulaProjectDocsRoot(REPO_ROOT);

dotenv.config({ path: path.join(REPO_ROOT, ".env") });

export const app = express();
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  initGuardianProcessHandlers();

  // Behind Railway / Render / Fly / nginx / Docker — correct client IPs and secure cookies.
  app.set("trust proxy", 1);

  app.use(express.json({ limit: '50mb' }) as any);
  app.use(express.urlencoded({ extended: true, limit: '50mb' }) as any);

  await mountRenderStack(app);

  // LOGGING MIDDLEWARE
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/config", (req, res) => {
    const grok = process.env.GROK_API_KEY?.trim() ?? "";
    const tts = process.env.GROK_TTS_NEW_API_KEY?.trim() ?? "";
    const writer = process.env.GROK_3_API_KEY?.trim() ?? "";
    const render = getRenderPublicConfig();
    const publicSiteUrl = process.env.PUBLIC_SITE_URL?.trim() || "";
    const pencilKey = resolvePencilApiKey();
    res.json({
      ...render,
      publicSiteUrl,
      githubClientId: process.env.GITHUB_CLIENT_ID || process.env.github_client_id,
      builderPublicKey: process.env.BUILDER_PUBLIC_KEY,
      hasGrokApiKey: grok.length >= 20,
      hasGrokTtsKey: tts.length >= 20,
      hasGrokWriterKey: writer.length >= 20,
      pencilMockupsReady: Boolean(pencilKey),
      nebulaUiStudioDemo: Boolean(!pencilKey && useBundledDemoMockupWithoutKey()),
    });
  });

  // Master Plan Update Logic (Clean JSON-based storage)
  const masterPlanPath = path.join(NEBULA_PROJECT_ROOT, "master-plan.json");
  const nebulaUiStudioPath = path.join(NEBULA_PROJECT_ROOT, "nebula-sysh-ui-sysh-studio.md");
  /** On-disk folder for approved UI exports (alongside the markdown manifest). */
  const nebulaUiStudioOutputDir = path.join(NEBULA_PROJECT_ROOT, "nebulla-sysh-ui-sysh-studio");

  const resolveNebullaGrokKeyForReq = (req: express.Request): string | undefined => {
    const headerKey =
      typeof req.headers["x-grok-api-key"] === "string" ? req.headers["x-grok-api-key"].trim() : "";
    if (headerKey.length >= 20) return headerKey;
    const bodyKey =
      typeof (req.body as { grokApiKey?: unknown })?.grokApiKey === "string"
        ? String((req.body as { grokApiKey?: string }).grokApiKey).trim()
        : "";
    if (bodyKey.length >= 20) return bodyKey;
    const envKey = process.env.GROK_API_KEY?.trim() ?? "";
    if (envKey.length >= 20) return envKey;
    return undefined;
  };

  const readSkillDesignSystemExcerpt = (): string => {
    const skillPath = fs.existsSync(path.join(NEBULA_PROJECT_ROOT, "SKILL.md"))
      ? path.join(NEBULA_PROJECT_ROOT, "SKILL.md")
      : path.join(REPO_ROOT, "SKILL.md");
    if (!fs.existsSync(skillPath)) return "";
    try {
      let raw = fs.readFileSync(skillPath, "utf8").replace(/^---[\s\S]*?---\s*/m, "").trim();
      if (raw.length > 14000) raw = `${raw.slice(0, 14000)}\n…`;
      return raw;
    } catch {
      return "";
    }
  };

  const ensureNebulaUiStudioFile = () => {
    if (!fs.existsSync(nebulaUiStudioPath)) {
      fs.writeFileSync(
        nebulaUiStudioPath,
        `<!--
NEBULA_UI_STUDIO_PROMPT
No prompt generated yet.
-->

<!--
NEBULA_UI_STUDIO_CODE
No approved UI code yet.
-->
`,
        "utf8"
      );
    }
  };

  const extractNebulaCommentSection = (
    content: string,
    key: "NEBULA_UI_STUDIO_PROMPT" | "NEBULA_UI_STUDIO_CODE"
  ): string => {
    const re = new RegExp(`<!--\\s*${key}\\n([\\s\\S]*?)-->`, "m");
    const match = content.match(re);
    return match?.[1]?.trim() || "";
  };

  const upsertNebulaCommentSection = (
    content: string,
    key: "NEBULA_UI_STUDIO_PROMPT" | "NEBULA_UI_STUDIO_CODE",
    value: string
  ): string => {
    const normalized = value.trim() || (key === "NEBULA_UI_STUDIO_PROMPT" ? "No prompt generated yet." : "No approved UI code yet.");
    const section = `<!--\n${key}\n${normalized}\n-->`;
    const re = new RegExp(`<!--\\s*${key}[\\s\\S]*?-->`, "m");
    if (re.test(content)) return content.replace(re, section);
    return `${section}\n\n${content}`;
  };

  ensureNebulaUiStudioFile();

  app.get("/api/master-plan/read", (req, res) => {
    try {
      if (!fs.existsSync(masterPlanPath)) {
        return res.status(404).json({ error: "Master plan data not found" });
      }
      const plan = JSON.parse(fs.readFileSync(masterPlanPath, "utf8"));
      res.json(plan);
    } catch (error) {
      console.error("Error reading master plan:", error);
      res.status(500).json({ error: "Failed to read master plan" });
    }
  });

  app.post("/api/master-plan/update", (req, res) => {
    const { tabIndex, content } = req.body;
    if (tabIndex === undefined || content === undefined) {
      return res.status(400).json({ error: "tabIndex and content are required" });
    }

    const tabNames: Record<number, string> = {
      1: "1. Goal of the app",
      2: "2. Tech Research",
      3: "3. Features and KPIs",
      4: "4. Pages and navigation",
      5: "5. UI/UX design",
      6: "6. Environment Setup"
    };

    const tabName = tabNames[tabIndex as number];
    if (!tabName) {
      return res.status(400).json({ error: "Invalid tabIndex. Must be 1-6." });
    }

    try {
      let plan = {};
      if (fs.existsSync(masterPlanPath)) {
        plan = JSON.parse(fs.readFileSync(masterPlanPath, "utf8"));
      }
      
      // Update the specific tab content using mapped tabName as key
      (plan as any)[tabName] = content;

      fs.writeFileSync(masterPlanPath, JSON.stringify(plan, null, 2), "utf8");
      res.json({ success: true, tabName });
    } catch (error) {
      console.error("Error updating master plan:", error);
      res.status(500).json({ error: "Failed to update master plan" });
    }
  });

  // Silent Writer Endpoint
  app.post("/api/write-spec", (req, res) => {
    const { content } = req.body;
    const specPath = path.join(NEBULA_PROJECT_ROOT, "Nebula Architecture Spec.md");
    try {
      fs.writeFileSync(specPath, content, "utf8");
      res.json({ success: true });
    } catch (error) {
      console.error("Error writing spec:", error);
      res.status(500).json({ error: "Failed to write spec" });
    }
  });

  // Example backend function: read file system
  app.get("/api/fs/list", (req, res) => {
    try {
      const pathParam = req.query.path as string || ".";
      const targetDir = path.resolve(REPO_ROOT, pathParam);
      
      // Security: Ensure the target directory is within the project root
      if (!targetDir.startsWith(REPO_ROOT)) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!fs.existsSync(targetDir)) {
        return res.status(404).json({ error: "Directory not found" });
      }

      const nebulaInternal = new Set([
        'node_modules', 'dist', '.git', '.github', 'index.ts', 'README.md',
        'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.node.json',
        'vite.config.ts', 'postcss.config.js', 'tailwind.config.js', 'components.json',
        'metadata.json', 'server.ts', '.env.example', 'firebase-applet-config.json',
        'master-plan.json', 'Nebula Architecture Spec.md', 'index.html', 'src', 'public',
        'firebase-blueprint.json', 'firestore.rules', 'DRAFT_firestore.rules',
        '.gitignore', 'nebula-ui-studio.md', 'nebula-sysh-ui-sysh-studio.md', 'guardian'
      ]);

      const items = fs.readdirSync(targetDir, { withFileTypes: true });
      const files = items
        .filter(item => {
          const isHidden = item.name.startsWith('.');
          const isInternal = nebulaInternal.has(item.name);
          return !isHidden && !isInternal;
        })
        .map(item => ({
          name: item.name,
          isDirectory: item.isDirectory()
        }))
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });

      res.json({ files });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/files/content", (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) return res.status(400).json({ error: "Path is required" });

      const targetFile = path.resolve(REPO_ROOT, filePath);
      
      // Security: Ensure the target file is within the project root
      if (!targetFile.startsWith(REPO_ROOT)) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!fs.existsSync(targetFile) || fs.statSync(targetFile).isDirectory()) {
        return res.status(404).json({ error: "File not found" });
      }

      const content = fs.readFileSync(targetFile, "utf8");
      res.json({ content });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/files/apply-generated", (req, res) => {
    try {
      const raw = typeof req.body?.content === "string" ? req.body.content : "";
      if (!raw.trim()) return res.status(400).json({ error: "content is required" });

      type FileBlock = { relativePath: string; body: string };
      const blocks: FileBlock[] = [];

      const addBlock = (p: string, b: string) => {
        const cleanedPath = p.trim().replace(/^["'`]+|["'`]+$/g, "").replace(/^\.\/+/, "");
        if (!cleanedPath) return;
        blocks.push({ relativePath: cleanedPath, body: b.replace(/\r\n/g, "\n") });
      };

      // Pattern 1: ```file:path/to/file.ext ... ```
      const reInline = /```(?:file|filepath)\s*:\s*([^\n`]+)\n([\s\S]*?)```/gi;
      let m1: RegExpExecArray | null;
      while ((m1 = reInline.exec(raw)) !== null) addBlock(m1[1], m1[2]);

      // Pattern 2: File: path/to/file.ext \n ```lang ... ```
      const reHeader = /(?:^|\n)\s*(?:File|FILE)\s*:\s*([^\n]+)\n```[^\n]*\n([\s\S]*?)```/g;
      let m2: RegExpExecArray | null;
      while ((m2 = reHeader.exec(raw)) !== null) addBlock(m2[1], m2[2]);

      if (blocks.length === 0) {
        return res.status(422).json({
          error:
            "No file blocks found. Expected format: ```file:path/to/file.ext ...``` or `File: path` followed by fenced code.",
        });
      }

      const deny = /(^|\/)\.git(\/|$)|(^|\/)\.cursor(\/|$)|(^|\/)node_modules(\/|$)/i;
      const written: string[] = [];
      const skipped: string[] = [];
      const seen = new Set<string>();

      for (const b of blocks) {
        if (seen.has(b.relativePath)) continue;
        seen.add(b.relativePath);

        if (deny.test(b.relativePath) || b.relativePath.includes("..")) {
          skipped.push(b.relativePath);
          continue;
        }
        const target = path.resolve(REPO_ROOT, b.relativePath);
        if (!target.startsWith(REPO_ROOT)) {
          skipped.push(b.relativePath);
          continue;
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, b.body, "utf8");
        written.push(b.relativePath);
      }

      res.json({ success: true, written, skipped, parsedBlocks: blocks.length });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to apply generated files" });
    }
  });

  /** Default app scaffold under nebula-project (pages, packages, Vite-style stubs). Idempotent. */
  function ensureNebulaWorkspaceScaffold(): { rootRelative: string; created: string[] } {
    const created: string[] = [];
    const base = path.join(NEBULA_PROJECT_ROOT, "workspace");
    const mkdir = (abs: string) => {
      if (!fs.existsSync(abs)) {
        fs.mkdirSync(abs, { recursive: true });
        created.push(path.relative(REPO_ROOT, abs).replace(/\\/g, "/"));
      }
    };
    const writeIfMissing = (relFromRepo: string, content: string) => {
      const abs = path.join(REPO_ROOT, relFromRepo);
      mkdir(path.dirname(abs));
      if (!fs.existsSync(abs)) {
        fs.writeFileSync(abs, content, "utf8");
        created.push(relFromRepo.replace(/\\/g, "/"));
      }
    };

    mkdir(base);
    mkdir(path.join(base, "src"));
    mkdir(path.join(base, "pages"));
    mkdir(path.join(base, "packages"));

    const rootRel = "nebula-project/workspace";
    writeIfMissing(
      `${rootRel}/index.html`,
      `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title></title>
</head>
<body></body>
</html>
`
    );
    writeIfMissing(
      `${rootRel}/package.json`,
      `{
  "name": "workspace",
  "private": true,
  "version": "0.0.0"
}
`
    );
    writeIfMissing(
      `${rootRel}/vite.config.ts`,
      `import { defineConfig } from "vite";

export default defineConfig({});
`
    );
    writeIfMissing(`${rootRel}/server.ts`, ``);
    writeIfMissing(`${rootRel}/SKILL.md`, ``);
    writeIfMissing(`${rootRel}/src/main.ts`, ``);
    writeIfMissing(
      `${rootRel}/pages/index.html`,
      `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title></title></head>
<body></body>
</html>
`
    );
    writeIfMissing(`${rootRel}/packages/.gitkeep`, ``);
    writeIfMissing(`${rootRel}/.env`, ``);

    return { rootRelative: rootRel, created };
  }

  function collectNebulaProjectFiles(): { relativePath: string; size: number; mtimeMs: number }[] {
    const out: { relativePath: string; size: number; mtimeMs: number }[] = [];
    /** Always list `nebula-project/` when present — never walk full REPO_ROOT if docs root fell back to cwd. */
    const root = path.join(REPO_ROOT, "nebula-project");
    if (!fs.existsSync(root)) return out;

    const stack: string[] = [root];
    while (stack.length > 0 && out.length < 500) {
      const dir = stack.pop()!;
      let dirents: fs.Dirent[];
      try {
        dirents = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const d of dirents) {
        if (d.name.startsWith(".")) continue;
        const abs = path.join(dir, d.name);
        if (d.isDirectory()) {
          stack.push(abs);
        } else {
          try {
            const st = fs.statSync(abs);
            const rel = path.relative(REPO_ROOT, abs).replace(/\\/g, "/");
            out.push({ relativePath: rel, size: st.size, mtimeMs: st.mtimeMs });
          } catch {
            /* skip */
          }
        }
      }
    }
    out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return out;
  }

  function parseGitPorcelain(stdout: string): { status: string; path: string }[] {
    const entries: { status: string; path: string }[] = [];
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      const status = line.slice(0, 2);
      let rest = line.slice(3);
      if (rest.startsWith('"') && rest.endsWith('"') && rest.length > 2) {
        rest = rest.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      }
      let filePath = rest.trim();
      if (filePath.includes(" -> ")) {
        filePath = filePath.split(" -> ").pop()!.trim();
      }
      entries.push({ status, path: filePath.replace(/\\/g, "/") });
    }
    return entries;
  }

  /** Git status + flat file list under nebula-project (for IDE Source Control). */
  app.get("/api/source-control/overview", async (_req, res) => {
    try {
      const scaffold = ensureNebulaWorkspaceScaffold();
      const nebulaFiles = collectNebulaProjectFiles();
      const nebulaProjectRelative = fs.existsSync(path.join(REPO_ROOT, "nebula-project"))
        ? "nebula-project"
        : path.relative(REPO_ROOT, NEBULA_PROJECT_ROOT).replace(/\\/g, "/") || ".";

      let git: {
        branch: string;
        entries: { status: string; path: string }[];
        error?: string;
      } | null = null;

      if (fs.existsSync(path.join(REPO_ROOT, ".git"))) {
        try {
          const { stdout: branchOut } = await execFileAsync(
            "git",
            ["-C", REPO_ROOT, "branch", "--show-current"],
            { maxBuffer: 1024 * 1024, encoding: "utf8" }
          );
          const { stdout: porcOut } = await execFileAsync(
            "git",
            ["-C", REPO_ROOT, "status", "--porcelain", "-u"],
            { maxBuffer: 10 * 1024 * 1024, encoding: "utf8" }
          );
          git = {
            branch: (branchOut || "unknown").trim() || "unknown",
            entries: parseGitPorcelain(porcOut || ""),
          };
        } catch (e) {
          git = {
            branch: "?",
            entries: [],
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }

      const scaffoldPrefix = `${scaffold.rootRelative.replace(/\/$/, "")}/`;
      const workspaceScaffoldFiles = nebulaFiles.filter((f) => f.relativePath.startsWith(scaffoldPrefix));

      res.json({
        nebulaProjectRoot: nebulaProjectRelative,
        nebulaFiles,
        git,
        workspaceScaffold: {
          rootRelative: scaffold.rootRelative,
          recentlyCreated: scaffold.created,
          files: workspaceScaffoldFiles,
        },
      });
    } catch (err: unknown) {
      console.error("/api/source-control/overview:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "overview failed" });
    }
  });

  // Example backend function: execute terminal command
  app.post("/api/terminal/exec", (req, res) => {
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ output: "No command provided" });
    }
    
    // Execute the command in the current working directory
    exec(command, { cwd: REPO_ROOT, timeout: 30000 }, (error, stdout, stderr) => {
      let output = "";
      if (stdout) output += stdout;
      if (stderr) output += stderr;
      
      if (error) {
        if (error.killed) {
          output += "\n[Error: Command timed out after 30 seconds]";
        } else if (!stdout && !stderr) {
          output += `\n[Error: ${error.message}]`;
        }
      }
      
      res.json({ output: output || "Command executed successfully with no output." });
    });
  });

  app.post("/api/render/deploy", async (_req, res) => {
    try {
      const renderApiKey = process.env.RENDER_API_KEY?.trim();
      const serviceId = process.env.RENDER_SERVICE_ID?.trim();
      const deployHookUrl = process.env.RENDER_DEPLOY_HOOK_URL?.trim();
      const baseUrl = (process.env.RENDER_API_BASE_URL || "https://api.render.com/v1").replace(/\/$/, "");

      if (serviceId && renderApiKey) {
        const r = await fetch(`${baseUrl}/services/${serviceId}/deploys`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${renderApiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        });
        const bodyText = await r.text();
        if (!r.ok) {
          return res.status(r.status).json({ error: `Render deploy failed: ${bodyText.slice(0, 300)}` });
        }
        let payload: any = {};
        try {
          payload = bodyText ? JSON.parse(bodyText) : {};
        } catch {
          payload = {};
        }
        const deployId = payload?.id || payload?.deploy?.id || payload?.deployId || null;
        const status = payload?.status || payload?.deploy?.status || "created";
        return res.json({
          ok: true,
          mode: "service-api",
          serviceId,
          deployId,
          status,
          raw: payload,
        });
      }

      if (deployHookUrl) {
        const r = await fetch(deployHookUrl, { method: "POST" });
        const bodyText = await r.text();
        if (!r.ok) {
          return res.status(r.status).json({ error: `Render deploy hook failed: ${bodyText.slice(0, 300)}` });
        }
        let payload: any = {};
        try {
          payload = bodyText ? JSON.parse(bodyText) : {};
        } catch {
          payload = {};
        }
        return res.json({
          ok: true,
          mode: "deploy-hook",
          status: "triggered",
          raw: payload,
        });
      }

      return res.status(503).json({
        error:
          "Render deploy is not configured. Set RENDER_SERVICE_ID + RENDER_API_KEY, or set RENDER_DEPLOY_HOOK_URL.",
      });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown Render deploy error",
      });
    }
  });

  app.get("/api/render/deploy/status", async (req, res) => {
    try {
      const deployId = typeof req.query.deployId === "string" ? req.query.deployId.trim() : "";
      if (!deployId) return res.status(400).json({ error: "deployId is required" });

      const renderApiKey = process.env.RENDER_API_KEY?.trim();
      const serviceId = process.env.RENDER_SERVICE_ID?.trim();
      if (!renderApiKey || !serviceId) {
        return res.status(503).json({ error: "RENDER_API_KEY and RENDER_SERVICE_ID are required for status polling" });
      }
      const baseUrl = (process.env.RENDER_API_BASE_URL || "https://api.render.com/v1").replace(/\/$/, "");
      const r = await fetch(`${baseUrl}/services/${serviceId}/deploys/${deployId}`, {
        headers: {
          Authorization: `Bearer ${renderApiKey}`,
          Accept: "application/json",
        },
      });
      const bodyText = await r.text();
      if (!r.ok) {
        return res.status(r.status).json({ error: `Render deploy status failed: ${bodyText.slice(0, 300)}` });
      }
      let payload: any = {};
      try {
        payload = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        payload = {};
      }
      const status =
        payload?.status ||
        payload?.deploy?.status ||
        payload?.state ||
        payload?.deploy?.state ||
        "unknown";
      const message =
        payload?.message ||
        payload?.deploy?.message ||
        payload?.error ||
        payload?.deploy?.error ||
        "";
      res.json({ ok: true, status, message, raw: payload });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown Render status polling error",
      });
    }
  });

  app.get("/auth/callback", (_req, res) => {
    res.redirect(302, "/");
  });

  app.post("/api/leads", (req, res) => {
    const { email, action } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });
    
    console.log(`[LEAD CAPTURED] Email: ${email}, Action: ${action}, Time: ${new Date().toISOString()}`);
    // In a real app, we would save this to a database
    res.json({ success: true });
  });

  // Stripe Integration (DISABLED until further notice)
  app.post("/api/create-checkout-session", (req, res) => {
    res.status(503).json({ 
      error: "Payments are currently disabled", 
      message: "Stripe integration is kept in the codebase but inactive per project settings." 
    });
  });

  app.post("/api/nebula-ui-studio/prompt", (req, res) => {
    const { prompt } = req.body || {};
    if (typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "prompt is required" });
    }
    try {
      ensureNebulaUiStudioFile();
      const existing = fs.readFileSync(nebulaUiStudioPath, "utf8");
      const withPrompt = upsertNebulaCommentSection(existing, "NEBULA_UI_STUDIO_PROMPT", prompt);
      const existingCode = extractNebulaCommentSection(withPrompt, "NEBULA_UI_STUDIO_CODE");
      const finalContent = upsertNebulaCommentSection(withPrompt, "NEBULA_UI_STUDIO_CODE", existingCode || "No approved UI code yet.");
      fs.writeFileSync(nebulaUiStudioPath, finalContent, "utf8");
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to save Nebula UI Studio prompt:", err);
      res.status(500).json({ error: "Failed to save prompt" });
    }
  });

  app.post("/api/nebula-ui-studio/generate", async (req, res) => {
    const { pagesText, branding } = req.body;
    const pencilKey = resolvePencilApiKey();
    const pencilUrl = resolvePencilMockupsUrl();
    const variationIndex = typeof req.body?.variationIndex === "number" ? req.body.variationIndex : 0;

    try {
      ensureNebulaUiStudioFile();
      const uiStudioFile = fs.readFileSync(nebulaUiStudioPath, "utf8");
      const storedPrompt = extractNebulaCommentSection(uiStudioFile, "NEBULA_UI_STUDIO_PROMPT");
      const skillExcerpt = readSkillDesignSystemExcerpt();

      const body = buildNebulaUiStudioPromptBody({
        storedPrompt,
        skillExcerpt,
        pagesText: typeof pagesText === "string" ? pagesText : "",
        branding,
      });
      const promptText = String((body as { prompt?: string }).prompt ?? "");

      const grokKey = resolveNebullaGrokKeyForReq(req);

      if (grokKey) {
        try {
          const { svg } = await callGrokGenerateUiSvg({
            apiKey: grokKey,
            fullPromptText: promptText,
            variationIndex,
          });
          return res.json({ svg, usedPrompt: storedPrompt || "", source: "grok-4" });
        } catch (grokErr) {
          console.warn("[nebula-ui-studio/generate] Grok failed, fallback if Pencil key:", grokErr);
          if (!pencilKey) {
            return res.status(502).json({
              error:
                grokErr instanceof Error ? grokErr.message : "Grok UI generation failed and no Pencil fallback is configured.",
            });
          }
        }
      }

      if (pencilKey) {
        const result = await callPencilMockupsGenerate({ apiKey: pencilKey, apiUrl: pencilUrl, body });
        if (result.ok === false) {
          console.error("Nebula UI Studio Engine Error:", result.error);
          return res.status(result.status).json({ error: result.error });
        }
        const raw = result.raw as Record<string, unknown>;
        return res.json({ ...raw, svg: result.svg, usedPrompt: storedPrompt || "", source: "pencil" });
      }

      if (useBundledDemoMockupWithoutKey()) {
        const svg = loadBundledDemoMockupSvg();
        return res.json({
          svg,
          demoMode: true,
          usedPrompt: storedPrompt || "",
          message:
            process.env.NODE_ENV === "production"
              ? "Bundled demo mockup. Set GROK_API_KEY (recommended) or PENCIL_API_KEY for live generation."
              : "Bundled demo mockup (dev). Set GROK_API_KEY or PENCIL_API_KEY for live output.",
          source: "demo",
        });
      }

      return res.status(500).json({
        error:
          "No generator available. Add GROK_API_KEY (Grok 4 UI) and/or PENCIL_API_KEY on the server, or set NEBULA_UI_STUDIO_DEMO=1 for bundled demo SVGs.",
      });
    } catch (error) {
      console.error("Error calling Nebula UI Studio engine:", error);
      captureError(error instanceof Error ? error : new Error(String(error)), {
        source: "server",
        route: "/api/nebula-ui-studio/generate",
      });
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to call Nebula UI Studio engine" });
    }
  });

  app.post("/api/nebula-ui-studio/analyze-edit", async (req, res) => {
    const { originalCode, editedCode } = req.body || {};
    if (typeof originalCode !== "string" || typeof editedCode !== "string") {
      return res.status(400).json({ error: "originalCode and editedCode strings are required" });
    }
    const grokKey = resolveNebullaGrokKeyForReq(req);
    const heuristic = heuristicSvgEditRisks(originalCode, editedCode);
    try {
      if (grokKey) {
        const ai = await callGrokAnalyzeSvgEdit({ apiKey: grokKey, originalCode, editedCode });
        const merged = [...new Set([...heuristic, ...ai.warnings])];
        return res.json({
          warnings: merged,
          summary: ai.summary,
          source: "grok+heuristic",
        });
      }
    } catch (e) {
      console.warn("[analyze-edit] Grok analysis failed, heuristic only:", e);
    }
    res.json({ warnings: heuristic, summary: "", source: "heuristic" });
  });

  app.post("/api/nebula-ui-studio/adapt-edit", async (req, res) => {
    const { editedCode, warningsSummary } = req.body || {};
    if (typeof editedCode !== "string" || !editedCode.trim()) {
      return res.status(400).json({ error: "editedCode is required" });
    }
    const grokKey = resolveNebullaGrokKeyForReq(req);
    if (!grokKey) {
      return res.status(400).json({ error: "Grok API key required to adapt SVG (server GROK_API_KEY or client key)." });
    }
    try {
      const { svg } = await callGrokAdaptUserSvg({
        apiKey: grokKey,
        editedCode,
        warningsSummary: typeof warningsSummary === "string" ? warningsSummary : "",
      });
      res.json({ svg });
    } catch (e) {
      console.error("[adapt-edit]", e);
      res.status(500).json({ error: e instanceof Error ? e.message : "Adapt failed" });
    }
  });

  app.post("/api/nebula-ui-studio/approve", (req, res) => {
    const { code } = req.body || {};
    if (typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ error: "code is required" });
    }
    try {
      ensureNebulaUiStudioFile();
      const existing = fs.readFileSync(nebulaUiStudioPath, "utf8");
      const promptText = extractNebulaCommentSection(existing, "NEBULA_UI_STUDIO_PROMPT") || "No prompt generated yet.";
      const withPrompt = upsertNebulaCommentSection(existing, "NEBULA_UI_STUDIO_PROMPT", promptText);
      const withCode = upsertNebulaCommentSection(withPrompt, "NEBULA_UI_STUDIO_CODE", code);
      fs.writeFileSync(nebulaUiStudioPath, withCode, "utf8");
      fs.mkdirSync(path.join(nebulaUiStudioOutputDir, "approved"), { recursive: true });
      fs.writeFileSync(path.join(nebulaUiStudioOutputDir, "approved", "approved-ui.svg"), code.trim(), "utf8");
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to save Nebula UI Studio code:", err);
      res.status(500).json({ error: "Failed to save approved code" });
    }
  });

  app.get("/api/nebula-ui-studio/code", (_req, res) => {
    try {
      ensureNebulaUiStudioFile();
      const existing = fs.readFileSync(nebulaUiStudioPath, "utf8");
      const code = extractNebulaCommentSection(existing, "NEBULA_UI_STUDIO_CODE");
      res.json({ code: code || "" });
    } catch (err) {
      console.error("Failed to read Nebula UI Studio code:", err);
      res.status(500).json({ error: "Failed to read Nebula UI Studio code" });
    }
  });

  const readWorkflowFileSafe = (relPath: string): string => {
    try {
      const fp = path.join(NEBULA_PROJECT_ROOT, relPath);
      if (!fs.existsSync(fp)) return `[missing] ${relPath}`;
      const raw = fs.readFileSync(fp, "utf8");
      return raw.length > 20000 ? `${raw.slice(0, 20000)}\n...[truncated]` : raw;
    } catch (e) {
      return `[error reading ${relPath}] ${e instanceof Error ? e.message : String(e)}`;
    }
  };

  const buildProjectWorkflowExecutionContext = (): string => {
    const order = [
      "project-execution-rules.md",
      "master-plan.json",
      "environment-setup.md",
      "nebula-sysh-ui-sysh-studio.md",
    ];
    return order.map((p) => `\n=== ${p} ===\n${readWorkflowFileSafe(p)}`).join("\n");
  };

  app.post("/api/grok/execute-project-rules", async (req, res) => {
    const { messages, grokApiKey: bodyGrokKey, userId, projectName } = req.body || {};
    const headerKey =
      typeof req.headers["x-grok-api-key"] === "string"
        ? req.headers["x-grok-api-key"].trim()
        : "";
    const apiKey =
      headerKey ||
      (typeof bodyGrokKey === "string" ? bodyGrokKey.trim() : "") ||
      process.env.GROK_API_KEY ||
      "";

    if (!apiKey) {
      return res.status(401).json({
        error:
          "Grok API key is missing. Add GROK_API_KEY to your .env file, restart the server, or save your key under Dashboard → Secrets (stored in this browser only).",
      });
    }
    if (apiKey.length < 20) {
      return res.status(400).json({
        error: "Your GROK_API_KEY appears to be invalid. Please check it in the Settings menu.",
      });
    }

    const convUserId =
      typeof userId === "string" && userId.trim() ? userId.trim() : "anonymous";
    const convProject =
      typeof projectName === "string" && projectName.trim() ? projectName.trim() : "Untitled Project";

    try {
      const workflowContext = buildProjectWorkflowExecutionContext();
      const memory = buildMemorySystemContent(convUserId, convProject);
      const incomingMessages: { role: string; content?: string }[] = Array.isArray(messages) ? messages : [];
      const baseMessages = injectMemoryIntoMessages(incomingMessages, memory);
      const executionSystemPrompt = `Execute project-execution-rules.md strictly (single orchestration file).
Read and follow this context in exact order:
${workflowContext}

Rules:
- Trigger source is Q1 approved.
- Start execution immediately; no extra confirmation.
- If coding should start now, include START_CODING in your response.
- Do not output generic planning chat.
- Never paste or restate the full "project-execution-rules.md" content in user-facing output.
- If producing <START_MASTERPLAN>, include only canonical tab content (sections 1..6), never orchestration policy text.`;

      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4-1-fast-reasoning",
          messages: [{ role: "system", content: executionSystemPrompt }, ...baseMessages.slice(-12)],
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: errorText });
      }
      const data = await response.json();
      return res.json(data);
    } catch (error) {
      console.error("Error running project execution rules:", error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to execute project rules",
      });
    }
  });

  const PRE_CODING_SUMMARY_KEY = "Pre-coding summary (Grok)";

  /** Go: Grok 4 writes a short summary into master-plan.json only, then Grok Code runs (no full execution doc in MP). */
  app.post("/api/grok/go-code", async (req, res) => {
    const { messages, grokApiKey: bodyGrokKey, userId, projectName, userNote } = req.body || {};
    const headerKey =
      typeof req.headers["x-grok-api-key"] === "string"
        ? req.headers["x-grok-api-key"].trim()
        : "";
    const apiKey =
      headerKey ||
      (typeof bodyGrokKey === "string" ? bodyGrokKey.trim() : "") ||
      process.env.GROK_API_KEY ||
      "";

    if (!apiKey) {
      return res.status(401).json({
        error:
          "Grok API key is missing. Add GROK_API_KEY to your .env file, restart the server, or save your key under Dashboard → Secrets (stored in this browser only).",
      });
    }
    if (apiKey.length < 20) {
      return res.status(400).json({
        error: "Your GROK_API_KEY appears to be invalid. Please check it in the Settings menu.",
      });
    }

    const convUserId =
      typeof userId === "string" && userId.trim() ? userId.trim() : "anonymous";
    const convProject =
      typeof projectName === "string" && projectName.trim() ? projectName.trim() : "Untitled Project";

    const note =
      typeof userNote === "string" && userNote.trim() ? userNote.trim().slice(0, 4000) : "";

    try {
      let planSnapshot: Record<string, string> = {};
      try {
        if (fs.existsSync(masterPlanPath)) {
          const raw = JSON.parse(fs.readFileSync(masterPlanPath, "utf8"));
          if (raw && typeof raw === "object") {
            for (const [k, v] of Object.entries(raw)) {
              if (typeof v === "string") planSnapshot[k] = v;
            }
          }
        }
      } catch {
        planSnapshot = {};
      }

      const compact: Record<string, string> = {};
      for (const [k, v] of Object.entries(planSnapshot)) {
        compact[k] = v.length > 2500 ? `${v.slice(0, 2500)}\n…[truncated]` : v;
      }

      const memory = buildMemorySystemContent(convUserId, convProject);
      const phaseASystem = `You are Grok 4 (planning only). The user pressed **Go** to run a coding pass with Grok Code.

Your ONLY output for this turn: a **short** pre-coding summary for the Master Plan file.

Strict rules:
- Emit EXACTLY one block: <PRE_CODING_SUMMARY>...</PRE_CODING_SUMMARY>
- Inside: maximum 1200 characters. Use bullets or tight prose: scope, assumptions, first areas to implement, risks.
- Do NOT paste project-execution-rules.md or long policy text.
- Do NOT replace full Master Plan sections; this is a session brief only.
- Do NOT emit START_CODING, ANSWER_Qn, or <START_MASTERPLAN> here.`;

      const phaseAUser = `Current master-plan.json values (truncated per field):\n${JSON.stringify(compact, null, 2)}\n\nOptional user focus for this coding session:\n${note || "(none — infer next concrete steps from the plan)"}`;

      let phaseAMessages: { role: string; content: string }[] = [
        { role: "system", content: phaseASystem },
        { role: "user", content: phaseAUser },
      ];
      phaseAMessages = injectMemoryIntoMessages(phaseAMessages, memory) as { role: string; content: string }[];

      const g4Res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4-1-fast-reasoning",
          messages: phaseAMessages,
          stream: false,
        }),
      });

      if (!g4Res.ok) {
        const errText = await g4Res.text();
        return res.status(g4Res.status).json({ error: `Grok 4 summary phase failed: ${errText.slice(0, 500)}` });
      }

      const g4Data = await g4Res.json();
      const g4Text = g4Data.choices?.[0]?.message?.content || "";
      const sumMatch = g4Text.match(/<PRE_CODING_SUMMARY>([\s\S]*?)<\/PRE_CODING_SUMMARY>/i);
      let summary = sumMatch ? sumMatch[1].trim() : "";
      if (!summary) {
        summary = g4Text
          .replace(/<REASONING>[\s\S]*?<\/REASONING>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 1200);
      }
      if (!summary) {
        summary = "No summary generated; proceed from master plan tabs and project-execution-rules.md.";
      }
      summary = summary.slice(0, 2000);

      let plan: Record<string, unknown> = {};
      if (fs.existsSync(masterPlanPath)) {
        try {
          plan = JSON.parse(fs.readFileSync(masterPlanPath, "utf8"));
        } catch {
          plan = {};
        }
      }
      plan[PRE_CODING_SUMMARY_KEY] = summary;
      fs.writeFileSync(masterPlanPath, JSON.stringify(plan, null, 2), "utf8");
      console.log(`[go-code] Wrote ${PRE_CODING_SUMMARY_KEY} (${summary.length} chars)`);

      const workflowContext = buildProjectWorkflowExecutionContext();
      const codeModel = process.env.GROK_CODE_MODEL?.trim() || "grok-code-fast-1";
      const codeSystemPrompt = `You are Grok Code (coding phase). The user pressed **Go** in Nebula Partner.

A short pre-coding summary was just saved to master-plan.json under the key "${PRE_CODING_SUMMARY_KEY}" (it appears again inside the master-plan snapshot below).

Follow project-execution-rules.md strictly. Use the workflow context in order.

CRITICAL OUTPUT CONTRACT (no deviation):
- Output real code artifacts only (concrete files/diffs/commands) that can be applied directly.
- Do NOT output plain-language planning, recap, policy restatement, or narrative explanation.
- If a file must be created/updated, include explicit path + full content or patch for that file.
- Prefer one or more clear file blocks over prose.
- If information is missing, make minimal safe assumptions and proceed with best-effort code.

${workflowContext}`;

      const incomingMessages: { role: string; content?: string }[] = Array.isArray(messages) ? messages : [];
      const normalized = incomingMessages.map((m) => ({
        role: m.role === "model" ? "assistant" : m.role,
        content: typeof m.content === "string" ? m.content : "",
      }));
      const withMem = injectMemoryIntoMessages(normalized, memory);
      const codeMessages = [
        { role: "system", content: codeSystemPrompt },
        ...withMem.slice(-10),
        {
          role: "user",
          content: `Run the coding pass now. Respect "${PRE_CODING_SUMMARY_KEY}" and the six canonical Master Plan tabs. Session focus from user: ${note || "(none)"}`,
        },
      ];

      const codeRes = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: codeModel,
          messages: codeMessages,
          stream: false,
        }),
      });

      if (!codeRes.ok) {
        const errText = await codeRes.text();
        return res.status(200).json({
          preCodingSummary: summary,
          summarySaved: true,
          codeError: errText.slice(0, 800),
          choices: [],
        });
      }

      const codeData = await codeRes.json();
      const codeText = codeData.choices?.[0]?.message?.content || "";

      try {
        appendConversationTurn(convUserId, convProject, "user", `[Go] ${note || "start coding"}`);
        if (codeText.trim()) {
          appendConversationTurn(convUserId, convProject, "assistant", codeText.trim().slice(0, 8000));
        }
      } catch (logErr) {
        console.error("go-code memory append failed:", logErr);
      }

      return res.json({
        preCodingSummary: summary,
        summarySaved: true,
        choices: codeData.choices,
        codeModel,
      });
    } catch (error) {
      console.error("Error in /api/grok/go-code:", error);
      captureError(error instanceof Error ? error : new Error(String(error)), {
        source: "server",
        route: "/api/grok/go-code",
      });
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to run Go (code) pipeline",
      });
    }
  });

  app.post("/api/grok/chat", async (req, res) => {
    const { messages, grokApiKey: bodyGrokKey, userId, projectName, onboardingAutopilot } = req.body || {};
    const headerKey =
      typeof req.headers["x-grok-api-key"] === "string"
        ? req.headers["x-grok-api-key"].trim()
        : "";
    const apiKey =
      headerKey ||
      (typeof bodyGrokKey === "string" ? bodyGrokKey.trim() : "") ||
      process.env.GROK_API_KEY ||
      "";

    if (!apiKey) {
      console.error("GROK_API_KEY is not set (env, X-Grok-Api-Key header, or Settings)");
      return res.status(401).json({
        error:
          "Grok API key is missing. Add GROK_API_KEY to your .env file, restart the server, or save your key under Dashboard → Secrets (stored in this browser only).",
      });
    }
    if (apiKey.length < 20) {
      const helpMsg = "Your GROK_API_KEY appears to be invalid. Please check it in the Settings menu.";
      console.error(`Invalid GROK_API_KEY format detected: ${helpMsg}`);
      return res.status(400).json({ error: helpMsg });
    }

    const convUserId =
      typeof userId === "string" && userId.trim() ? userId.trim() : "anonymous";
    const convProject =
      typeof projectName === "string" && projectName.trim() ? projectName.trim() : "Untitled Project";

    let messagesForApi: { role: string; content?: string }[] = Array.isArray(messages) ? messages : [];

    if (Boolean(onboardingAutopilot)) {
      const rawMsgs = Array.isArray(messages) ? messages : [];
      const lastUser = [...rawMsgs].reverse().find((m) => m.role === "user");
      const answer =
        typeof lastUser?.content === "string" ? lastUser.content.trim() : "";
      if (!answer) {
        return res.status(400).json({ error: "User answer required for onboarding autopilot" });
      }
      const wf = buildProjectWorkflowExecutionContext();
      const autopilotSystem = `ONBOARDING_AUTOPILOT — single model turn. No conversational filler. No permission questions. Do not ask follow-ups.

The user answered ONLY the first discovery question (core feature of their app). Infer reasonable defaults for audience, stack, pages, integrations, and environment (aligned with project-execution-rules.md) without asking the user.

Output in ONE reply, in this order:
1) <START_MASTERPLAN> ... </END_MASTERPLAN> with ALL six sections using these exact headings inside the block:
   ### 1. Goal of the app
   ### 2. Tech Research
   ### 3. Features and KPIs
   ### 4. Pages and navigation
   ### 5. UI/UX design
   ### 6. Environment Setup
   Each section must be substantive (not placeholders).
2) <FINISH_MASTERPLAN>
3) <START_CODING>

Optional: include ANSWER_Qn + <GROK_B_SUMMARY_Qn> for tabs as needed. After the tags, no extra user-visible prose.

Hard guard:
- Never copy/paste orchestration policy text from project-execution-rules.md into any Master Plan section.
- Master Plan sections must contain product-specific app content only (goal/research/features/pages/ui/environment), not internal workflow instructions.

Workflow reference (read order; do not paste verbatim into chat output):
${wf}

User's only answer (core feature):
${answer.slice(0, 8000)}`;

      messagesForApi = [
        { role: "system", content: autopilotSystem },
        { role: "user", content: answer },
      ];
    }

    try {
      const memory = buildMemorySystemContent(convUserId, convProject);
      messagesForApi = injectMemoryIntoMessages(messagesForApi, memory);
    } catch (memErr) {
      console.error("Conversation memory load failed:", memErr);
    }

    try {
      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4-1-fast-reasoning",
          messages: messagesForApi,
          stream: false,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`GROK API error (${response.status}):`, errorText);
        try {
          const errorData = JSON.parse(errorText);
          return res.status(response.status).json(errorData);
        } catch {
          return res.status(response.status).json({ error: errorText });
        }
      }

      const data = await response.json();
      let responseText = data.choices?.[0]?.message?.content || "";
      /** Grok 4 text before optional Grok Code swap — used for Master Plan + Grok B summaries. */
      let grok4PlanningCapture = responseText;

      if (/\bSTART_CODING\b/i.test(responseText)) {
        const workflowContext = buildProjectWorkflowExecutionContext();
        const codeModel = process.env.GROK_CODE_MODEL?.trim() || "grok-code-fast-1";
        const codeSystemPrompt = `You are now in strict coding mode.
Follow project-execution-rules.md exactly (single orchestration file).
Use this context:
${workflowContext}

CRITICAL OUTPUT CONTRACT (no deviation):
- Output real code artifacts only (concrete files/diffs/commands) that can be applied directly.
- Do NOT output plain-language planning, recap, policy restatement, or narrative explanation.
- If a file must be created/updated, include explicit path + full content or patch for that file.
- Prefer one or more clear file blocks over prose.
- If information is missing, make minimal safe assumptions and proceed with best-effort code.`;
        try {
          const codeRes = await fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: codeModel,
              messages: [{ role: "system", content: codeSystemPrompt }, ...messagesForApi.slice(-12)],
              stream: false,
            }),
          });
          if (codeRes.ok) {
            const codeData = await codeRes.json();
            const codeText = codeData.choices?.[0]?.message?.content || "";
            if (codeText.trim()) {
              responseText = codeText;
              data.choices = [
                {
                  message: {
                    content: codeText,
                    planningPhase: grok4PlanningCapture,
                  },
                },
              ];
            }
          } else {
            console.error("[GROK CODE] handoff failed:", await codeRes.text());
          }
        } catch (e) {
          console.error("[GROK CODE] handoff error:", e);
        }
      }

  // Grok B (writer): run as soon as meaningful summary content appears.
  // ANSWER_Qn still works, but summaries alone are enough to start writing immediately.
  const summarySource = grok4PlanningCapture;
  const answerTabMatches = [...summarySource.matchAll(/\bANSWER_Q([1-6])\b/gi)];
  const answerTabs = [...new Set(answerTabMatches.map((m) => parseInt(m[1], 10)))].sort(
    (a, b) => a - b
  );
  const summaries = extractGrokBSummaries(summarySource);
  const blockFallbackSummaries = extractSummariesFromMasterPlanBlock(summarySource);
  const mergedSummaries: Partial<Record<number, string>> = {
    ...blockFallbackSummaries,
    ...summaries,
  };
  const summaryTabs = Object.keys(mergedSummaries)
    .map((k) => parseInt(k, 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 6)
    .sort((a, b) => a - b);
  const shouldRunWriter = answerTabs.length > 0 || summaryTabs.length > 0;
  if (shouldRunWriter) {
    const targetTabs = answerTabs.length > 0 ? answerTabs : summaryTabs;
    const summaryEntries = targetTabs
      .map((idx) => {
        const summary = mergedSummaries[idx];
        return summary ? ({ tabIndex: idx, summary } as const) : null;
      })
      .filter((entry): entry is { tabIndex: number; summary: string } => entry !== null);

    if (summaryEntries.length === 0) {
      console.warn("[GROK B] Trigger ignored: missing <GROK_B_SUMMARY_Qn> payload.");
    } else {
      appendWriterAuditEvent({
        userId: convUserId,
        projectName: convProject,
        triggeredQn: summaryEntries.map((x) => x.tabIndex),
      });
      console.log(
        `[GROK B] Trigger: ANSWER_Q tabs=${summaryEntries.map((x) => x.tabIndex).join(",")}`
      );
      runGrokB(masterPlanPath, summaryEntries).catch((err) => {
        console.error("[GROK B] Failed to update Master Plan:", err);
      });
    }
  }

      // Extract clean text for TTS (removing internal tags)
      const cleanText = responseText
        .replace(/<REASONING>[\s\S]*?<\/REASONING>/g, '')
        .replace(/<START_MASTERPLAN>[\s\S]*?<END_MASTERPLAN>/g, '')
        .replace(/<START_MASTERPLAN>/g, '')
        .replace(/<END_MASTERPLAN>/g, '')
        .replace(/<START_CODING>/g, '')
        .replace(/START_CODING/g, '')
        .replace(/<START_UIUX>/g, '')
        .replace(/<FINISH_MASTERPLAN>/g, '')
        .replace(/<APPROVE_MASTERPLAN>/g, '')
        .replace(/<APPROVE_MINDMAP>/g, '')
        .replace(/<APPROVE_UI>/g, '')
        .replace(/<GROK_B_SUMMARY_Q([1-6])>[\s\S]*?<\/GROK_B_SUMMARY_Q\1>/g, '')
        .replace(/\bANSWER_Q[1-6]\b/g, '')
        .trim();

      if (cleanText) {
        // Voice chat flow: Audio is now handled via direct /api/speak endpoint to avoid base64 overhead
        console.log("[TTS] Response ready for speech:", cleanText.substring(0, 50) + "...");
      }

      try {
        const lastUser = [...messagesForApi]
          .reverse()
          .find((m) => m.role === "user");
        if (lastUser && typeof lastUser.content === "string" && lastUser.content.length > 0) {
          appendConversationTurn(convUserId, convProject, "user", lastUser.content);
        }
        if (cleanText) {
          // Persist only user-visible assistant text; never store internal control tags in memory logs.
          appendConversationTurn(convUserId, convProject, "assistant", cleanText);
        }
      } catch (logErr) {
        console.error("Conversation memory append failed:", logErr);
      }

      // We return the full responseText to the frontend so it can maintain state.
      // The frontend will be responsible for stripping tags for display.
      res.json(data);
    } catch (error) {
      console.error("Error calling GROK API:", error);
      captureError(error instanceof Error ? error : new Error(String(error)), {
        source: "server",
        route: "/api/grok/chat",
      });
      res.status(500).json({ error: "Failed to call GROK API", details: error instanceof Error ? error.message : String(error) });
    }
  });

  const handleSpeak = async (req: express.Request, res: express.Response) => {
    const textFromQuery = typeof req.query.text === "string" ? req.query.text : "";
    const textFromBody = typeof req.body?.text === "string" ? req.body.text : "";
    const text = (textFromBody || textFromQuery || "").trim();
    if (!text) return res.status(400).json({ error: "Text is required" });

    try {
      const audio = await speak(text);
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": audio.length.toString(),
        "Cache-Control": "public, max-age=3600",
      });
      res.send(audio);
    } catch (error) {
      console.error("TTS endpoint failed:", error);
      captureError(error instanceof Error ? error : new Error(String(error)), {
        source: "server",
        route: "/api/speak",
      });
      res.status(500).json({ error: "TTS failed" });
    }
  };

  app.get("/api/speak", handleSpeak);
  app.post("/api/speak", handleSpeak);

  registerGuardianRoutes(app);
  app.use(guardianExpressErrorHandler);

  // 404 for unknown /api/* only (avoid Express 4 `app.use('/api/*')` quirks with `*`)
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/")) return next();
    res.status(404).json({ error: `Path ${req.originalUrl} not found on this server` });
  });

  // Development: Vite middleware (HMR). Production: serve `dist/` SPA from the same process.
  if (process.env.NODE_ENV !== "production") {
    const hmrPort = Number(process.env.VITE_HMR_PORT) || 24678;
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr:
          process.env.DISABLE_HMR === "true"
            ? false
            : {
                overlay: false,
                port: hmrPort,
              },
      },
      appType: "spa",
    });
    app.use((vite.middlewares) as any);
  } else {
    const distPath = path.join(REPO_ROOT, "dist");
    const spaIndexHtml = path.join(distPath, "index.html");
    const sendSpaIndex = (_req: express.Request, res: express.Response) => {
      res.sendFile(spaIndexHtml);
    };
    app.get("/privacy", sendSpaIndex);
    app.get("/terms", sendSpaIndex);
    app.get("/reset-password", sendSpaIndex);
    app.use(express.static(distPath) as any);
    app.get("*", (req, res) => {
      res.sendFile(spaIndexHtml);
    });
  }

  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Nebulla server listening on http://0.0.0.0:${PORT} (NODE_ENV=${process.env.NODE_ENV || "development"})`);
  });
  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    captureError(err, { source: "server", route: `listen:${PORT}`, detail: err.code });
    if (err.code === "EADDRINUSE") {
      console.error(
        `[nebula] Port ${PORT} is already in use. Quit the other dev server, or run: PORT=${PORT + 1} npm run dev`
      );
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  captureError(err instanceof Error ? err : new Error(String(err)), {
    source: "process",
    detail: "startServer",
  });
});

async function speak(text: string): Promise<Buffer> {
  // Use new Grok TTS API key for speech generation.
  const apiKey = process.env.GROK_TTS_NEW_API_KEY;
  
  if (!apiKey) {
    throw new Error("GROK_TTS_NEW_API_KEY is not set. Please check your environment variables.");
  }

  const response = await fetch("https://api.x.ai/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-tts-1",
      input: text,
      voice: "Eve",
      response_format: "mp3",
    }),
  });

  if (response.ok) {
    return Buffer.from(await response.arrayBuffer());
  }

  const primaryError = await response.text();
  console.warn(`[TTS] New endpoint failed (${response.status}). Trying compatibility fallback.`);

  // Compatibility fallback while Grok TTS rollout stabilizes across accounts/regions.
  const fallback = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice_id: "Eve",
      output_format: {
        codec: "mp3",
        sample_rate: 44100,
        bit_rate: 128000,
      },
      language: "en",
    }),
  });

  if (!fallback.ok) {
    const fallbackError = await fallback.text();
    throw new Error(
      `TTS Error (new=${response.status}, fallback=${fallback.status}) new="${primaryError}" fallback="${fallbackError}"`
    );
  }

  return Buffer.from(await fallback.arrayBuffer());
}

const MASTER_PLAN_SECTION_TITLES = [
  "1. Goal of the app",
  "2. Tech Research",
  "3. Features and KPIs",
  "4. Pages and navigation",
  "5. UI/UX design",
  "6. Environment Setup",
] as const;

function extractGrokBSummaries(responseText: string): Partial<Record<number, string>> {
  const out: Partial<Record<number, string>> = {};
  const re = /<GROK_B_SUMMARY_Q([1-6])>([\s\S]*?)<\/GROK_B_SUMMARY_Q\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(responseText)) !== null) {
    const tabIndex = parseInt(m[1], 10);
    const summary = m[2].trim();
    if (summary) out[tabIndex] = summary;
  }
  return out;
}

function extractSummariesFromMasterPlanBlock(responseText: string): Partial<Record<number, string>> {
  const out: Partial<Record<number, string>> = {};
  const blockMatch = responseText.match(/<START_MASTERPLAN>([\s\S]*?)<END_MASTERPLAN>/i);
  if (!blockMatch) return out;
  const newPlanContent = blockMatch[1].trim();
  if (!newPlanContent) return out;

  for (let i = 0; i < MASTER_PLAN_SECTION_TITLES.length; i++) {
    const title = MASTER_PLAN_SECTION_TITLES[i];
    const nextTitle = MASTER_PLAN_SECTION_TITLES[i + 1];
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedNextTitle = nextTitle ? nextTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : null;
    const regex = new RegExp(
      `(?:###\\s*|\\*\\*|\\b)${escapedTitle}[\\s\\S]*?(?=(?:###\\s*|\\*\\*|\\b)${escapedNextTitle || "$"})`,
      "i"
    );
    const match = newPlanContent.match(regex);
    if (!match) continue;
    let content = match[0].replace(new RegExp(`(?:###\\s*|\\*\\*|\\b)${escapedTitle}`, "i"), "").trim();
    content = content.replace(/^[:\-\s]+/, "");
    if (content) out[i + 1] = content;
  }
  return out;
}

/** Grok B — writer. Copies Grok 4 summaries into mapped Master Plan sections. */
async function runGrokB(
  masterPlanPath: string,
  entries: { tabIndex: number; summary: string }[]
) {
  if (entries.length === 0) return;

  try {
    let plan: Record<string, string> = {};

    if (fs.existsSync(masterPlanPath)) {
      try {
        plan = JSON.parse(fs.readFileSync(masterPlanPath, "utf8"));
      } catch {
        plan = {};
      }
    }

    for (const entry of entries) {
      if (entry.tabIndex < 1 || entry.tabIndex > MASTER_PLAN_SECTION_TITLES.length) continue;
      const title = MASTER_PLAN_SECTION_TITLES[entry.tabIndex - 1];
      const summary = entry.summary.trim();
      if (summary) {
        plan[title] = summary;
      }
    }

    fs.writeFileSync(masterPlanPath, JSON.stringify(plan, null, 2), "utf8");
    console.log(
      `[GROK B] Master plan updated from Grok 4 summaries (tabs: ${entries
        .map((e) => e.tabIndex)
        .join(",")}).`
    );
  } catch (err) {
    console.error("Grok B processing failed:", err);
  }
}
