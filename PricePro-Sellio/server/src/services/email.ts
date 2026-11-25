import nodemailer, { type Transporter } from "nodemailer";
import { config, features, isProd } from "../config.js";

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
    await t.sendMail({ from: config.EMAIL_FROM, ...mail });
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
