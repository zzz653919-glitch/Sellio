import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { get } from "./api";
import type { Meta } from "./types";

export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: () => get<Meta>("/meta"), staleTime: 5 * 60_000 });
}

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
