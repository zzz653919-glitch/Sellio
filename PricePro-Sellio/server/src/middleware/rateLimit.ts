import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { isTest } from "../config.js";

const json = (message: string) => ({ error: { code: "RATE_LIMITED", message } });

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 10_000 : 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json("Too many requests. Please slow down."),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 10_000 : 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json("Too many authentication attempts. Try again in a few minutes."),
});

/** Per-user limiter for expensive service calls (on top of monthly plan limits). */
export const serviceLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isTest ? 10_000 : 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? "0.0.0.0"),
  message: json("Too many service requests in a short time. Please wait a minute."),
});
