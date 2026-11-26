import { Router, type Request, type Response } from "express";
import { config, features } from "../../config.js";
import { all, get, run, transaction } from "../../db/index.js";
import { badRequest } from "../../lib/errors.js";
import { newId, nowIso } from "../../lib/util.js";
import { currentUser, requireAuth } from "../../middleware/auth.js";
import { logActivity } from "../../services/activity.js";
import { notify } from "../../services/notifications.js";
import { getPlans, usage } from "../../services/plans.js";
import { stripeRequest, verifyStripeSignature } from "./stripe.js";

export const subscriptionRouter = Router();
subscriptionRouter.use(requireAuth);

type SubRow = {
  user_id: string; plan: "free" | "pro"; status: string; provider: string | null; provider_customer_id: string | null;
  provider_subscription_id: string | null; current_period_end: string | null; cancel_at_period_end: number; updated_at: string;
};

subscriptionRouter.get("/", async (req, res) => {
  const user = currentUser(req);
  const sub = await get<SubRow>("SELECT * FROM subscriptions WHERE user_id = ?", user.id);
  const history = await all<{ id: string; type: string; plan: string | null; amount_cents: number | null; currency: string | null; created_at: string }>(
    "SELECT id, type, plan, amount_cents, currency, created_at FROM subscription_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
    user.id,
  );
  res.json({
    plan: user.plan,
    subscription: sub
      ? { plan: sub.plan, status: sub.status, provider: sub.provider, currentPeriodEnd: sub.current_period_end, cancelAtPeriodEnd: sub.cancel_at_period_end === 1, manageable: Boolean(sub.provider_customer_id) }
      : null,
    plans: getPlans(),
    usage: await usage(user.id),
    history: history.map((h) => ({ id: h.id, type: h.type, plan: h.plan, amountCents: h.amount_cents, currency: h.currency, createdAt: h.created_at })),
    paymentsConfigured: features.payments,
  });
});

subscriptionRouter.post("/checkout", async (req, res) => {
  const user = currentUser(req);
  if (user.plan === "pro") throw badRequest("You are already on the Pro plan.");
  if (!getPlans().pro.enabled) throw badRequest("The Pro plan is not available for purchase right now.");
  if (!features.payments) {
    await stripeRequest("/checkout/sessions", {}); // throws SERVICE_NOT_CONFIGURED
  }
  const sub = await get<SubRow>("SELECT * FROM subscriptions WHERE user_id = ?", user.id);
  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": config.STRIPE_PRICE_PRO!,
    "line_items[0][quantity]": "1",
    success_url: `${config.APP_URL}/subscription?checkout=success`,
    cancel_url: `${config.APP_URL}/subscription?checkout=cancelled`,
    client_reference_id: user.id,
    "subscription_data[metadata][userId]": user.id,
    "metadata[userId]": user.id,
  };
  if (sub?.provider_customer_id) params.customer = sub.provider_customer_id;
  else params.customer_email = user.email;
  const session = await stripeRequest<{ id: string; url: string }>("/checkout/sessions", params);
  await run(
    "INSERT INTO subscription_events (id,user_id,type,plan,provider_ref,created_at) VALUES (?,?,?,?,?,?)",
    newId(), user.id, "checkout_started", "pro", session.id, nowIso(),
  );
  // The plan changes only when Stripe confirms payment through the webhook.
  res.json({ url: session.url });
});

subscriptionRouter.post("/portal", async (req, res) => {
  const user = currentUser(req);
  const sub = await get<SubRow>("SELECT * FROM subscriptions WHERE user_id = ?", user.id);
  if (!sub?.provider_customer_id) throw badRequest("There is no paid subscription to manage.");
  const portal = await stripeRequest<{ url: string }>("/billing_portal/sessions", {
    customer: sub.provider_customer_id,
    return_url: `${config.APP_URL}/subscription`,
  });
  res.json({ url: portal.url });
});

