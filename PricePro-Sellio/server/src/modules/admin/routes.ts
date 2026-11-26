import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { isTest } from "../../config.js";
import { requireAuth } from "../../middleware/auth.js";
import { billingAdminRouter } from "./billing.js";
import { commsAdminRouter } from "./comms.js";
import { contentAdminRouter } from "./content.js";
import { dashboardAdminRouter } from "./dashboard.js";
import { insightsAdminRouter } from "./insights.js";
import { requireAdmin } from "./permissions.js";
import { systemRouter } from "./system.js";
import { usersAdminRouter } from "./users.js";

/** Admin panel API. Every route checks the admin role and permission on the server. */
export const adminRouter = Router();

const adminLimiter = rateLimit({
  windowMs: 60_000,
  limit: isTest ? 10_000 : 240,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? "0.0.0.0"),
  message: { error: { code: "RATE_LIMITED", message: "Too many admin requests. Please wait a minute." } },
});

adminRouter.use(requireAuth, adminLimiter);
// /me and the 2FA endpoints work before the 2FA check; everything else requires it.
adminRouter.use(systemRouter);
adminRouter.use(requireAdmin());
adminRouter.use(dashboardAdminRouter);
adminRouter.use(usersAdminRouter);
adminRouter.use(contentAdminRouter);
adminRouter.use(billingAdminRouter);
adminRouter.use(commsAdminRouter);
adminRouter.use(insightsAdminRouter);
