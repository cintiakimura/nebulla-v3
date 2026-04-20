import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Public config for client — mirrors `GET /api/config` in server.ts without importing the full app.
 */
export default function handler(_req: IncomingMessage, res: ServerResponse) {
  const grok = process.env.GROK_API_KEY?.trim() ?? "";
  const tts = process.env.GROK_TTS_API_KEY?.trim() ?? "";
  const writer = process.env.GROK_3_API_KEY?.trim() ?? "";
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "") ?? "";
  const supabaseOAuthCallbackUrl = supabaseUrl ? `${supabaseUrl}/auth/v1/callback` : undefined;

  const body = JSON.stringify({
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

  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}
