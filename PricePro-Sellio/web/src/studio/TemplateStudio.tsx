import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useToast } from "../components/ui";
import { del, get, put } from "../lib/api";
import { useI18n } from "../lib/i18n";
import Editor from "./Editor";
import { Gallery } from "./Gallery";

/** Ad Studio "Templates" tab: 100 editable templates (gallery → editor). Loaded on demand. */
export default function TemplateStudio() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const open = params.get("tpl");
  const photo = params.get("photo") ?? undefined;
  const favs = useQuery({ queryKey: ["template-favorites"], queryFn: () => get<{ ids: string[] }>("/ads/template-favorites").then((r) => r.ids), staleTime: 300_000 });
  const favorites = new Set(favs.data ?? []);
  const toggle = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => (on ? put(`/ads/template-favorites/${id}`, {}) : del(`/ads/template-favorites/${id}`)),
    onMutate: ({ id, on }) => {
      qc.setQueryData<string[]>(["template-favorites"], (old = []) => (on ? [id, ...old.filter((x) => x !== id)] : old.filter((x) => x !== id)));
    },
    onError: () => { toast("error", t("Could not update favorites. Try again.")); void qc.invalidateQueries({ queryKey: ["template-favorites"] }); },
  });
  const onToggle = (id: string) => toggle.mutate({ id, on: !favorites.has(id) });
  const go = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("tpl", id); else { next.delete("tpl"); next.delete("photo"); }
    setParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  if (open) return <Editor key={`${open}:${photo ?? ""}`} templateId={open} photo={photo} onBack={() => go(null)} favorite={favorites.has(open)} onToggleFavorite={() => onToggle(open)} />;
  return <Gallery favorites={favorites} onToggleFavorite={onToggle} onOpen={go} />;
}
