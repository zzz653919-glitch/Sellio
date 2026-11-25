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
  APP_URL: z.string().default("http://localhost:5173"),
  DATABASE_PATH: z.string().default(path.join(serverRoot, "data", "pricepro.sqlite")),
  STORAGE_DIR: z.string().default(path.join(serverRoot, "data", "storage")),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  // Email (SMTP). Without SMTP_HOST in development, emails are written to the server log.
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optional,
  SMTP_PASS: optional,
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  EMAIL_FROM: z.string().default("PricePro <no-reply@pricepro.local>"),

  // AI image generation (OpenAI Images API)
  OPENAI_API_KEY: optional,
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  IMAGE_MODEL: z.string().default("gpt-image-1"),

  // Price providers
  SERPAPI_API_KEY: optional,
  SERPAPI_GL: z.string().default("us"),
  SERPAPI_HL: z.string().default("en"),
  SERPAPI_BASE_URL: z.url().default("https://serpapi.com"),
  EBAY_CLIENT_ID: optional,
  EBAY_CLIENT_SECRET: optional,
  EBAY_MARKETPLACE_ID: z.string().default("EBAY_US"),


  // Payments (Stripe)
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_PRICE_PRO: optional,
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
  ebay: Boolean(config.EBAY_CLIENT_ID && config.EBAY_CLIENT_SECRET),
  payments: Boolean(config.STRIPE_SECRET_KEY && config.STRIPE_PRICE_PRO),
};
