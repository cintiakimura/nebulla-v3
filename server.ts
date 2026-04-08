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
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product: 'prod_U61dZv59hzcx8d',
              unit_amount: 1999, // 19.99 EUR
            },
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

  app.post("/api/grok/chat", async (req, res) => {
    const { messages } = req.body;
    const apiKey = process.env.GROK_API_KEY;
    
    if (!apiKey) {
      console.error("GROK_API_KEY is not set in environment");
      return res.status(500).json({ error: "GROK_API_KEY is not set" });
    }

    try {
      // Using the specific model name provided by the user
      let model = process.env.GROK_MODEL || 'grok-4-1-fast-reasoning';
      
      // Safety check: if the model name looks like a project ID or UUID, fallback to default
      if (!model.startsWith('grok') && model.length > 30) {
        console.warn(`Invalid GROK_MODEL detected: "${model}". Falling back to "grok-4-1-fast-reasoning".`);
        model = 'grok-4-1-fast-reasoning';
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
