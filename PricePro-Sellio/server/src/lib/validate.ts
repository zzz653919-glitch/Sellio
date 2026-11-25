import type { Request } from "express";
import { z } from "zod";
import { badRequest } from "./errors.js";

function format(error: z.ZodError) {
  return error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

export function parseBody<T extends z.ZodType>(req: Request, schema: T): z.infer<T> {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) throw badRequest("Invalid request data", format(result.error));
  return result.data;
}

export function parseQuery<T extends z.ZodType>(req: Request, schema: T): z.infer<T> {
  const result = schema.safeParse(req.query ?? {});
  if (!result.success) throw badRequest("Invalid query parameters", format(result.error));
  return result.data;
}

export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(value)) {
    throw badRequest(`Invalid ${name}`);
  }
  return value;
}

export const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
