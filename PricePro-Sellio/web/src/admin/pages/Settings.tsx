import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import qrcode from "qrcode-generator";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { ErrorAlert } from "../../components/shared";
import { Alert, Badge, Button, Field, Input, PageLoader, Select, Toggle, useToast } from "../../components/ui";
import { get, post, put } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { ConfirmWithPassword, Section, useAdminMe, useCan } from "../ui";

function Qr({ text }: { text: string }) {
  const svg = useMemo(() => { const q = qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }, [text]);
  return <div className="h-48 w-48 rounded-xl bg-white p-1" aria-label="QR" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Two-factor authentication for the signed-in administrator. */
function TwoFactor() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const me = useAdminMe();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [disabling, setDisabling] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const start = useMutation({ mutationFn: () => post<{ secret: string; otpauthUrl: string }>("/admin/2fa/setup"), onSuccess: setSetup });
  const enable = useMutation({
    mutationFn: () => post("/admin/2fa/enable", { code }),
    onSuccess: () => { setSetup(null); setCode(""); toast("success", t("Two-factor authentication is on.")); void qc.invalidateQueries(); },
  });
  const disable = useMutation({
    mutationFn: (password: string) => post("/admin/2fa/disable", { code: disableCode, password }),
    onSuccess: () => { setDisabling(false); setDisableCode(""); toast("success", t("Two-factor authentication is off.")); void qc.invalidateQueries({ queryKey: ["admin-me"] }); },
  });
  const m = me.data;
  if (!m) return null;
  return (
    <Section title={t("Two-factor authentication")} actions={m.mfa.enabled ? <Badge tone="green">{t("On")}</Badge> : <Badge tone="amber">{t("Off")}</Badge>}>
      <p className="text-sm muted">{t("Protect your admin account with a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password and others).")}</p>
      {m.mfa.enabled ? (
        <>
          {m.mfa.requiredBySettings && <p className="text-xs muted">{t("It is required for all administrators, so it cannot be turned off.")}</p>}
          {!m.mfa.requiredBySettings && <Button variant="secondary" onClick={() => setDisabling(true)}>{t("Turn off")}</Button>}
        </>
      ) : !setup ? (
        <>
          <Button icon={<ShieldCheck className="h-4 w-4" />} loading={start.isPending} onClick={() => start.mutate()}>{t("Set up")}</Button>
          {start.error && <ErrorAlert error={start.error} />}
        </>
      ) : (
        <div className="space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>{t("Scan this QR code with your authenticator app, or enter the key by hand.")}</li>
            <li>{t("Enter the 6-digit code the app shows.")}</li>
          </ol>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Qr text={setup.otpauthUrl} />
            <div className="min-w-0 space-y-1"><p className="text-xs muted">{t("Key")}</p><code className="block break-all rounded-lg bg-slate-100 p-2 text-sm dark:bg-slate-800">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code><p className="text-xs muted">{t("Do not share this key. It is shown only now.")}</p></div>
          </div>
          <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); enable.mutate(); }}>
            <Field label={t("Code")}><Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" /></Field>
            <Button type="submit" loading={enable.isPending} disabled={code.length !== 6}>{t("Turn on")}</Button>
          </form>
          {enable.error && <ErrorAlert error={enable.error} />}
        </div>
      )}
      <ConfirmWithPassword open={disabling} title={t("Turn off two-factor authentication")} confirmLabel={t("Turn off")} danger error={disable.error} loading={disable.isPending}
        onConfirm={(p) => disable.mutate(p)} onClose={() => { setDisabling(false); disable.reset(); }}>
        <Field label={t("Code from the app")}><Input value={disableCode} onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" required /></Field>
      </ConfirmWithPassword>
    </Section>
  );
}

type S = { registrationOpen: boolean; maintenance: { enabled: boolean; message: string }; requireAdmin2fa: boolean; accountEmails: boolean; ai: { imageModel: string | null; textProvider: "gemini" | "openai" | null; openaiTextModel: string | null; geminiModel: string | null } };
type Sys = { platform: string; database: { ok: boolean; driver: string; error: string | null }; storage: { ok: boolean; driver: string }; email: { ok: boolean; settings: unknown }; integrations: { name: string; configured: boolean; envVar: string; lastSuccess: string | null; lastFailure: string | null }[] };

