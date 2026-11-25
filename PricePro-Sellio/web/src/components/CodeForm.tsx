import { useMutation } from "@tanstack/react-query";
import { MailCheck, RotateCw } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, errorMessage, post } from "../lib/api";
import { useI18n } from "../lib/i18n";
import type { User } from "../lib/types";
import { Alert, Button } from "./ui";

/** What the server returns when it emails a code (sign-in, sign-up or email verification). */
export type CodeChallenge = { challenge: string; email: string; resendInSec: number; devCode?: string };

/** Second step of sign-in/sign-up: enter the 6-digit code that was emailed. */
export function CodeForm({ start, onVerified, onBack, compact }: {
  start: CodeChallenge;
  onVerified: (user: User) => void;
  onBack?: () => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState(start.devCode);
  const [wait, setWait] = useState(start.resendInSec);
  const [sentAgain, setSentAgain] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const verify = useMutation({
    mutationFn: (value: string) => post<{ user: User }>("/auth/verify-code", { challenge: start.challenge, code: value }),
    onSuccess: (d) => onVerified(d.user),
    onError: () => {
      setCode("");
      input.current?.focus();
    },
  });
  const resend = useMutation({
    mutationFn: () => post<{ resendInSec: number; devCode?: string }>("/auth/resend-code", { challenge: start.challenge }),
    onSuccess: (d) => {
      setWait(d.resendInSec);
      setDevCode(d.devCode);
      setSentAgain(true);
      verify.reset();
      input.current?.focus();
    },
  });

  const change = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && !verify.isPending) verify.mutate(digits);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.length === 6) verify.mutate(code);
  };

  const error = verify.error ?? resend.error;
  const left = error instanceof ApiError ? (error.details as { attemptsLeft?: number } | undefined)?.attemptsLeft : undefined;
  const message = !error ? null
    : left !== undefined ? t("Incorrect code. Attempts left: {n}.", { n: left })
    : error instanceof ApiError && error.code === "LIMIT_REACHED" && error.message.startsWith("Too many incorrect")
      ? t("Too many incorrect attempts. Request a new code.")
    : t(errorMessage(error));

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className={compact ? "text-sm" : "flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-900"}>
        {!compact && <MailCheck className="mt-0.5 h-5 w-5 flex-none text-brand-600 dark:text-brand-400" />}
        <p>
          {t("We sent a 6-digit code to")} <b className="break-all">{start.email}</b>. {t("It is valid for 10 minutes.")}
          {" "}{t("If it is not in your inbox, check the Spam folder.")}
        </p>
      </div>
      {devCode && (
        <Alert tone="info">{t("Development mode (no email server): your code is")} <b className="font-mono tracking-widest">{devCode}</b></Alert>
      )}
      {sentAgain && !error && <Alert tone="success">{t("A new code has been sent.")}</Alert>}
      {message && <Alert tone="error">{message}</Alert>}
      <input
        ref={input}
        autoFocus
        value={code}
        onChange={(e) => change(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        placeholder="••••••"
        aria-label={t("6-digit code")}
        className="input text-center font-mono text-2xl tracking-[0.5em] placeholder:tracking-[0.5em]"
      />
      <Button type="submit" className="w-full" size={compact ? "md" : "lg"} loading={verify.isPending} disabled={code.length !== 6}>{t("Confirm")}</Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" disabled={wait > 0 || resend.isPending} onClick={() => resend.mutate()}
          className="inline-flex items-center gap-1.5 font-medium text-brand-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline dark:text-brand-400">
          <RotateCw className="h-3.5 w-3.5" />
          {wait > 0 ? t("Resend code in {n} s", { n: wait }) : t("Resend code")}
        </button>
        {onBack && <button type="button" onClick={onBack} className="font-medium muted hover:underline">{t("Use a different email")}</button>}
      </div>
    </form>
  );
}
