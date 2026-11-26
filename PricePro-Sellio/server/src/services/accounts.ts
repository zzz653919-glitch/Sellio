import { all, transaction, type Statement } from "../db/index.js";
import { deleteAllFilesOf, removePrivateFile } from "./storage.js";

/**
 * Delete an account and every record it owns (children first). Foreign-key cascades are not relied on:
 * hosted libSQL connections may not have foreign-key enforcement switched on.
 * Used by the account page and by the admin panel.
 */
export async function deleteAccount(u: string) {
  await deleteAllFilesOf(u);
  for (const r of await all<{ receipt_key: string | null }>("SELECT receipt_key FROM payment_requests WHERE user_id = ? AND receipt_key IS NOT NULL", u)) {
    if (r.receipt_key) await removePrivateFile(r.receipt_key);
  }
  await transaction([
    ["DELETE FROM support_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE user_id = ?)", u],
    ["DELETE FROM support_tickets WHERE user_id = ?", u],
    ["DELETE FROM user_flags WHERE user_id = ?", u],
    ["DELETE FROM admin_roles WHERE user_id = ?", u],
    ["DELETE FROM campaign_stats WHERE user_id = ?", u],
    ["DELETE FROM campaign_items WHERE user_id = ?", u],
    ["DELETE FROM sales_points WHERE dataset_id IN (SELECT id FROM sales_datasets WHERE user_id = ?)", u],
    ...["template_favorites", "payment_requests", "usage_events", "login_challenges", "sessions", "email_tokens", "campaigns", "competitor_ads", "ad_copies", "ai_requests", "brand_profiles", "notifications", "activity", "favorites", "projects", "market_analyses",
      "price_searches", "forecasts", "sales_datasets", "assistant_messages", "generations", "uploads", "subscription_events",
      "subscriptions", "user_settings"].map((t): Statement => [`DELETE FROM ${t} WHERE user_id = ?`, u]),
    ["DELETE FROM users WHERE id = ?", u],
  ]);
}