// ------------------------------------------------------------------ webhook
type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

async function setPlan(userId: string, plan: "free" | "pro", fields: Partial<SubRow>, event: { type: string; amount?: number | null; currency?: string | null; ref?: string | null }) {
  const previous = (await get<{ plan: string }>("SELECT plan FROM users WHERE id = ?", userId))?.plan;
  const now = nowIso();
  await transaction([
    ["UPDATE users SET plan = ?, updated_at = ? WHERE id = ?", plan, now, userId],
    [`INSERT INTO subscriptions (user_id,plan,status,provider,provider_customer_id,provider_subscription_id,current_period_end,cancel_at_period_end,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan, status=excluded.status, provider=COALESCE(excluded.provider, provider),
         provider_customer_id=COALESCE(excluded.provider_customer_id, provider_customer_id),
         provider_subscription_id=COALESCE(excluded.provider_subscription_id, provider_subscription_id),
         current_period_end=COALESCE(excluded.current_period_end, current_period_end),
         cancel_at_period_end=excluded.cancel_at_period_end, updated_at=excluded.updated_at`,
      userId, plan, fields.status ?? "active", fields.provider ?? "stripe", fields.provider_customer_id ?? null,
      fields.provider_subscription_id ?? null, fields.current_period_end ?? null, fields.cancel_at_period_end ?? 0, now,],
    ["INSERT INTO subscription_events (id,user_id,type,plan,amount_cents,currency,provider_ref,created_at) VALUES (?,?,?,?,?,?,?,?)",
      newId(), userId, event.type, plan, event.amount ?? null, event.currency ?? null, event.ref ?? null, now,],
  ]);
  if (previous !== plan) {
    await logActivity(userId, "plan_changed", "account", `Plan changed to ${getPlans()[plan].name}`);
    await notify(userId, "account", `You are now on the ${getPlans()[plan].name} plan`,
      plan === "pro" ? "Your payment was confirmed. Pro limits are active." : "Your Pro subscription has ended. You are on the Free plan.");
  }
}

async function userForSubscription(obj: Record<string, unknown>): Promise<string | null> {
  const metaUser = (obj.metadata as Record<string, string> | undefined)?.userId;
  if (metaUser && await get("SELECT id FROM users WHERE id = ?", metaUser)) return metaUser;
  const bySub = await get<{ user_id: string }>("SELECT user_id FROM subscriptions WHERE provider_subscription_id = ?", String(obj.id ?? ""));
  if (bySub) return bySub.user_id;
  const byCustomer = await get<{ user_id: string }>("SELECT user_id FROM subscriptions WHERE provider_customer_id = ?", String(obj.customer ?? ""));
  return byCustomer?.user_id ?? null;
}

const isoFromUnix = (v: unknown) => (typeof v === "number" ? new Date(v * 1000).toISOString() : null);

