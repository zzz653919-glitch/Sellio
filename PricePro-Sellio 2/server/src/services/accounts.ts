import { transaction, type Statement } from "../db/index.js";
import { deleteAllFilesOf } from "./storage.js";

/**
 * Delete an account and every record it owns (children first). Foreign-key cascades are not relied on:
 * hosted libSQL connections may not have foreign-key enforcement switched on.
 * Used by the account page and by the admin panel.
 */
export async function deleteAccount(u: string) {
  await deleteAllFilesOf(u);
  await transaction([
    ["DELETE FROM support_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE user_id = ?)", u],
    ["DELETE FROM support_tickets WHERE user_id = ?", u],
    ["DELETE FROM user_flags WHERE user_id = ?", u],
    ["DELETE FROM admin_roles WHERE user_id = ?", u],
    ["DELETE FROM initiative_assets WHERE user_id = ?", u],
    ["DELETE FROM initiatives WHERE user_id = ?", u],
    ["DELETE FROM campaign_stats WHERE user_id = ?", u],
    ["DELETE FROM campaign_items WHERE user_id = ?", u],
    ["DELETE FROM sales_points WHERE dataset_id IN (SELECT id FROM sales_datasets WHERE user_id = ?)", u],
    ...["login_challenges", "sessions", "email_tokens", "competitors", "business_datasets", "business_reports", "advisor_messages", "campaigns", "competitor_ads", "ad_copies", "ai_requests", "brand_profiles", "notifications", "activity", "favorites", "projects", "market_analyses",
      "price_searches", "forecasts", "sales_datasets", "assistant_messages", "generations", "uploads", "subscription_events",
      "subscriptions", "user_settings"].map((t): Statement => [`DELETE FROM ${t} WHERE user_id = ?`, u]),
    ["DELETE FROM users WHERE id = ?", u],
  ]);
}
