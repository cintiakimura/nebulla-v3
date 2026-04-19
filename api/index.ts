/**
 * Vercel serverless entry: Express app.
 * Rewrites in vercel.json send `/api/*` and `/auth/callback` here.
 * Use default export only (Vercel wraps Express — no serverless-http needed).
 */
import { app } from "../server";

export default app;
