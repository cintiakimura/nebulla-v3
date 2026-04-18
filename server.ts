import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { WebSocketServer, WebSocket } from 'ws';

export const app = express();
const PORT = 3000;

async function startServer() {
  app.use(express.json() as any);


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
                
                const supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
                
                // Supabase automatically handles the session from the URL on init
                // but we'll wait a bit to ensure it's processed
                setTimeout(() => {
                  if (window.opener) {
                    window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                    
                    document.getElementById('status-icon').style.display = 'none';
                    document.getElementById('status-title').innerText = 'Success!';
                    document.getElementById('status-text').innerText = 'You are now logged in. This window will close automatically.';
                    
                    setTimeout(() => window.close(), 1500);
                  } else {
                    window.location.href = '/';
                  }
                }, 500);
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
const { messages } = req.body;
const apiKey = process.env.GROK_API_KEY;

if (!apiKey) {
  console.error("GROK_API_KEY is not set in environment");
  return res.status(500).json({ error: "GROK_API_KEY is not set. Please add it in the Settings menu." });
}

// Basic validation of key format
if (apiKey.length < 20) {
  const helpMsg = "Your GROK_API_KEY appears to be invalid. Please check it in the Settings menu.";
  console.error(`Invalid GROK_API_KEY format detected: ${helpMsg}`);
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

  // Grok B: Silent Master Plan Update Trigger
  if (responseText.includes('START MASTER PLAN')) {
    console.log("[GROK B] Triggered: Starting silent Master Plan update...");
    // We run this without awaiting to keep Grok A's response fast
    runGrokB(messages, apiKey, masterPlanPath).then(() => {
       console.log("[GROK B] Completed successfully.");
    }).catch(err => {
       console.error("[GROK B] Failed to update Master Plan:", err);
    });
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
        .trim();

      if (cleanText) {
        // Voice chat flow: Audio is now handled via direct /api/speak endpoint to avoid base64 overhead
        console.log("[TTS] Response ready for speech:", cleanText.substring(0, 50) + "...");
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
    app.use((vite.middlewares) as any);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath) as any);
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

startServer().catch(err => {
  console.error("Failed to start server:", err);
});

export async function speak(text: string): Promise<Buffer> {
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

async function runGrokB(history: any[], apiKey: string, masterPlanPath: string) {
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

  const grokBSystemPrompt = `You are Grok B, the silent Master Plan Architect. 
Your sole purpose is to fill out the Master Plan based on the provided conversation history.
You must be thorough and use the information discussed to populate every single section.

STRICT OUTPUT FORMAT:
Wrap your entire update in <START_MASTERPLAN> and <END_MASTERPLAN> tags.
Use ### for section titles.

Sections for you to populate:
${sections.join('\n')}

Example format:
<START_MASTERPLAN>
### 1. The problem we are solving
Detailed description based on conversation...
...
<END_MASTERPLAN>

Stay completely silent. No text outside the tags. Analyze the history carefully.`;

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4-1-fast-reasoning',
        messages: [
          { role: 'system', content: grokBSystemPrompt },
          ...history
        ],
        stream: false
      }),
    });

    if (!response.ok) {
       console.error(`Grok B error: ${response.status}`);
       return;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Process Grok B's architectural output
    const masterPlanMatch = content.match(/<START_MASTERPLAN>([\s\S]*?)<END_MASTERPLAN>/);
    if (masterPlanMatch) {
      const newPlanContent = masterPlanMatch[1].trim();
      let plan: Record<string, string> = {};
      
      if (fs.existsSync(masterPlanPath)) {
        try {
          plan = JSON.parse(fs.readFileSync(masterPlanPath, "utf8"));
        } catch (e) { plan = {}; }
      }

      sections.forEach((title, i) => {
        const nextTitle = sections[i + 1];
        const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedNextTitle = nextTitle ? nextTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
        
        const regex = new RegExp(`(?:###\\s*|\\*\\*|\\b)${escapedTitle}[\\s\\S]*?(?=(?:###\\s*|\\*\\*|\\b)${escapedNextTitle || '$'})`, 'i');
        const match = newPlanContent.match(regex);
        
        if (match) {
          let sectionContent = match[0].replace(new RegExp(`(?:###\\s*|\\*\\*|\\b)${escapedTitle}`, 'i'), '').trim();
          sectionContent = sectionContent.replace(/^[:\-\s]+/, '');
          if (sectionContent) {
            plan[title] = sectionContent;
          }
        }
      });

      fs.writeFileSync(masterPlanPath, JSON.stringify(plan, null, 2), "utf8");
    }
  } catch (err) {
    console.error("Grok B processing failed:", err);
  }
}
