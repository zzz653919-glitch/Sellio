import type { Request } from "express";
import { z } from "zod";
import { get } from "../../db/index.js";
import { badRequest } from "../../lib/errors.js";
import { parseQuery } from "../../lib/validate.js";
import { currentUser } from "../../middleware/auth.js";
import { verifyPassword } from "../auth/service.js";

export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const pageOf = (req: Request) => {
  const p = parseQuery(req, pageSchema.passthrough());
  return { page: p.page, limit: p.limit, offset: (p.page - 1) * p.limit };
};

/** Date range from ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: the last 30 days), as ISO bounds. */
export function rangeOf(req: Request) {
  const q = req.query as Record<string, string | undefined>;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const today = new Date().toISOString().slice(0, 10);
  const to = q.to && re.test(q.to) ? q.to : today;
  const from = q.from && re.test(q.from) ? q.from : new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
  if (from > to) throw badRequest("The start date must be before the end date.");
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 3660) throw badRequest("The range can be at most 10 years.");
  return { from, to, fromIso: `${from}T00:00:00.000Z`, toIso: `${to}T23:59:59.999Z` };
}

/** Sensitive actions require the admin's own password again. */
export async function confirmPassword(req: Request, password: unknown) {
  if (typeof password !== "string" || !password) throw badRequest("Enter your password to confirm this action.");
  const row = await get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", currentUser(req).id);
  if (!row || !(await verifyPassword(password, row.password_hash))) throw badRequest("Your password is incorrect.");
}

/** Escape a search string for LIKE with ESCAPE '\'. */
export const like = (v: string) => `%${v.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

/** Days between two dates inclusive, as YYYY-MM-DD strings (for charts with no gaps). */
export function daysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`) && out.length < 4000; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
