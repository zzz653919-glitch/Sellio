import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Eye, Search, XCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ErrorAlert } from "../../components/shared";
import { Alert, Button, Field, Input, Modal, PageLoader, Tabs, useToast } from "../../components/ui";
import { get, post } from "../../lib/api";
import { fmtDateTime, fmtNumber } from "../../lib/format";
import { useDebounced } from "../../lib/hooks";
import { useI18n } from "../../lib/i18n";
import { PaymentStatusBadge, type PaymentItem } from "../../pages/Payment";
import { ConfirmWithPassword, Pager, Section, Table, useList } from "../ui";

type AdminPayment = PaymentItem & { user: { id: string; email: string; name: string; plan: string }; reviewedBy: string | null };
const som = (n: number) => `${fmtNumber(n)} so'm`;
const mask = (n: string) => (n.length >= 8 ? `${n.slice(0, 4)} **** **** ${n.slice(-4)}` : n);

function Receipt({ p }: { p: AdminPayment }) {
  const { t } = useI18n();
  const url = `/api/admin/payment-requests/${p.id}/receipt`;
  if (!p.receipt) return <p className="text-sm muted">{t("No receipt uploaded.")}</p>;
  return (
    <div className="space-y-2">
      {p.receipt.mime === "application/pdf"
        ? <object data={url} type="application/pdf" className="h-[60vh] w-full rounded-xl border border-[var(--v-line)]"><a href={url} target="_blank" rel="noreferrer">{t("Open the PDF")}</a></object>
        : <img src={url} alt={t("Receipt")} className="max-h-[60vh] w-full rounded-xl border border-[var(--v-line)] bg-white object-contain" />}
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--v-sky)] hover:underline"><ExternalLink className="h-3.5 w-3.5" />{t("Open in a new tab")} · {p.receipt.name}</a>
    </div>
  );
}

function Review({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const q = useQuery({ queryKey: ["admin-payment", id], queryFn: () => get<{ payment: AdminPayment; otherPayments: AdminPayment[] }>(`/admin/payment-requests/${id}`) });
  const done = (msg: string) => { toast("success", msg); void qc.invalidateQueries({ queryKey: ["admin-payment-requests"] }); void qc.invalidateQueries({ queryKey: ["admin-payment", id] }); };
  const approve = useMutation({
    mutationFn: (password: string) => post(`/admin/payment-requests/${id}/approve`, { password }),
    onSuccess: () => { setApproving(false); done(t("Payment approved. The plan is active and the user was notified.")); },
  });
  const reject = useMutation({
    mutationFn: () => post(`/admin/payment-requests/${id}/reject`, { reason: reason.trim() || undefined }),
    onSuccess: () => { setRejecting(false); done(t("Payment rejected. The user was notified and can send a new receipt.")); },
  });
  const p = q.data?.payment;
  return (
    <Modal open onClose={onClose} title={t("Payment request")} wide>
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorAlert error={q.error} /> : p && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Receipt p={p} />
          <div className="space-y-4">
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs muted">{t("User")}</dt><dd><Link to={`/admin/users/${p.user.id}`} className="font-semibold hover:underline">{p.user.name}</Link><span className="block text-xs muted">{p.user.email}</span><span className="block break-all text-[11px] muted">ID: {p.user.id}</span></dd></div>
              <div><dt className="text-xs muted">{t("Plan")}</dt><dd className="font-semibold">{p.plan.toUpperCase()} · {t(p.interval === "year" ? "1 year" : "1 month")} <span className="text-xs font-normal muted">({t("now")}: {p.user.plan})</span></dd></div>
              <div><dt className="text-xs muted">{t("Amount")}</dt><dd className="text-lg font-extrabold">{som(p.amountUzs)} <span className="text-xs font-normal muted">${p.amountUsd}</span></dd></div>
              <div><dt className="text-xs muted">{t("Card")}</dt><dd>{p.card.bank} · {p.card.type} · {mask(p.card.number)}<span className="block text-xs muted">{p.card.holder}</span></dd></div>
              <div><dt className="text-xs muted">{t("Sent")}</dt><dd>{p.submittedAt && fmtDateTime(p.submittedAt)}</dd></div>
              <div><dt className="text-xs muted">{t("Status")}</dt><dd className="flex flex-wrap items-center gap-2"><PaymentStatusBadge p={p} />{p.reviewedBy && <span className="text-xs muted">{p.reviewedBy} · {p.reviewedAt && fmtDateTime(p.reviewedAt)}</span>}</dd></div>
              {p.rejectReason && <div><dt className="text-xs muted">{t("Reason")}</dt><dd>{p.rejectReason}</dd></div>}
            </dl>
            {p.status === "pending" ? (
              <div className="space-y-2">
                <Alert tone="info">{t("Check in your bank app that exactly this amount arrived on the card before approving.")}</Alert>
                <Button className="w-full" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setApproving(true)}>{t("Approve")}</Button>
                <Button className="w-full" variant="secondary" icon={<XCircle className="h-4 w-4" />} onClick={() => setRejecting(true)}>{t("Reject")}</Button>
              </div>
            ) : <Alert tone={p.status === "approved" ? "success" : "warning"}>{t(p.status === "approved" ? "This payment is approved." : "This payment is rejected.")}</Alert>}
            {!!q.data?.otherPayments.length && (
              <div>
                <p className="mb-1 text-xs font-semibold muted">{t("Earlier payments of this user")}</p>
                <ul className="space-y-1 text-xs">{q.data.otherPayments.map((o) => <li key={o.id} className="flex justify-between gap-2"><span>{o.plan.toUpperCase()} · {som(o.amountUzs)}</span><PaymentStatusBadge p={o} /></li>)}</ul>
              </div>
            )}
          </div>
        </div>
      )}
      {approving && p && (
        <ConfirmWithPassword open title={t("Approve payment")} confirmLabel={t("Approve")} error={approve.error} loading={approve.isPending}
          text={t("{plan} will be activated for {email} right away. This cannot be undone here.", { plan: p.plan.toUpperCase(), email: p.user.email })}
          onConfirm={(pw) => approve.mutate(pw)} onClose={() => { setApproving(false); approve.reset(); }} />
      )}
      {rejecting && (
        <Modal open onClose={() => setRejecting(false)} title={t("Reject payment")}>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); reject.mutate(); }}>
            <Field label={t("Reason (optional, the user sees it)")}><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={t("e.g. the amount is wrong / the receipt is unreadable")} /></Field>
            {reject.error && <ErrorAlert error={reject.error} />}
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setRejecting(false)}>{t("Cancel")}</Button><Button type="submit" variant="danger" loading={reject.isPending}>{t("Reject")}</Button></div>
          </form>
        </Modal>
      )}
    </Modal>
  );
}

