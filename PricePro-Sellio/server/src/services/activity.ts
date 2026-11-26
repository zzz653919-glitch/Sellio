import { run } from "../db/index.js";
import { newId, nowIso } from "../lib/util.js";

export type ActivityType =
  | "signup"
  | "payment_started"
  | "payment_submitted"
  | "login"
  | "email_verified"
  | "password_changed"
  | "profile_updated"
  | "ad_created"
  | "ad_failed"
  | "image_uploaded"
  | "market_analysis"
  | "project_saved"
  | "project_deleted"
  | "favorite_added"
  | "plan_changed";

export type Service = "studio" | "forecast" | "account" | "projects" | "assistant";

export async function logActivity(
  userId: string,
  type: ActivityType,
  service: Service,
  title: string,
  opts: { refId?: string | null; success?: boolean; durationMs?: number | null } = {},
) {
  await run(
    `INSERT INTO activity (id,user_id,type,service,ref_id,title,success,duration_ms,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    newId(), userId, type, service, opts.refId ?? null, title.slice(0, 300),
    opts.success === false ? 0 : 1, opts.durationMs ?? null, nowIso(),
  );
}
