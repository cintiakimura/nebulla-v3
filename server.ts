import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { WebSocketServer, WebSocket } from 'ws';

export const app = express();
const PORT = 3000;

async function startServer() {
  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/config", (req, res) => {
    res.json({
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      googleClientId: process.env.GOOGLE_CLIENT_ID,
      githubClientId: process.env.GITHUB_CLIENT_ID,
      builderPublicKey: process.env.BUILDER_PUBLIC_KEY,
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
      8: "8. Market and tech research"
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
      console.log("CDW:", process.cdw());
      console.log("targetDir:", targerDir);
      
      // Security: Ensure the target directory is within the project root
      if (!targetDir.startsWith(process.cwd())) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!fs.existsSync(targetDir)) {
        return res.status(404).json({ error: "Directory not found" });
      }

      const items = fs.readdirSync(targetDir, { withFileTypes: true });
      const files = items
        .filter(item => !item.name.startsWith('.') && item.name !== 'node_modules' && item.name !== 'dist')
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
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #040f1a; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: rgba(255,255,255,0.05); padding: 2rem; border-radius: 1rem; border: 1px solid rgba(255,255,255,0.1); text-align: center; max-width: 400px; }
            h2 { color: #00ffff; margin-top: 0; }
            p { color: #94a3b8; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Authentication Successful</h2>
            <p>Your account has been connected. This window should close automatically.</p>
            <p style="font-size: 0.8rem; opacity: 0.5;">If it doesn't close, you can safely close it manually.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              setTimeout(() => window.close(), 1000);
            }
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
    const apiKey = process.env.STITCH_API_KEY || process.env.GROK_API_NEBULLA;
    
    if (!apiKey) {
      console.error("Stitch API Key not set (tried STITCH_API_KEY and GROK_API_NEBULLA)");
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
const { messages } = req.body;
const apiKey = process.env.GROK_API_NEBULLA;

if (!apiKey) {
  console.error("GROK API Nebula is not set in environment");
  return res.status(500).json({ error: "GROK API Nebula is not set. Please add it in the Settings menu." });
}

// Basic validation of key format
if (apiKey.length < 20) {
  const helpMsg = "Your GROK API Nebula appears to be invalid. Please check it in the Settings menu.";
  console.error(`Invalid GROK_API_NEBULLA format detected: ${helpMsg}`);
  return res.status(400).json({ error: helpMsg });
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
      messages: messages,
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

  // GROK 4.1 Behavior: Silent Master Plan Update
  const masterPlanMatch = responseText.match(/<START_MASTERPLAN>([\s\S]*?)<END_MASTERPLAN>/);
  if (masterPlanMatch) {
    const newPlanContent = masterPlanMatch[1].trim();
    try {
      let plan: Record<string, string> = {};
      if (fs.existsSync(masterPlanPath)) {
        try {
          plan = JSON.parse(fs.readFileSync(masterPlanPath, "utf8"));
        } catch (e) { plan = {}; }
      }

      const sections = [
        "1. The problem we are solving",
        "2. Target user and context",
        "3. Core features",
        "4. User scale and load",
        "5. Data requirements",
        "6. Accessibility and inclusivity",
        "7. Pages and navigation",
        "8. Market and tech research"
      ];

      sections.forEach((title, i) => {
        const nextTitle = sections[i + 1];
        const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedNextTitle = nextTitle ? nextTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
        
        const regex = new RegExp(`(?:###\\s*|\\*\\*|\\b)${escapedTitle}[\\s\\S]*?(?=(?:###\\s*|\\*\\*|\\b)${escapedNextTitle || '$'})`, 'i');
        const match = newPlanContent.match(regex);
        
        if (match) {
          let content = match[0].replace(new RegExp(`(?:###\\s*|\\*\\*|\\b)${escapedTitle}`, 'i'), '').trim();
          // Remove leading colons or dashes that might be left over
          content = content.replace(/^[:\-\s]+/, '');
          if (content) {
            plan[title] = content;
          }
        }
      });

      fs.writeFileSync(masterPlanPath, JSON.stringify(plan, null, 2), "utf8");
      console.log("[GROK 4.1] Master Plan updated silently.");
    } catch (err) {
      console.error("[GROK 4.1] Failed to update Master Plan:", err);
    }
  }

      // We return the full responseText to the frontend so it can maintain state.
      // The frontend will be responsible for stripping tags for display.
      res.json(data);
    } catch (error) {
      console.error("Error calling GROK API:", error);
      res.status(500).json({ error: "Failed to call GROK API", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: {
          overlay: false,
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();
