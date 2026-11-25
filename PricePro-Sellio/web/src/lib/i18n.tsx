import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { RU } from "./i18n-ru";
import { UZ } from "./i18n-uz";

const DICTS: Record<Lang, Record<string, string> | null> = { en: null, uz: UZ, ru: RU };

export type Lang = "en" | "uz" | "ru";
type Vars = Record<string, string | number>;

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (key: string, vars?: Vars) => string; tr: (text: string) => string } | null>(null);

/**
 * Texts the server stores in English (activity titles, notifications) with a variable part.
 * Each pattern maps to a dictionary template; captured parts are translated recursively.
 */
const SERVER_PATTERNS: [RegExp, string, string[]][] = [
  [/^Saved to My Projects: (.+)$/s, "Saved to My Projects: {x}", ["x"]],
  [/^Removed from My Projects: (.+)$/s, "Removed from My Projects: {x}", ["x"]],
  [/^Added to Favorites: (.+)$/s, "Added to Favorites: {x}", ["x"]],
  [/^World demand: (.+)$/s, "World demand: {x}", ["x"]],
  [/^Advertisement created: (.+)$/s, "Advertisement created: {x}", ["x"]],
  [/^Advertisement failed: (.+)$/s, "Advertisement failed: {x}", ["x"]],
  [/^Product image uploaded: (.+)$/s, "Product image uploaded: {x}", ["x"]],
  [/^Plan changed to (.+)$/s, "Plan changed to {x}", ["x"]],
  [/^You are now on the (.+) plan$/s, "You are now on the {x} plan", ["x"]],
  [/^Generation for "(.+)" failed: (.+)$/s, "Generation for \"{x}\" failed: {y}", ["x", "y"]],
  [/^Your advertisement for "(.+)" has been generated\.$/s, "Your advertisement for \"{x}\" has been generated.", ["x"]],
  [/^Search-interest analysis for "(.+)" is ready\.$/s, "Search-interest analysis for \"{x}\" is ready.", ["x"]],
  [/^Demand — (.+)$/s, "Demand — {x}", ["x"]],
  [/^Ad — (.+)$/s, "Ad — {x}", ["x"]],
];

function read(): Lang {
  try {
    const saved = localStorage.getItem("pp_lang");
    if (saved === "uz" || saved === "ru" || saved === "en") return saved;
    // First visit: follow the browser language when it is Russian or Uzbek.
    const nav = navigator.language.toLowerCase();
    return nav.startsWith("ru") ? "ru" : nav.startsWith("uz") ? "uz" : "en";
  } catch {
    return "en";
  }
}

/** Keys are the English text; translations fall back to English when missing. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const l = read();
    document.documentElement.lang = l;
    return l;
  });
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("pp_lang", l);
    } catch {
      /* storage unavailable */
    }
    document.documentElement.lang = l;
  }, []);
  const t = useCallback(
    (key: string, vars?: Vars) => {
      let s = DICTS[lang]?.[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    [lang],
  );
  const tr = useCallback(
    (text: string): string => {
      if (lang === "en") return text;
      const dict = DICTS[lang]!;
      if (dict[text]) return dict[text];
      for (const [re, key, names] of SERVER_PATTERNS) {
        const m = re.exec(text);
        if (m) return t(key, Object.fromEntries(names.map((n, i) => [n, tr(m[i + 1])])));
      }
      return text;
    },
    [lang, t],
  );
  const value = useMemo(() => ({ lang, setLang, t, tr }), [lang, setLang, t, tr]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) throw new Error("I18nProvider missing");
  return c;
}
