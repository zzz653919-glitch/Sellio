import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { config, features } from "./config.js";
import { getDb } from "./db/index.js";
import { smtpSummary, verifySmtp } from "./services/email.js";
import { loadSession, requireClientHeader } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { apiLimiter } from "./middleware/rateLimit.js";
import { analyticsRouter } from "./modules/analytics/routes.js";
import { authRouter } from "./modules/auth/routes.js";
import { dashboardRouter } from "./modules/dashboard/routes.js";
import { favoritesRouter } from "./modules/favorites/routes.js";
import { filesRouter } from "./modules/files/routes.js";
import { marketRouter } from "./modules/forecast/marketRoutes.js";
import { notificationsRouter } from "./modules/notifications/routes.js";
import { projectsRouter } from "./modules/projects/routes.js";
import { studioRouter } from "./modules/studio/routes.js";
import { adsRouter } from "./modules/ads/routes.js";
import { advisorRouter } from "./modules/advisor/routes.js";
import { campaignsRouter } from "./modules/campaigns/routes.js";
import { growthRouter } from "./modules/growth/routes.js";
import { adminRouter } from "./modules/admin/routes.js";
import { supportRouter } from "./modules/support/routes.js";
import { topDemand } from "./modules/forecast/topDemand.js";
import { countryStats } from "./modules/intel/worldbank.js";
import { businessRouter } from "./modules/business/routes.js";
import { intelRouter } from "./modules/intel/routes.js";
import { llmProvider } from "./services/llm.js";
import { deliverDueAnnouncements } from "./services/announcements.js";
import { refreshSettings, settings } from "./services/settings.js";
import { stripeWebhook, subscriptionRouter } from "./modules/subscription/routes.js";
import { userRouter } from "./modules/user/routes.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (config.TRUST_PROXY > 0) app.set("trust proxy", config.TRUST_PROXY);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          mediaSrc: ["'self'", "blob:"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          connectSrc: ["'self'"],
          scriptSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Stripe needs the raw body for signature verification, so it is mounted before JSON parsing.
  app.post("/api/webhooks/stripe", express.raw({ type: "application/json", limit: "1mb" }), stripeWebhook);

  // Sales data uploads parse their own (larger) JSON body.
  const json1mb = express.json({ limit: "1mb" });
  app.use((req, res, next) => (req.path.startsWith("/api/business/datasets") ? next() : json1mb(req, res, next)));
  app.use(cookieParser());
  app.use("/api", apiLimiter, async (_req, _res, next) => { await refreshSettings(); next(); }, loadSession, requireClientHeader);

  // Public status for the web app: maintenance mode and whether sign-up is open.
  app.get("/api/status", (_req, res) => {
    const s = settings();
    res.json({ maintenance: s.maintenance.enabled, message: s.maintenance.message, registrationOpen: s.registrationOpen });
  });
  // Maintenance mode: normal users get 503; administrators, sign-in, health and webhooks keep working.
  app.use("/api", (req, res, next) => {
    if (!settings().maintenance.enabled || req.user?.admin_role) return next();
    if (/^\/(health|status|meta|auth\/|admin\/|cron\/)/.test(req.path)) return next();
    res.status(503).json({ error: { code: "MAINTENANCE", message: settings().maintenance.message || "Vendora is under maintenance. Please try again soon." } });
  });

  /** Open /api/health after deploying: it says what is missing (never shows secret values). */
  app.get("/api/health", async (req, res) => {
    const onVercel = Boolean(process.env.VERCEL);
    let database: { ok: boolean; driver: string; error?: string };
    try {
      await getDb();
      database = { ok: true, driver: config.TURSO_DATABASE_URL ? "turso" : "sqlite-file" };
    } catch (err) {
      database = { ok: false, driver: config.TURSO_DATABASE_URL ? "turso" : "sqlite-file", error: err instanceof Error ? err.message : "Database error" };
    }
    const storage = {
      ok: !onVercel || features.blobStorage,
      driver: features.blobStorage ? (config.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "vercel-blob (oidc)") : "local-disk",
      ...(onVercel && !features.blobStorage
        ? { error: "No Vercel Blob store is connected (neither BLOB_READ_WRITE_TOKEN nor BLOB_STORE_ID is set). Connect the store, then redeploy." }
        : {}),
    };
    // ?email=verify really logs in to the SMTP server (nothing is sent).
    const login = features.email && req.query.email === "verify" ? await verifySmtp() : undefined;
    const email = {
      ok: (features.email || config.NODE_ENV !== "production") && (login ? login.ok : true),
      ...(!features.email && config.NODE_ENV === "production" ? { error: "SMTP_* is not set: sign-up and sign-in codes cannot be emailed." } : {}),
      ...(features.email ? { settings: smtpSummary() } : {}),
      ...(login ? { login: login.ok ? "accepted" : "rejected", ...(login.error ? { error: login.error } : {}) } : { login: "not checked (open /api/health?email=verify)" }),
    };
    const ok = database.ok && storage.ok && email.ok;
    res.status(ok ? 200 : 503).json({
      ok,
      platform: onVercel ? "vercel" : "server",
      checks: { database, storage, email },
      integrations: {
        imageGeneration: features.imageGeneration, serpapi: features.serpapi, payments: features.payments,
        worldBank: features.worldBank, comtrade: features.comtrade, textAi: llmProvider()?.name ?? false,
      },
    });
  });
  app.get("/api/meta", (_req, res) => {
    res.json({
      integrations: {
        email: features.email,
        imageGeneration: features.imageGeneration,
        textAi: features.llm,
        trends: features.serpapi,
        worldBank: features.worldBank,
        comtrade: features.comtrade,
        payments: features.payments,
      },
    });
  });

  // Daily warm-up (Vercel Cron sends "Authorization: Bearer $CRON_SECRET"). Refreshes the shared
  // Market Radar and Uzbekistan statistics when their cache is old; nothing user-specific.
  app.get("/api/cron/warm", async (req, res) => {
    if (!config.CRON_SECRET || req.get("authorization") !== `Bearer ${config.CRON_SECRET}`) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
      return;
    }
    const started = Date.now();
    const result: Record<string, string> = {};
    try { result.radar = (await topDemand("UZ")) ? "ok" : "not configured"; } catch (e) { result.radar = e instanceof Error ? e.message : "failed"; }
    try { result.announcements = `${await deliverDueAnnouncements(true)} delivered`; } catch (e) { result.announcements = e instanceof Error ? e.message : "failed"; }
    try { result.worldBank = features.worldBank ? ((await countryStats(["UZ"])), "ok") : "off"; } catch (e) { result.worldBank = e instanceof Error ? e.message : "failed"; }
    res.json({ ok: true, ms: Date.now() - started, ...result });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/user", userRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/studio", studioRouter);
  app.use("/api/market", marketRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/favorites", favoritesRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/subscription", subscriptionRouter);
  app.use("/api/intel", intelRouter);
  app.use("/api/business", businessRouter);
  app.use("/api/advisor", advisorRouter);
  app.use("/api/ads", adsRouter);
  app.use("/api/campaigns", campaignsRouter);
  app.use("/api/growth", growthRouter);
  app.use("/api/support", supportRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api", notFoundHandler);

  // Serve the built web app in production.
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (fs.existsSync(path.join(webDist, "index.html"))) {
    app.use(express.static(webDist, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
