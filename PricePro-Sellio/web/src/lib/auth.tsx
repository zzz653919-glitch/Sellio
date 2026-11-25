import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { ApiError, get, post } from "./api";
import { useI18n } from "./i18n";
import { useTheme } from "./theme";
import type { Settings, User } from "./types";

type AuthCtx = {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
  refresh: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { setTheme } = useTheme();
  const { setLang } = useI18n();

  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return (await get<{ user: User }>("/auth/me")).user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
    retry: 1,
  });

  const user = me.data ?? null;

  // Apply the user's saved appearance and language preferences after sign-in.
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await get<{ settings: Settings }>("/user/settings")).settings,
    enabled: Boolean(user),
  });
  useEffect(() => {
    if (settings.data) {
      setTheme(settings.data.theme);
      setLang(settings.data.language);
    }
  }, [settings.data, setTheme, setLang]);

  const setUser = useCallback((u: User | null) => qc.setQueryData(["me"], u), [qc]);
  const logout = useCallback(async () => {
    try {
      await post("/auth/logout");
    } finally {
      qc.clear();
      qc.setQueryData(["me"], null);
    }
  }, [qc]);
  const refresh = useCallback(() => void qc.invalidateQueries({ queryKey: ["me"] }), [qc]);

  return <Ctx.Provider value={{ user, loading: me.isLoading, setUser, logout, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("AuthProvider missing");
  return c;
}
