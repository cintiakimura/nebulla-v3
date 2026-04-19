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


dotenv.config({ path: path.join(process.cwd(), ".env") });

export const app = express();
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  app.use(express.json({ limit: '50mb' }) as any);
  app.use(express.urlencoded({ extended: true, limit: '50mb' }) as any);

  // Vercel rewrites /api/:path* → this function; the incoming path is often /foo, not /api/foo.
  if (process.env.VERCEL) {
    app.use((req, _res, next) => {
      const u = req.url || "";
      if (u.startsWith("/") && !u.startsWith("/api") && !u.startsWith("/auth")) {
        req.url = "/api" + u;
      }
      next();
    });
  }

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
    const tts = process.env.GROK_TTS_API_KEY?.trim() ?? "";
    const writer = process.env.GROK_3_API_KEY?.trim() ?? "";
    const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "") ?? "";
    /** Google Cloud + GitHub OAuth apps must allow this redirect (not your Vercel URL). */
    const supabaseOAuthCallbackUrl = supabaseUrl
      ? `${supabaseUrl}/auth/v1/callback`
      : undefined;
    res.json({
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      supabaseOAuthCallbackUrl,
      googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.google_client_id,
      githubClientId: process.env.GITHUB_CLIENT_ID || process.env.github_client_id,
      builderPublicKey: process.env.BUILDER_PUBLIC_KEY,
      hasGrokApiKey: grok.length >= 20,
      hasGrokTtsKey: tts.length >= 20,
      hasGrokWriterKey: writer.length >= 20,
    });
  });

  // Master Plan Update Logic (Clean JSON-based storage)
  const masterPlanPath = path.join(process.cwd(), "master-plan.json");
  const SUPER_ADMIN_EMAIL = 'cintiakimura20@gmail.com';

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
      1: "1. The problem we are solving",
      2: "2. Target user and context",
      3: "3. Core features",
      4: "4. User scale and load",
      5: "5. Data requirements",
      6: "6. Accessibility and inclusivity",
      7: "7. Pages and navigation",
      8: "8. Market and tech research",
      9: "9. Question Tab"
    };

    const tabName = tabNames[tabIndex as number];
    if (!tabName) {
      return res.status(400).json({ error: "Invalid tabIndex. Must be 1-9." });
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
        'api', 'vercel.json', 'Audit_Report.md', '.gitignore'
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

  app.get("/auth/callback", (req, res) => {
    res.send(`
      <html>
        <head>
          <title>Authentication Successful</title>
          <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #040f1a; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: rgba(255,255,255,0.05); padding: 2rem; border-radius: 1rem; border: 1px solid rgba(255,255,255,0.1); text-align: center; max-width: 400px; }
            h2 { color: #00ffff; margin-top: 0; }
            p { color: #94a3b8; line-height: 1.5; }
            .spinner { border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid #00ffff; border-radius: 50%; width: 24px; height: 24px; animation: spin 1s linear infinite; margin: 1rem auto; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="card">
            <div id="status-icon" class="spinner"></div>
            <h2 id="status-title">Authenticating...</h2>
            <p id="status-text">Completing the secure connection to your account.</p>
          </div>
          <script>
            // We need the Supabase config to initialize the client in the popup
            // so it can capture the session from the URL hash/query
            fetch('/api/config')
              .then(res => res.json())
              .then(config => {
                if (!config.supabaseUrl || !config.supabaseAnonKey) {
                  throw new Error('Supabase configuration missing');
                }
                
                const supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
                  auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
                });

                supabase.auth.onAuthStateChange(function (event, session) {
                  if (session) {
                    console.log('Auth event:', event);
                    if (window.opener) {
                      window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');

                      document.getElementById('status-icon').style.display = 'none';
                      document.getElementById('status-title').innerText = 'Success!';
                      document.getElementById('status-text').innerText = 'You are now logged in. This window will close automatically.';

                      setTimeout(function () { window.close(); }, 1000);
                    } else {
                      window.location.href = '/';
                    }
                  }
                });

                (async function () {
                  try {
                    var qs = new URLSearchParams(window.location.search);
                    var oauthError = qs.get('error');
                    if (oauthError) {
                      throw new Error(qs.get('error_description') || oauthError);
                    }
                    var code = qs.get('code');
                    if (!code && window.location.hash.length > 1) {
                      code = new URLSearchParams(window.location.hash.slice(1)).get('code');
                    }
                    // exchangeCodeForSession expects the auth code string only (PKCE), not the full URL — see Supabase GoTrueClient API.
                    if (code && supabase.auth.exchangeCodeForSession) {
                      await supabase.auth.exchangeCodeForSession(code);
                    } else {
                      await supabase.auth.getSession();
                    }
                  } catch (e) {
                    console.error('Auth session exchange:', e);
                  }
                })();

                setTimeout(function () {
                  if (window.opener) {
                    window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                    document.getElementById('status-text').innerText = 'Taking a bit longer... you can close this window if the main app is logged in.';
                  }
                }, 5000);
              })
              .catch(err => {
                console.error('Auth Callback Error:', err);
                document.getElementById('status-icon').style.display = 'none';
                document.getElementById('status-title').innerText = 'Authentication Error';
                document.getElementById('status-title').style.color = '#ff4444';
                document.getElementById('status-text').innerText = 'There was a problem completing your login. Please try again.';
              });
          </script>
        </body>
      </html>
    `);
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

  app.post("/api/stitch/mockup", async (req, res) => {
    const { pagesText, branding } = req.body;
    const apiKey = process.env.STITCH_API_KEY || process.env.GROK_API_KEY;
    
    if (!apiKey) {
      console.error("Stitch API Key not set (tried STITCH_API_KEY and GROK_API_KEY)");
      return res.status(500).json({ error: "Stitch API Key is not set. Please add STITCH_API_KEY in the Settings menu." });
    }

    try {
      const brandingPrompt = branding ? `
Branding Context:
- App Name: ${branding.appName}
- Primary Color: ${branding.primaryColor}
- Secondary Color: ${branding.secondaryColor}
- Style: ${branding.style}
` : '';

      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'grok-beta',
          messages: [{ 
            role: 'user', 
            content: `You are a world-class UI designer. Generate a high-fidelity, modern, and professional SVG mockup for a mobile application.

Master Plan Data:
${pagesText || 'No pages defined yet.'}
${brandingPrompt}

Requirements:
1. Return ONLY valid SVG code.
2. No markdown formatting (no \`\`\`svg blocks).
3. No explanations or text outside the <svg> tag.
4. The SVG should be standalone and render a complete screen or dashboard.
5. Use the provided branding colors if available.
6. Ensure all text is readable and components are well-spaced.` 
          }],
          stream: false
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error("Stitch Engine Error Response:", errBody);
        let errorMessage = `Stitch Engine Error: ${response.status}`;
        try {
          const parsedErr = JSON.parse(errBody);
          if (parsedErr.error?.message) errorMessage += ` - ${parsedErr.error.message}`;
        } catch (e) {
          errorMessage += ` - ${errBody.substring(0, 100)}`;
        }
        return res.status(response.status).json({ error: errorMessage });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Error calling Stitch API:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to call Stitch API" });
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

  // Grok B (writer): standby until explicit ANSWER_Qn triggers from Grok 4
  const answerTabMatches = [...responseText.matchAll(/\bANSWER_Q([1-9])\b/gi)];
  const answerTabs = [...new Set(answerTabMatches.map((m) => parseInt(m[1], 10)))].sort(
    (a, b) => a - b
  );
  const shouldRunWriter = answerTabs.length > 0;
  if (shouldRunWriter) {
    const summaries = extractGrokBSummaries(responseText);
    const summaryEntries = answerTabs
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
        .replace(/<GROK_B_SUMMARY_Q([1-9])>[\s\S]*?<\/GROK_B_SUMMARY_Q\1>/g, '')
        .replace(/\bANSWER_Q[1-9]\b/g, '')
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
      res.status(500).json({ error: "TTS failed" });
    }
  });

  // 404 API CATCH-ALL (returns JSON instead of HTML)
  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: `Path ${req.originalUrl} not found on this server` });
  });

  // Vite only for local `npm run dev`. Never on Vercel: NODE_ENV may be unset there; loading Vite in serverless crashes (500).
  if (!process.env.VERCEL && process.env.NODE_ENV !== "production") {
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
  } else if (!process.env.VERCEL) {
    // Production: serve built SPA from Node (local `npm run start` / Docker).
    // On Vercel, static assets come from the static-build output; the serverless app only handles /api/* and /auth/callback.
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath) as any);
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Vercel invokes the Express app per request; binding a port is invalid for serverless.
  if (!process.env.VERCEL) {
    const httpServer = app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
    httpServer.on("error", (err: NodeJS.ErrnoException) => {
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
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});

async function speak(text: string): Promise<Buffer> {
  // Use GROK_TTS_API_KEY for TTS
  const apiKey = process.env.GROK_TTS_API_KEY;
  
  if (!apiKey) {
    throw new Error("GROK_TTS_API_KEY is not set. Please check your environment variables.");
  }

  const response = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: text,
      voice_id: "Eve",
      output_format: {
        codec: "mp3",
        sample_rate: 44100,
        bit_rate: 128000
      },
      language: "en"
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TTS Error: ${response.status} - ${errorText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

const MASTER_PLAN_SECTION_TITLES = [
  "1. The problem we are solving",
  "2. Target user and context",
  "3. Core features",
  "4. User scale and load",
  "5. Data requirements",
  "6. Accessibility and inclusivity",
  "7. Pages and navigation",
  "8. Market and tech research",
  "9. Question Tab",
] as const;

function extractGrokBSummaries(responseText: string): Partial<Record<number, string>> {
  const out: Partial<Record<number, string>> = {};
  const re = /<GROK_B_SUMMARY_Q([1-9])>([\s\S]*?)<\/GROK_B_SUMMARY_Q\1>/gi;
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
