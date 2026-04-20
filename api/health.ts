import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Minimal health check — does not import `server.ts` (avoids heavy bundle / cold-start crashes).
 * Uses native Node response (Vercel does not pass Express `res`).
 */
export default function handler(_req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ status: "ok" }));
}