function PlatformSettings() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-settings"], queryFn: () => get<{ settings: S }>("/admin/settings") });
  const [draft, setDraft] = useState<S | null>(null);
  const [confirm, setConfirm] = useState(false);
  const save = useMutation({
    mutationFn: (password: string) => put<{ settings: S }>("/admin/settings", { ...draft!, password }),
    onSuccess: (r) => { setConfirm(false); setDraft(null); qc.setQueryData(["admin-settings"], r); void qc.invalidateQueries({ queryKey: ["admin-system"] }); toast("success", t("Settings saved")); },
  });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorAlert error={q.error} />;
  const s = draft ?? q.data!.settings;
  const edit = (patch: Partial<S>) => setDraft({ ...s, ...patch });
  const ai = (patch: Partial<S["ai"]>) => edit({ ai: { ...s.ai, ...patch } });
  return (
    <Section title={t("Platform settings")}>
      <div className="space-y-4">
        <Toggle checked={s.registrationOpen} onChange={(v) => edit({ registrationOpen: v })} label={t("New registrations are open")} description={t("When off, nobody can create a new account. Existing users can still sign in.")} />
        <Toggle checked={s.maintenance.enabled} onChange={(v) => edit({ maintenance: { ...s.maintenance, enabled: v } })} label={t("Maintenance mode")} description={t("Users see a maintenance page. Administrators can still use the site and this panel.")} />
        {s.maintenance.enabled && <Field label={t("Message for users")}><Input value={s.maintenance.message} maxLength={300} onChange={(e) => edit({ maintenance: { ...s.maintenance, message: e.target.value } })} placeholder={t("We are improving Vendora. Please come back in a few minutes.")} /></Field>}
        <Toggle checked={s.requireAdmin2fa} onChange={(v) => edit({ requireAdmin2fa: v })} label={t("Require two-factor authentication for all administrators")} />
        <Toggle checked={s.accountEmails} onChange={(v) => edit({ accountEmails: v })} label={t("Send notification emails to users")} description={t("Verification and password emails are always sent.")} />
        <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <p className="text-sm font-semibold">{t("AI models")}</p>
          <p className="text-xs muted">{t("Leave empty to use the server default. API keys are only kept in Vercel environment variables and are never shown here.")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("Text AI provider")}><Select value={s.ai.textProvider ?? ""} onChange={(e) => ai({ textProvider: (e.target.value || null) as S["ai"]["textProvider"] })} options={[{ value: "", label: t("Automatic") }, { value: "gemini", label: "Gemini" }, { value: "openai", label: "OpenAI" }]} /></Field>
            <Field label={t("Gemini model")}><Input value={s.ai.geminiModel ?? ""} onChange={(e) => ai({ geminiModel: e.target.value || null })} placeholder="gemini-flash-latest" /></Field>
            <Field label={t("OpenAI text model")}><Input value={s.ai.openaiTextModel ?? ""} onChange={(e) => ai({ openaiTextModel: e.target.value || null })} placeholder="gpt-5.4-mini" /></Field>
            <Field label={t("Image model")}><Input value={s.ai.imageModel ?? ""} onChange={(e) => ai({ imageModel: e.target.value || null })} placeholder="gpt-image-2" /></Field>
          </div>
        </div>
        {save.error && !confirm && <ErrorAlert error={save.error} />}
        <div className="flex gap-2">
          <Button disabled={!draft} onClick={() => setConfirm(true)}>{t("Save settings")}</Button>
          {draft && <Button variant="ghost" onClick={() => { setDraft(null); save.reset(); }}>{t("Cancel")}</Button>}
        </div>
      </div>
      <ConfirmWithPassword open={confirm} title={t("Save settings")} confirmLabel={t("Save")} danger={s.maintenance.enabled || !s.registrationOpen} error={save.error} loading={save.isPending}
        text={s.maintenance.enabled ? t("Maintenance mode will be on: users will not be able to use Vendora until you turn it off.") : t("The changes apply to every user within a few seconds.")}
        onConfirm={(p) => save.mutate(p)} onClose={() => setConfirm(false)} />
    </Section>
  );
}

function SystemStatus() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ["admin-system"], queryFn: () => get<Sys>("/admin/system") });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorAlert error={q.error} />;
  const d = q.data!;
  const ok = (v: boolean) => (v ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-rose-500" />);
  return (
    <Section title={t("System status")}>
      <ul className="space-y-2 text-sm">
        <li className="flex items-center gap-2">{ok(d.database.ok)}{t("Database")}: <b>{d.database.driver}</b>{d.database.error && <span className="text-rose-600">{d.database.error}</span>}</li>
        <li className="flex items-center gap-2">{ok(d.storage.ok)}{t("File storage")}: <b>{d.storage.driver}</b></li>
        <li className="flex items-center gap-2">{ok(d.email.ok)}{t("Email sending")}</li>
      </ul>
      <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
        {d.integrations.map((i) => (
          <li key={i.name} className="flex flex-wrap items-center gap-2 py-2">
            {ok(i.configured)}<span className="flex-1">{i.name}</span>
            {!i.configured && <code className="text-xs muted">{i.envVar}</code>}
            {i.lastFailure && (!i.lastSuccess || i.lastFailure > i.lastSuccess) && <Badge tone="red">{t("last error {x}", { x: timeAgo(i.lastFailure) })}</Badge>}
            {i.lastSuccess && <span className="text-xs muted">{t("worked {x}", { x: timeAgo(i.lastSuccess) })}</span>}
          </li>
        ))}
      </ul>
      <p className="text-xs muted">{t("Keys are added in Vercel → Settings → Environment Variables, then Redeploy. Only names of missing keys are shown.")}</p>
    </Section>
  );
}

export default function SettingsPage({ onlyTwoFactor }: { onlyTwoFactor?: boolean }) {
  const { t } = useI18n();
  const can = useCan();
  if (onlyTwoFactor) return <TwoFactor />;
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">{t("Settings")}</h1><p className="text-sm muted">{t("Your admin security and platform settings. Every change is recorded in the audit log.")}</p></div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="space-y-5"><TwoFactor />{can("settings.manage") ? <PlatformSettings /> : <Alert tone="info">{t("Only a Super Admin can change platform settings.")}</Alert>}</div>
        {can("dashboard.view") && <SystemStatus />}
      </div>
    </div>
  );
}