export default function PaymentRequests() {
  const { t } = useI18n();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const list = useList<{ items: AdminPayment[]; total: number; page: number; limit: number; counts: Record<string, number> }>(["admin-payment-requests"], "/admin/payment-requests", { status, q: dq, page });
  const c = list.data?.counts ?? {};
  return (
    <div className="space-y-4">
      <div><h1 className="text-[26px] font-extrabold tracking-[-0.03em]">{t("Payment requests")}</h1><p className="text-sm muted">{t("Users pay by card and upload a receipt. A plan is activated only when you approve the payment here.")}</p></div>
      <div className="overflow-x-auto"><Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} tabs={[{ value: "pending", label: t("Waiting for review"), count: c.pending ?? 0 }, { value: "approved", label: t("Approved"), count: c.approved ?? 0 }, { value: "rejected", label: t("Rejected"), count: c.rejected ?? 0 }, { value: "all", label: t("All") }]} /></div>
      <Section title={t("Requests")}>
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t("User email, user ID or request ID")} className="pl-9" /></div>
        {list.error && <ErrorAlert error={list.error} />}
        <Table head={[t("User"), t("Plan"), t("Amount"), t("Card"), t("Sent"), t("Status"), ""]} empty={list.data?.items.length === 0}>
          {(list.data?.items ?? []).map((p) => (
            <tr key={p.id}>
              <td><p className="font-medium">{p.user.name}</p><span className="block text-xs muted">{p.user.email}</span></td>
              <td>{p.plan.toUpperCase()} <span className="text-xs muted">· {t(p.interval === "year" ? "1 year" : "1 month")}</span></td>
              <td className="whitespace-nowrap font-semibold">{som(p.amountUzs)}</td>
              <td className="whitespace-nowrap text-xs">{p.card.bank} ****{p.card.number.slice(-4)}</td>
              <td className="whitespace-nowrap text-xs">{p.submittedAt && fmtDateTime(p.submittedAt)}</td>
              <td><PaymentStatusBadge p={p} /></td>
              <td><Button size="sm" variant={p.status === "pending" ? "primary" : "secondary"} icon={<Eye className="h-4 w-4" />} onClick={() => setOpen(p.id)}>{t(p.status === "pending" ? "Review" : "View")}</Button></td>
            </tr>
          ))}
        </Table>
        {list.data && <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />}
      </Section>
      {open && <Review id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
