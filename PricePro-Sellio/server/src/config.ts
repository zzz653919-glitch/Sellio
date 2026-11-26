import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  // On Vercel the production domain is known from the platform when APP_URL is not set.
  APP_URL: z.string().default(
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:5173",
  ),
  DATABASE_PATH: z.string().default(path.join(serverRoot, "data", "pricepro.sqlite")),
  // Turso / libSQL (required on Vercel: serverless functions have no persistent disk)
  TURSO_DATABASE_URL: optional,
  TURSO_AUTH_TOKEN: optional,
  // Vercel Blob for uploaded and generated images (required on Vercel)
  BLOB_READ_WRITE_TOKEN: optional,
  // Newer (private) Blob stores connect with BLOB_STORE_ID + Vercel OIDC instead of a token.
  BLOB_STORE_ID: optional,
  BLOB_ACCESS: z.enum(["private", "public"]).default("private"),
  STORAGE_DIR: z.string().default(path.join(serverRoot, "data", "storage")),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  // Vercel always sits behind its own proxy, which sets X-Forwarded-For.
  TRUST_PROXY: z.coerce.number().int().min(0).default(process.env.VERCEL ? 1 : 0),

  // Email (SMTP). Without SMTP_HOST in development, emails are written to the server log.
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optional,
  SMTP_PASS: optional,
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  EMAIL_FROM: z.string().default("Vendora <no-reply@vendora.local>"),

  // AI image generation (OpenAI Images API)
  OPENAI_API_KEY: optional,
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  IMAGE_MODEL: z.string().default("gpt-image-2"), // gpt-image-1 was shut down in Oct 2026, gpt-image-1-mini on 1 Dec 2026

  // Google Trends via SerpApi (Demand Forecast)
  SERPAPI_API_KEY: optional,
  SERPAPI_BASE_URL: z.url().default("https://serpapi.com"),

  // Economic statistics: World Bank Open Data (free, no key). Set WORLD_BANK_ENABLED=false to turn off.
  WORLD_BANK_API_BASE: z.url().default("https://api.worldbank.org/v2"),
  WORLD_BANK_ENABLED: z.string().optional().transform((v) => v !== "false"),
  // Import / export by product group: UN Comtrade (free subscription key from comtradedeveloper.un.org)
  COMTRADE_API_KEY: optional,
  COMTRADE_API_BASE: z.url().default("https://comtradeapi.un.org/data/v1"),

  // Text AI for reports, growth explanations and ad copy.
  // Gemini has a free tier (aistudio.google.com); OpenAI is paid. LLM_PROVIDER picks one when both are set.
  LLM_PROVIDER: z.enum(["gemini", "openai"]).optional(),
  GEMINI_API_KEY: optional,
  GEMINI_MODEL: z.string().default("gemini-flash-latest"), // Google's alias for the current Flash model
  GEMINI_API_BASE: z.url().default("https://generativelanguage.googleapis.com/v1beta"),
  OPENAI_TEXT_MODEL: z.string().default("gpt-5.4-mini"),



  // Vercel Cron: a daily request refreshes shared market data so users do not wait for it.
  CRON_SECRET: optional,

  // Admin panel: comma-separated emails that are always Super Admins (the first administrators).
  SUPER_ADMIN_EMAILS: z.string().optional().transform((v) => (v ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.issues);
  process.exit(1);
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === "production";
export const isTest = config.NODE_ENV === "test";

export const features = {
  email: Boolean(config.SMTP_HOST),
  imageGeneration: Boolean(config.OPENAI_API_KEY),
  serpapi: Boolean(config.SERPAPI_API_KEY),
  worldBank: config.WORLD_BANK_ENABLED,
  comtrade: Boolean(config.COMTRADE_API_KEY),
  llm: Boolean(config.GEMINI_API_KEY || config.OPENAI_API_KEY),
  blobStorage: Boolean(config.BLOB_READ_WRITE_TOKEN || config.BLOB_STORE_ID),
};
