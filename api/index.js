// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json).
// The Express app is compiled by `npm run build` into server/dist.
import { createApp } from "../server/dist/app.js";

const app = createApp();

export default function handler(req, res) {
  // Let Express parse the body itself (JSON, multipart uploads, and the raw body the
  // Stripe webhook signature needs) instead of Vercel's lazy body helper.
  const desc = Object.getOwnPropertyDescriptor(req, "body");
  if (desc && desc.configurable) Object.defineProperty(req, "body", { value: undefined, writable: true, configurable: true, enumerable: true });
  return app(req, res);
}
