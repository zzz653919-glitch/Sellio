import { useTheme } from "../lib/theme";

export const SERIES_COLORS = ["#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];

/** Grid, axis and tooltip colours that follow the light / dark theme. */
export function useChartTheme() {
  const { resolved } = useTheme();
  const dark = resolved === "dark";
  const grid = dark ? "#1e293b" : "#e2e8f0";
  return {
    grid,
    axis: dark ? "#94a3b8" : "#64748b",
    tooltip: { contentStyle: { background: dark ? "#0f172a" : "#fff", border: `1px solid ${grid}`, borderRadius: 12 } },
  };
}

/** "Source: …" line under data blocks: every number on these pages names where it came from. */
export function SourceNote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs muted">{children}</p>;
}
