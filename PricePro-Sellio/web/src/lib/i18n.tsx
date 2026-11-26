import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
/** Only the dictionary of the chosen language is downloaded (each is ~100 KB). English needs none. */
const DICTS: Record<Lang, Record<string, string> | null> = { en: null, uz: null, ru: null };

export async function loadDict(l: Lang) {
  if (l === "en" || DICTS[l]) return;
  DICTS[l] = l === "uz" ? (await import("./i18n-uz")).UZ : (await import("./i18n-ru")).RU;
}

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
  [/^Product cards created: (.+)$/s, "Product cards created: {x}", ["x"]],
  [/^This image is used by (\d+) product card\(s\)\. Delete those cards first\.$/s, "This image is used by {n} product card(s). Delete those cards first.", ["n"]],
  [/^Advertisement failed: (.+)$/s, "Advertisement failed: {x}", ["x"]],
  [/^Product image uploaded: (.+)$/s, "Product image uploaded: {x}", ["x"]],
  [/^Plan changed to (.+)$/s, "Plan changed to {x}", ["x"]],
  [/^You are now on the (.+) plan$/s, "You are now on the {x} plan", ["x"]],
  [/^Generation for "(.+)" failed: (.+)$/s, "Generation for \"{x}\" failed: {y}", ["x", "y"]],
  [/^Your advertisement for "(.+)" has been generated\.$/s, "Your advertisement for \"{x}\" has been generated.", ["x"]],
  [/^Search-interest analysis for "(.+)" is ready\.$/s, "Search-interest analysis for \"{x}\" is ready.", ["x"]],
  [/^Demand — (.+)$/s, "Demand — {x}", ["x"]],
  [/^Ad — (.+)$/s, "Ad — {x}", ["x"]],
  [/^Business data: (.+)$/s, "Business data: {x}", ["x"]],
  [/^Your (.+) plan is active$/s, "Your {x} plan is active", ["x"]],
  [/^Your payment was confirmed\. (.+) limits are active until (.+)\.$/s, "Your payment was confirmed. {x} limits are active until {y}.", ["x", "y"]],
  [/^Your payment for (.+) was not confirmed\. Reason: (.+)\. You can upload a new receipt and send it again\.$/s, "Your payment for {x} was not confirmed. Reason: {y}. You can upload a new receipt and send it again.", ["x", "y"]],
  [/^Payment started: (.+)$/s, "Payment started: {x}", ["x"]],
  [/^Payment receipt sent for review: (.+)$/s, "Payment receipt sent for review: {x}", ["x"]],
  [/^You have used all (\d+) AI advertisement images of the (.+) plan for the last (\d+) hours\. The next one is available at (.+)\.$/s, "You have used all {n} AI advertisement images of the {x} plan for the last {h} hours. The next one is available at {y}.", ["n", "x", "h", "y"]],
  [/^You have used all (\d+) demand forecasts of the (.+) plan for the last (\d+) hours\. The next one is available at (.+)\.$/s, "You have used all {n} demand forecasts of the {x} plan for the last {h} hours. The next one is available at {y}.", ["n", "x", "h", "y"]],
  [/^You have used all (\d+) AI advertisement images of the (.+) plan today\. They renew on (.+)\.$/s, "You have used all {n} AI advertisement images of the {x} plan today. They renew on {y}.", ["n", "x", "y"]],
  [/^You have used all (\d+) demand forecasts of the (.+) plan today\. They renew on (.+)\.$/s, "You have used all {n} demand forecasts of the {x} plan today. They renew on {y}.", ["n", "x", "y"]],
  [/^You have used all (\d+) AI advertisement images of the (.+) plan this month\. They renew on (.+)\.$/s, "You have used all {n} AI advertisement images of the {x} plan this month. They renew on {y}.", ["n", "x", "y"]],
  [/^You have used all (\d+) demand forecasts of the (.+) plan this month\. They renew on (.+)\.$/s, "You have used all {n} demand forecasts of the {x} plan this month. They renew on {y}.", ["n", "x", "y"]],
];

export function read(): Lang {
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
    try {
      localStorage.setItem("pp_lang", l);
    } catch {
      /* storage unavailable */
    }
    // Switch once the dictionary is there, so the page never shows a mix of languages.
    void loadDict(l).catch(() => {}).then(() => {
      setLangState(l);
      document.documentElement.lang = l;
    });
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
      const dict = DICTS[lang];
      if (lang === "en" || !dict) return text;
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
