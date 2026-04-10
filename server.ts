import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import Stripe from 'stripe';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/config", (req, res) => {
    res.json({
      stripePublicKey: process.env.STRIPE_PUBLIC_KEY,
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      googleClientId: process.env.GOOGLE_CLIENT_ID,
      githubClientId: process.env.GITHUB_CLIENT_ID,
      builderPublicKey: process.env.BUILDER_PUBLIC_KEY,
    });
  });

  // Master Plan Update Logic (Clean JSON-based storage)
  const masterPlanPath = path.join(process.cwd(), "master-plan.json");

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
      1: "1. The Problem We’re Solving",
      2: "2. Target User & Context",
      3: "3. Must-Have Features",
      4: "4. Nice-to-Have Features",
      5: "5. User Scale & Load",
      6: "6. Data Requirements",
      7: "7. Accessibility & Inclusivity",
      8: "8. Pages & Navigation",
      9: "9. Market & Tech Research"
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

  let stripeClient: Stripe | null = null;
  function getStripe(): Stripe {
    if (!stripeClient) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) {
        throw new Error('STRIPE_SECRET_KEY environment variable is required');
      }
      stripeClient = new Stripe(key);
    }
    return stripeClient;
  }

  app.post("/api/create-checkout-session", async (req, res) => {
    const { priceId, email } = req.body;
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer_email: email,
        line_items: [
          {
            price: priceId || process.env.STRIPE_PROTOTYPE_PRICE_ID || 'price_1T7pYzPNRjrb3o88hdD9Altb',
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${req.headers.origin}/?success=true`,
        cancel_url: `${req.headers.origin}/?canceled=true`,
      });
      res.json({ id: session.id, url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Stripe Webhook
  app.post("/api/webhooks/stripe", express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      return res.status(400).send('Webhook Error: Missing signature or secret');
    }

    let event;

    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log(`[STRIPE] Payment successful for ${session.customer_email}`);
      // Here you would update your database (e.g. Supabase) to mark the user as paid
    }

    res.json({ received: true });
  });

  // Example backend function: read file system
  app.get("/api/fs/list", (req, res) => {
    try {
      const dirPath = req.query.path as string || process.cwd();
      const files = fs.readdirSync(dirPath, { withFileTypes: true }).map(dirent => ({
        name: dirent.name,
        isDirectory: dirent.isDirectory()
      }));
      res.json({ files });
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
    exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
      let output = "";
      if (stdout) output += stdout;
      if (stderr) output += stderr;
      if (error && !stdout && !stderr) output += error.message;
      res.json({ output: output || "Command executed successfully with no output." });
    });
  });

  app.post("/api/leads", (req, res) => {
    const { email, action } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });
    
    console.log(`[LEAD CAPTURED] Email: ${email}, Action: ${action}, Time: ${new Date().toISOString()}`);
    // In a real app, we would save this to a database
    res.json({ success: true });
  });

  app.post("/api/stitch/mockup", async (req, res) => {
    const { pagesText } = req.body;
    const apiKey = process.env.STITCH_API_KEY;
    
    if (!apiKey) {
      console.error("STITCH_API_KEY is not set");
      return res.status(500).json({ error: "STITCH_API_KEY is not set. Please add it in the Settings menu." });
    }

    try {
      // Mocking Stitch API call - in a real scenario, this would call the Stitch service
      // For now, we'll use Grok as the engine but identify it as Stitch
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROK_API_NEBULLA}`,
        },
        body: JSON.stringify({
          model: 'grok-beta',
          messages: [{ 
            role: 'user', 
            content: `Generate a single SVG mockup based ONLY on this Master Plan data:\n\n${pagesText}\n\nReturn ONLY valid SVG code. No markdown formatting, no explanation.` 
          }],
          stream: false
        }),
      });

      if (!response.ok) {
        throw new Error(`Stitch Engine Error: ${response.status}`);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Error calling Stitch API:", error);
      res.status(500).json({ error: "Failed to call Stitch API" });
    }
  });

  app.post("/api/grok/tts", async (req, res) => {
    const { text, voice = 'eve' } = req.body;
    const apiKey = process.env.GROK_API_NEBULLA;
    
    if (!apiKey) {
      return res.status(500).json({ error: "GROK_API_NEBULLA is not set." });
    }

    try {
      console.log(`[TTS] Calling xAI API with voice: ${voice}, text length: ${text.length}`);
      const response = await fetch('https://api.x.ai/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice: voice,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[TTS] xAI API error (${response.status}):`, errorText);
        return res.status(response.status).json({ error: errorText });
      }

      const arrayBuffer = await response.arrayBuffer();
      console.log(`[TTS] Success. Received ${arrayBuffer.byteLength} bytes.`);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.send(Buffer.from(arrayBuffer));
    } catch (error) {
      console.error("Error calling Grok TTS:", error);
      res.status(500).json({ error: "Failed to call Grok TTS" });
    }
  });

  app.post("/api/grok/chat", async (req, res) => {
    const { messages } = req.body;
    const apiKey = process.env.GROK_API_NEBULLA;
    
    if (!apiKey) {
      console.error("GROK_API_NEBULLA is not set in environment");
      return res.status(500).json({ error: "GROK_API_NEBULLA is not set. Please add it in the Settings menu." });
    }

    // Basic validation of key format
    if (apiKey.length < 20) {
      const helpMsg = "Your GROK_API_NEBULLA appears to be invalid. Please check it in the Settings menu.";
      console.error(`Invalid GROK_API_NEBULLA format detected: ${helpMsg}`);
      return res.status(400).json({ error: helpMsg });
    }

    try {
      // Determine model based on conversation history or tags
      let model = 'grok-4-1-fast-reasoning';
      
      // Check if the last assistant message or current user message triggers coding mode
      const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant' || m.role === 'model');
      const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
      
      if ((lastAssistantMessage && lastAssistantMessage.content.includes('<START_CODING>')) || 
          (lastUserMessage && lastUserMessage.content.includes('<START_CODING>'))) {
        model = 'grok-code-fast-1';
      }
      
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
        console.error(`Grok API error (${response.status}):`, errorText);
        try {
          const errorData = JSON.parse(errorText);
          return res.status(response.status).json(errorData);
        } catch (e) {
          return res.status(response.status).json({ error: errorText });
        }
      }

      const data = await response.json();
      let responseText = data.choices?.[0]?.message?.content || '';

      // Grok B Behavior: Silent Master Plan Update
      const masterPlanMatch = responseText.match(/<START_MASTERPLAN>([\s\S]*?)<END_MASTERPLAN>/);
      if (masterPlanMatch) {
        const newPlanContent = masterPlanMatch[1].trim();
        try {
          fs.writeFileSync(masterPlanPath, newPlanContent, "utf8");
          console.log("[GROK B] Master Plan updated silently.");
        } catch (err) {
          console.error("[GROK B] Failed to update Master Plan:", err);
        }
      }

      // We return the full responseText to the frontend so it can maintain state.
      // The frontend will be responsible for stripping tags for display.
      res.json(data);
    } catch (error) {
      console.error("Error calling Grok API:", error);
      res.status(500).json({ error: "Failed to call Grok API", details: error instanceof Error ? error.message : String(error) });
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
