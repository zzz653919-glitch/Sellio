import nodemailer, { type Transporter } from "nodemailer";
import { config, features, isProd } from "../config.js";
import { AppError } from "../lib/errors.js";

/**
 * A short, actionable reason for a failed send, shown to the user instead of a generic error.
 * Contains no secrets: only the kind of failure.
 */
export function describeSmtpError(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; response?: string; message?: string } | null;
  const text = `${e?.response ?? ""} ${e?.message ?? ""}`;
  if (e?.code === "EAUTH" || e?.responseCode === 535 || /Username and Password not accepted|Invalid login|BadCredentials/i.test(text)) {
    return "The email server rejected the login. Check SMTP_USER and SMTP_PASS (Gmail needs a 16-character App password, not the normal password).";
  }
  if (e?.code === "ESOCKET" || e?.code === "ECONNECTION" || e?.code === "ETIMEDOUT" || e?.code === "ECONNREFUSED" || /wrong version number|greeting never received/i.test(text)) {
    return "Could not connect to the email server. Check SMTP_HOST, SMTP_PORT and SMTP_SECURE (Gmail: smtp.gmail.com, 465, true).";
  }
  if (e?.code === "EENVELOPE" || /sender address|not owned by user|5\.7\.0/i.test(text)) {
    return "The email server refused the sender address. EMAIL_FROM must use the same address as SMTP_USER.";
  }
  return "The email could not be sent. Please try again later.";
}

export type SentEmail = { to: string; subject: string; text: string };

/** In development/test without SMTP, emails are kept here and printed to the log. */
export const outbox: SentEmail[] = [];

let transporter: Transporter | null = null;
function getTransporter() {
  if (!features.email) return null;
  transporter ??= nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });
  return transporter;
}

export async function sendEmail(mail: SentEmail): Promise<{ delivered: boolean }> {
  const t = getTransporter();
  if (t) {
    try {
      await t.sendMail({ from: config.EMAIL_FROM, ...mail });
    } catch (err) {
      console.error("[email] sending failed:", err);
      throw new AppError(502, "EMAIL_FAILED", describeSmtpError(err), { service: "email" });
    }
    return { delivered: true };
  }
  if (isProd) {
    console.error(`[email] SMTP is not configured; could not send "${mail.subject}" to ${mail.to}`);
    return { delivered: false };
  }
  outbox.push(mail);
  if (config.NODE_ENV !== "test") {
    console.log(`\n[email:dev] To: ${mail.to}\nSubject: ${mail.subject}\n${mail.text}\n`);
  }
  return { delivered: false };
}
