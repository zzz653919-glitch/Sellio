import { useQueryClient } from "@tanstack/react-query";
import { Languages } from "lucide-react";
import { patch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n, type Lang } from "../lib/i18n";
import type { Settings } from "../lib/types";
import { cx } from "./ui";

const LANGS: { code: Lang; short: string; name: string }[] = [
  { code: "uz", short: "UZ", name: "O‘zbekcha" },
  { code: "ru", short: "RU", name: "Русский" },
  { code: "en", short: "EN", name: "English" },
];

/** Always-visible language switch. When signed in, the choice is also saved to the account. */
export function LanguageSwitch({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const choose = (code: Lang) => {
    if (code === lang) return;
    setLang(code);
    if (user) {
      // Update the cached settings first so a refetch does not switch the language back.
      qc.setQueryData<Settings>(["settings"], (s) => (s ? { ...s, language: code } : s));
      patch("/user/settings", { language: code }).catch(() => {});
    }
  };
  return (
    <div className={cx("flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-0.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900", className)}
      role="group" aria-label="Language / Til">
      <Languages className="mx-1 hidden h-4 w-4 text-slate-400 sm:block" aria-hidden />
      {LANGS.map((l) => (
        <button key={l.code} type="button" onClick={() => choose(l.code)} aria-pressed={lang === l.code} title={l.name}
          className={cx("rounded-lg px-2.5 py-1.5 transition", lang === l.code ? "bg-brand-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white")}>
          <span className="sm:hidden">{l.short}</span>
          <span className="hidden sm:inline">{l.name}</span>
        </button>
      ))}
    </div>
  );
}
