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
    <div className={cx("seg items-center gap-0.5 p-[3px] text-xs", className)}
      role="group" aria-label="Language / Til">
      <Languages className="mx-1.5 hidden h-4 w-4 text-[var(--v-faint)] xl:block" aria-hidden />
      {LANGS.map((l) => (
        <button key={l.code} type="button" onClick={() => choose(l.code)} aria-pressed={lang === l.code} title={l.name}
          className={cx("seg-btn h-[30px] px-2.5 text-xs", lang === l.code && "is-on")}>
          <span className="xl:hidden">{l.short}</span>
          <span className="hidden xl:inline">{l.name}</span>
        </button>
      ))}
    </div>
  );
}
