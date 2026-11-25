import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";
const Ctx = createContext<{ theme: Theme; resolved: "light" | "dark"; setTheme: (t: Theme) => void } | null>(null);

function read(): Theme {
  try {
    const v = localStorage.getItem("pp_theme");
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const systemDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(read);
  const [resolved, setResolved] = useState<"light" | "dark">(() => (theme === "system" ? (systemDark() ? "dark" : "light") : theme));

  useEffect(() => {
    const apply = () => {
      const r = theme === "system" ? (systemDark() ? "dark" : "light") : theme;
      setResolved(r);
      document.documentElement.classList.toggle("dark", r === "dark");
    };
    apply();
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener("change", apply);
    return () => mq?.removeEventListener("change", apply);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem("pp_theme", t);
    } catch {
      /* storage unavailable */
    }
  }, []);

  return <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error("ThemeProvider missing");
  return c;
}
