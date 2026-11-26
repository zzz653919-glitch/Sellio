import type { Request } from "express";
import { run } from "../db/index.js";
import { newId, nowIso } from "../lib/util.js";

/** Who did what, when, to which record. Written for every important admin action. */
export async function logAudit(req: Request, action: string, target: { type?: string; id?: string | null }, summary: string, details?: unknown) {
  const admin = req.user;
  await run(
    "INSERT INTO audit_logs (id,admin_id,admin_email,action,target_type,target_id,summary,details_json,ip,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    newId(), admin?.id ?? null, admin?.email ?? "system", action, target.type ?? null, target.id ?? null, summary.slice(0, 300),
    details === undefined ? null : JSON.stringify(details).slice(0, 4000), req.ip ?? null, nowIso(),
  );
}

export async function recordLoginAttempt(req: Request, email: string, userId: string | null, success: boolean, reason: string | null) {
  await run(
    "INSERT INTO login_attempts (id,email,user_id,success,reason,ip,user_agent,created_at) VALUES (?,?,?,?,?,?,?,?)",
    newId(), email.toLowerCase().slice(0, 200), userId, success ? 1 : 0, reason, req.ip ?? null, (req.get("user-agent") ?? "").slice(0, 300), nowIso(),
  );
}