export async function handleStripeEvent(event: StripeEvent) {
  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed": {
      const userId = typeof obj.client_reference_id === "string" ? obj.client_reference_id : null;
      if (!userId || !await get("SELECT id FROM users WHERE id = ?", userId)) return;
      if (obj.mode !== "subscription" || (obj.payment_status !== "paid" && obj.payment_status !== "no_payment_required")) return;
      await setPlan(userId, "pro", {
        status: "active", provider: "stripe",
        provider_customer_id: typeof obj.customer === "string" ? obj.customer : null,
        provider_subscription_id: typeof obj.subscription === "string" ? obj.subscription : null,
      }, { type: "upgraded", amount: (obj.amount_total as number) ?? null, currency: (obj.currency as string) ?? null, ref: String(obj.id) });
      return;
    }
    case "customer.subscription.updated": {
      const userId = await userForSubscription(obj);
      if (!userId) return;
      const status = String(obj.status);
      const items = (obj.items as { data?: { current_period_end?: number }[] } | undefined)?.data;
      const periodEnd = isoFromUnix(obj.current_period_end ?? items?.[0]?.current_period_end);
      const active = ["active", "trialing", "past_due"].includes(status);
      await setPlan(userId, active ? "pro" : "free", {
        status, provider: "stripe", provider_subscription_id: String(obj.id),
        provider_customer_id: typeof obj.customer === "string" ? obj.customer : null,
        current_period_end: periodEnd, cancel_at_period_end: obj.cancel_at_period_end ? 1 : 0,
      }, { type: active ? (obj.cancel_at_period_end ? "cancellation_scheduled" : "subscription_updated") : "downgraded", ref: String(obj.id) });
      return;
    }
    case "customer.subscription.deleted": {
      const userId = await userForSubscription(obj);
      if (!userId) return;
      await setPlan(userId, "free", { status: "canceled", provider: "stripe", cancel_at_period_end: 0 }, { type: "canceled", ref: String(obj.id) });
      return;
    }
    case "invoice.paid": {
      const byCustomer = await get<{ user_id: string }>("SELECT user_id FROM subscriptions WHERE provider_customer_id = ?", String(obj.customer ?? ""));
      if (!byCustomer) return;
      await run(
        "INSERT INTO subscription_events (id,user_id,type,plan,amount_cents,currency,provider_ref,created_at) VALUES (?,?,?,?,?,?,?,?)",
        newId(), byCustomer.user_id, "payment", "pro", (obj.amount_paid as number) ?? null, (obj.currency as string) ?? null, String(obj.id), nowIso(),
      );
      return;
    }
    case "invoice.payment_failed": {
      const byCustomer = await get<{ user_id: string }>("SELECT user_id FROM subscriptions WHERE provider_customer_id = ?", String(obj.customer ?? ""));
      if (!byCustomer) return;
      await run(
        "INSERT INTO subscription_events (id,user_id,type,plan,amount_cents,currency,provider_ref,created_at) VALUES (?,?,?,?,?,?,?,?)",
        newId(), byCustomer.user_id, "payment_failed", "pro", (obj.amount_due as number) ?? null, (obj.currency as string) ?? null, String(obj.id), nowIso(),
      );
      return;
    }
    case "charge.refunded": {
      const byCustomer = await get<{ user_id: string }>("SELECT user_id FROM subscriptions WHERE provider_customer_id = ?", String(obj.customer ?? ""));
      if (!byCustomer) return;
      await run(
        "INSERT INTO subscription_events (id,user_id,type,plan,amount_cents,currency,provider_ref,created_at) VALUES (?,?,?,?,?,?,?,?)",
        newId(), byCustomer.user_id, "refund", "pro", (obj.amount_refunded as number) ?? null, (obj.currency as string) ?? null, String(obj.id), nowIso(),
      );
      return;
    }
    default:
      return;
  }
}

export async function stripeWebhook(req: Request, res: Response) {
  if (!config.STRIPE_WEBHOOK_SECRET) {
    res.status(503).json({ error: { code: "SERVICE_NOT_CONFIGURED", message: "Webhook secret not configured" } });
    return;
  }
  const raw = req.body as Buffer;
  if (!Buffer.isBuffer(raw) || !verifyStripeSignature(raw, req.get("stripe-signature"), config.STRIPE_WEBHOOK_SECRET)) {
    res.status(400).json({ error: { code: "BAD_SIGNATURE", message: "Invalid signature" } });
    return;
  }
  let event: StripeEvent;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    res.status(400).json({ error: { code: "BAD_JSON", message: "Invalid payload" } });
    return;
  }
  if (await get("SELECT id FROM processed_webhook_events WHERE id = ?", event.id)) {
    res.json({ received: true, duplicate: true });
    return;
  }
  await handleStripeEvent(event);
  await run("INSERT INTO processed_webhook_events (id, created_at) VALUES (?, ?)", event.id, nowIso());
  res.json({ received: true });
}
