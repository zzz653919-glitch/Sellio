import { get, run } from "../db/index.js";
import { newId, nowIso } from "../lib/util.js";
import { sendEmail } from "./email.js";

export type NotificationType = "generation" | "forecast" | "price" | "account";

const TOGGLE: Record<NotificationType, string> = {
  generation: "notify_generation",
  forecast: "notify_forecast",
  price: "notify_price",
  account: "notify_account",
};

type Prefs = Record<string, number>;

/**
 * Create a notification for a real platform event, honouring the user's preferences.
 * Account notifications may also be emailed when the user allows email notifications.
 */
export async function notify(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  link?: string,
) {
  const prefs = await get<Prefs>("SELECT * FROM user_settings WHERE user_id = ?", userId);
  const allowed = !prefs || (prefs.notify_inapp === 1 && prefs[TOGGLE[type]] === 1);
  if (allowed) {
    await run(
      "INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)",
      newId(), userId, type, title.slice(0, 200), body.slice(0, 1000), link ?? null, nowIso(),
    );
  }
  if (type === "account" && (!prefs || (prefs.notify_email === 1 && prefs.notify_account === 1))) {
    const user = await get<{ email: string }>("SELECT email FROM users WHERE id = ?", userId);
    if (user) {
      void sendEmail({ to: user.email, subject: `PricePro: ${title}`, text: body }).catch((err) =>
        console.error("[notify] email failed", err),
      );
    }
  }
}
