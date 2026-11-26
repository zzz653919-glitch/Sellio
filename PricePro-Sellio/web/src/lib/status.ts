import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { get } from "./api";

export type PlatformStatus = { maintenance: boolean; message: string; registrationOpen: boolean };

/** Public platform status (maintenance mode, registration). Re-checked when an API call reports maintenance. */
export function usePlatformStatus() {
  const qc = useQueryClient();
  useEffect(() => {
    const on = () => void qc.invalidateQueries({ queryKey: ["platform-status"] });
    window.addEventListener("vendora:maintenance", on);
    return () => window.removeEventListener("vendora:maintenance", on);
  }, [qc]);
  return useQuery({ queryKey: ["platform-status"], queryFn: () => get<PlatformStatus>("/status"), staleTime: 30_000, refetchInterval: 60_000, retry: 1 });
}
