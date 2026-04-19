/**
 * Vercel serverless entry: Express app (wrapped for Lambda-style invocation).
 * Rewrites in vercel.json send `/api/*` and `/auth/callback` here.
 */
import serverless from "serverless-http";
import { app } from "../server";

export default serverless(app);
