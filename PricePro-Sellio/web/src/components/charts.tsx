import { useTheme } from "../lib/theme";

export const SERIES_COLORS = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#22d3ee"];

/** Grid, axis and tooltip colours that follow the light / dark theme. */
export function useChartTheme() {
  const { resolved } = useTheme();
  const dark = resolved === "dark";
  const grid = dark ? "rgba(255,255,255,.07)" : "rgba(15,23,42,.07)";
  return {
    grid,
    axis: dark ? "#99a3be" : "#566079",
    tooltip: {
      contentStyle: { background: dark ? "rgba(19,26,50,.92)" : "rgba(255,255,255,.92)", border: `1px solid ${dark ? "rgba(255,255,255,.14)" : "rgba(15,23,42,.1)"}`, borderRadius: 12, backdropFilter: "blur(16px)", color: dark ? "#f4f6fb" : "#0d1426" },
      labelStyle: { color: dark ? "#b5bdd3" : "#465068" },
    },
  };
}

/** "Source: …" line under data blocks: every number on these pages names where it came from. */
export function SourceNote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs muted">{children}</p>;
}
