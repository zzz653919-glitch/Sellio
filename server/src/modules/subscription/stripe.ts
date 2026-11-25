import crypto from "node:crypto";
import { config } from "../../config.js";
import { notConfigured, upstreamError } from "../../lib/errors.js";

/** Minimal Stripe REST client (form-encoded requests). */
export async function stripeRequest<T>(path: string, params: Record<string, string>): Promise<T> {
  if (!config.STRIPE_SECRET_KEY) {
    throw notConfigured("payments", "Payments are not configured on this server. An administrator must set STRIPE_SECRET_KEY and STRIPE_PRICE_PRO.");
  }
  let res: Response;
  try {
    res = await fetch(`https://api.stripe.com/v1${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw upstreamError("payments", "The payment provider could not be reached. Please try again.");
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok || !body) throw upstreamError("payments", `Payment provider error: ${body?.error?.message ?? res.status}`);
  return body;
}

/**
 * Verify a Stripe webhook signature header ("t=...,v1=...") against the raw body.
 * https://docs.stripe.com/webhooks#verify-manually
 */
export function verifyStripeSignature(raw: Buffer, header: string | undefined, secret: string, toleranceSec = 300) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i), kv.slice(i + 1)];
    }),
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${raw.toString("utf8")}`).digest("hex");
  const candidates = header
    .split(",")
    .filter((kv) => kv.startsWith("v1="))
    .map((kv) => kv.slice(3));
  return candidates.some((sig) => sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}
