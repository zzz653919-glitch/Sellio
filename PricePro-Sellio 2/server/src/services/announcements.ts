/** Admin announcements become normal notifications when their publish time arrives (no cron needed). */
import { all, run } from "../db/index.js";
import { nowIso } from "../lib/util.js";

let lastCheck = 0;

export async function deliverDueAnnouncements(force = false) {
  if (!force && Date.now() - lastCheck < 30_000) return 0;
  lastCheck = Date.now();
  const now = nowIso();
  const due = await all<{ id: string; title: string; body: string; link: string | null; audience: "all" | "selected"; user_ids_json: string }>(
    "SELECT id, title, body, link, audience, user_ids_json FROM announcements WHERE delivered_at IS NULL AND publish_at <= ? ORDER BY publish_at LIMIT 20", now,
  );
  let delivered = 0;
  for (const a of due) {
    // Claim it first so two server instances never deliver the same announcement twice.
    const claim = await run("UPDATE announcements SET delivered_at = ? WHERE id = ? AND delivered_at IS NULL", now, a.id);
    if (!claim.changes) continue;
    const audienceSql = a.audience === "all" ? "status = 'active'" : "status = 'active' AND id IN (SELECT value FROM json_each(?))";
    const r = await run(
      `INSERT INTO notifications (id, user_id, type, title, body, link, created_at, announcement_id)
       SELECT lower(hex(randomblob(16))), id, 'announcement', ?, ?, ?, ?, ? FROM users WHERE ${audienceSql}`,
      ...(a.audience === "all" ? [a.title, a.body, a.link, now, a.id] : [a.title, a.body, a.link, now, a.id, a.user_ids_json]),
    );
    await run("UPDATE announcements SET recipients = ? WHERE id = ?", r.changes, a.id);
    delivered++;
  }
  return delivered;
}
