import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Send, Trash2, User as UserIcon } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { ErrorAlert, IntegrationNotice } from "../components/shared";
import { Button, Card, ConfirmDialog, PageHeader, Spinner, cx } from "../components/ui";
import { del, get, post } from "../lib/api";
import { timeAgo } from "../lib/format";
import { useI18n } from "../lib/i18n";

type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: string };
type History = { configured: boolean; provider: "gemini" | "openai" | null; items: Message[] };

/** **bold** inside a line, rendered as React nodes (never as HTML). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>));
}

/** A small, safe Markdown subset: headings, bullet and numbered lists, paragraphs. */
function Rich({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(<Tag key={blocks.length} className={cx("ml-5 space-y-1", list.ordered ? "list-decimal" : "list-disc")}>{list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}</Tag>);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || num) {
      const ordered = Boolean(num);
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((bullet ?? num)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    blocks.push(h ? <p key={blocks.length} className="font-semibold">{inline(h[1])}</p> : <p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <div className="space-y-2 text-sm leading-relaxed">{blocks}</div>;
}

const SUGGESTIONS = [
  "How is my business doing and what should I improve first?",
  "Which products are growing in demand in Uzbekistan right now?",
  "Which season should I prepare for next and how?",
  "How can I stand out from my competitors?",
  "Where am I losing money according to my data?",
];

export default function Advisor() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(() => params.get("q") ?? "");
  const [confirm, setConfirm] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const history = useQuery({ queryKey: ["advisor"], queryFn: () => get<History>("/advisor/messages") });
  const send = useMutation({
    mutationFn: (message: string) => post<{ question: Message; answer: Message }>("/advisor/messages", { message }),
    onSuccess: (d) => {
      qc.setQueryData<History>(["advisor"], (h) => h && { ...h, items: [...h.items, d.question, d.answer] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setText("");
    },
  });
  const clear = useMutation({ mutationFn: () => del("/advisor/messages"), onSuccess: () => { setConfirm(false); qc.invalidateQueries({ queryKey: ["advisor"] }); } });
  const items = history.data?.items ?? [];

  useEffect(() => {
    if (params.get("q")) setParams({}, { replace: true }); // keep the text, drop it from the address
  }, [params, setParams]);
  // scrollIntoView returns a promise in new browsers; an effect must not return it.
  useEffect(() => { void endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [items.length, send.isPending]);

  const submit = (m: string) => { if (m.trim() && !send.isPending) send.mutate(m.trim()); };
  const configured = history.data?.configured;

  return (
    <div className="space-y-6">
      <PageHeader title={t("AI Business Advisor")} subtitle={t("Ask about your sales, demand, seasons and competitors. Answers use your own data and measured market data.")} icon={<Bot className="h-5 w-5" />}
        actions={items.length > 0 ? <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirm(true)}>{t("Clear chat")}</Button> : undefined} />
      {history.data && !configured && <IntegrationNotice service="textAi" />}
      <Card className="flex min-h-[60vh] flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {history.isLoading ? <Spinner /> : items.length === 0 ? (
            <div className="space-y-4 py-6 text-center">
              <Bot className="mx-auto h-10 w-10 text-brand-500" />
              <p className="text-sm muted">{t("The advisor sees your uploaded sales data, your demand analyses, the Market Radar and your saved competitors. It never invents numbers: if data is missing, it tells you what to add.")}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" disabled={!configured} onClick={() => setText(t(s))}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">{t(s)}</button>
                ))}
              </div>
            </div>
          ) : items.map((m) => (
            <div key={m.id} className={cx("flex gap-3", m.role === "user" && "flex-row-reverse")}>
              <span className={cx("flex h-8 w-8 flex-none items-center justify-center rounded-full", m.role === "user" ? "bg-slate-200 dark:bg-slate-700" : "bg-gradient-to-br from-brand-500 to-cyan-500 text-white")}>
                {m.role === "user" ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </span>
              <div className={cx("max-w-[85%] rounded-2xl px-4 py-3", m.role === "user" ? "bg-brand-600 text-white" : "bg-slate-100 dark:bg-slate-800")}>
                {m.role === "user" ? <p className="whitespace-pre-line text-sm">{m.content}</p> : <Rich text={m.content} />}
                <p className={cx("mt-1 text-[11px]", m.role === "user" ? "text-white/70" : "muted")}>{timeAgo(m.createdAt)}</p>
              </div>
            </div>
          ))}
          {send.isPending && (
            <div className="flex items-center gap-3 text-sm muted"><Spinner />{t("The advisor is looking at your data…")}</div>
          )}
          <div ref={endRef} />
        </div>
        <div className="space-y-2 border-t border-slate-100 p-3 dark:border-slate-800">
          {send.error && <ErrorAlert error={send.error} />}
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
            <textarea className="input min-h-[44px] flex-1 resize-y" rows={2} maxLength={2000} value={text} disabled={!configured}
              placeholder={t("Write your question…")} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(text); } }} />
            <Button type="submit" loading={send.isPending} disabled={!configured || !text.trim()} icon={<Send className="h-4 w-4" />} aria-label={t("Send")} />
          </form>
          <p className="text-[11px] muted">{t("AI can make mistakes. Check important decisions against your own numbers.")}</p>
        </div>
      </Card>
      <ConfirmDialog open={confirm} title={t("Clear chat?")} text={t("All advisor messages will be deleted.")} confirmLabel={t("Delete")} loading={clear.isPending} onConfirm={() => clear.mutate()} onClose={() => setConfirm(false)} />
    </div>
  );
}
