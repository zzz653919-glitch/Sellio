import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { config, features } from "./config.js";
import { getDb } from "./db/index.js";
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
import { pricesRouter } from "./modules/prices/routes.js";
import { projectsRouter } from "./modules/projects/routes.js";
import { studioRouter } from "./modules/studio/routes.js";
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
          // Store product thumbnails come from external CDNs returned by price providers.
          imgSrc: ["'self'", "data:", "blob:", "https:"],
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

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use("/api", apiLimiter, loadSession, requireClientHeader);

  /** Open /api/health after deploying: it says what is missing (never shows secret values). */
  app.get("/api/health", async (_req, res) => {
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
    const email = {
      ok: features.email || config.NODE_ENV !== "production",
      ...(!features.email && config.NODE_ENV === "production" ? { error: "SMTP_* is not set: sign-up and sign-in codes cannot be emailed." } : {}),
    };
    const ok = database.ok && storage.ok && email.ok;
    res.status(ok ? 200 : 503).json({
      ok,
      platform: onVercel ? "vercel" : "server",
      checks: { database, storage, email },
      integrations: { imageGeneration: features.imageGeneration, serpapi: features.serpapi, ebay: features.ebay, payments: features.payments },
    });
  });
  app.get("/api/meta", (_req, res) => {
    res.json({
      integrations: {
        email: features.email,
        imageGeneration: features.imageGeneration,
        priceProviders: { serpapi: features.serpapi, ebay: features.ebay },
        marketDataProviders: [],
        payments: features.payments,
      },
    });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/user", userRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/studio", studioRouter);
  app.use("/api/market", marketRouter);
  app.use("/api/prices", pricesRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/favorites", favoritesRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/subscription", subscriptionRouter);
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
