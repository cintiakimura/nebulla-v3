import dotenv from "dotenv";
import path from "path";
import express from "express";
import fs from "fs";
import { exec } from "child_process";
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

dotenv.config({ path: path.join(process.cwd(), ".env") });

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
  const masterPlanPath = path.join(process.cwd(), "master-plan.json");
  const nebulaUiStudioPath = path.join(process.cwd(), "nebula-sysh-ui-sysh-studio.md");
  /** On-disk folder for approved UI exports (alongside the markdown manifest). */
  const nebulaUiStudioOutputDir = path.join(process.cwd(), "nebulla-sysh-ui-sysh-studio");

  const readSkillDesignSystemExcerpt = (): string => {
    const skillPath = path.join(process.cwd(), "SKILL.md");
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
      6: "6. Development Plan (MVP)"
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
    const specPath = path.join(process.cwd(), "Nebula Architecture Spec.md");
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
      const targetDir = path.resolve(process.cwd(), pathParam);
      
      // Security: Ensure the target directory is within the project root
      if (!targetDir.startsWith(process.cwd())) {
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

      const targetFile = path.resolve(process.cwd(), filePath);
      
      // Security: Ensure the target file is within the project root
      if (!targetFile.startsWith(process.cwd())) {
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

  // Example backend function: execute terminal command
  app.post("/api/terminal/exec", (req, res) => {
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ output: "No command provided" });
    }
    
    // Execute the command in the current working directory
    exec(command, { cwd: process.cwd(), timeout: 30000 }, (error, stdout, stderr) => {
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
    const apiKey = resolvePencilApiKey();
    const apiUrl = resolvePencilMockupsUrl();

    try {
      ensureNebulaUiStudioFile();
      const uiStudioFile = fs.readFileSync(nebulaUiStudioPath, "utf8");
      const storedPrompt = extractNebulaCommentSection(uiStudioFile, "NEBULA_UI_STUDIO_PROMPT");
      const skillExcerpt = readSkillDesignSystemExcerpt();

      if (!apiKey) {
        if (useBundledDemoMockupWithoutKey()) {
          const svg = loadBundledDemoMockupSvg();
          return res.json({
            svg,
            demoMode: true,
            usedPrompt: storedPrompt || "",
            message:
              process.env.NODE_ENV === "production"
                ? "Bundled demo mockup (set PENCIL_API_KEY for live Pencil.dev, or remove NEBULA_UI_STUDIO_DEMO to require a key)."
                : "Bundled demo mockup (dev). Set PENCIL_API_KEY for live Pencil.dev API output.",
          });
        }
        console.error("Nebula UI Studio key not set (PENCIL_API_KEY / PENCIL_DEV_API_KEY / PENCIL_CLI_KEY)");
        return res.status(500).json({
          error:
            "Nebula UI Studio key is missing. Add PENCIL_API_KEY from pencil.dev to your server env, or set NEBULA_UI_STUDIO_DEMO=1 to serve bundled demo mockups without calling the API.",
        });
      }

      const body = buildNebulaUiStudioPromptBody({
        storedPrompt,
        skillExcerpt,
        pagesText: typeof pagesText === "string" ? pagesText : "",
        branding,
      });

      const result = await callPencilMockupsGenerate({ apiKey, apiUrl, body });
      if (result.ok === false) {
        console.error("Nebula UI Studio Engine Error:", result.error);
        return res.status(result.status).json({ error: result.error });
      }

      const raw = result.raw as Record<string, unknown>;
      res.json({ ...raw, svg: result.svg, usedPrompt: storedPrompt || "" });
    } catch (error) {
      console.error("Error calling Nebula UI Studio engine:", error);
      captureError(error instanceof Error ? error : new Error(String(error)), {
        source: "server",
        route: "/api/nebula-ui-studio/generate",
      });
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to call Nebula UI Studio engine" });
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

app.post("/api/grok/chat", async (req, res) => {
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
  console.error("GROK_API_KEY is not set (env, X-Grok-Api-Key header, or Settings)");
  return res.status(401).json({
    error:
      "Grok API key is missing. Add GROK_API_KEY to your .env file, restart the server, or save your key under Dashboard → Secrets (stored in this browser only).",
  });
}

// Basic validation of key format
if (apiKey.length < 20) {
  const helpMsg = "Your GROK_API_KEY appears to be invalid. Please check it in the Settings menu.";
  console.error(`Invalid GROK_API_KEY format detected: ${helpMsg}`);
  return res.status(400).json({ error: helpMsg });
}

const convUserId =
  typeof userId === "string" && userId.trim() ? userId.trim() : "anonymous";
const convProject =
  typeof projectName === "string" && projectName.trim()
    ? projectName.trim()
    : "Untitled Project";

let messagesForApi: { role: string; content?: string }[] = Array.isArray(messages)
  ? messages
  : [];
try {
  const memory = buildMemorySystemContent(convUserId, convProject);
  messagesForApi = injectMemoryIntoMessages(messagesForApi, memory);
} catch (memErr) {
  console.error("Conversation memory load failed:", memErr);
}

try {
  // Everything now runs on GROK 4.1 Fast Reasoning
  const model = 'grok-4-1-fast-reasoning';
  
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: messagesForApi,
      stream: false
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`GROK API error (${response.status}):`, errorText);
    try {
      const errorData = JSON.parse(errorText);
      return res.status(response.status).json(errorData);
    } catch (e) {
      return res.status(response.status).json({ error: errorText });
    }
  }

  const data = await response.json();
  let responseText = data.choices?.[0]?.message?.content || '';

  // Grok B (writer): run as soon as meaningful summary content appears.
  // ANSWER_Qn still works, but summaries alone are enough to start writing immediately.
  const answerTabMatches = [...responseText.matchAll(/\bANSWER_Q([1-6])\b/gi)];
  const answerTabs = [...new Set(answerTabMatches.map((m) => parseInt(m[1], 10)))].sort(
    (a, b) => a - b
  );
  const summaries = extractGrokBSummaries(responseText);
  const summaryTabs = Object.keys(summaries)
    .map((k) => parseInt(k, 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 6)
    .sort((a, b) => a - b);
  const shouldRunWriter = answerTabs.length > 0 || summaryTabs.length > 0;
  if (shouldRunWriter) {
    const targetTabs = answerTabs.length > 0 ? answerTabs : summaryTabs;
    const summaryEntries = targetTabs
      .map((idx) => {
        const summary = summaries[idx];
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

  app.get("/api/speak", async (req, res) => {
    const text = req.query.text as string;
    if (!text) return res.status(400).json({ error: "Text is required" });
    
    try {
      const audio = await speak(text);
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": audio.length.toString(),
        "Cache-Control": "public, max-age=3600"
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
  });

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
    const distPath = path.join(process.cwd(), "dist");
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
  "6. Development Plan (MVP)",
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
