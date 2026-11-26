import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from "lucide-react";
import {
  createContext, useCallback, useContext, useEffect, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes,
} from "react";
import { useI18n } from "../lib/i18n";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANT: Record<Variant, string> = {
  primary: "bg-[var(--v-btn)] text-[var(--v-btn-text)] hover:bg-[var(--v-btn-hover)] shadow-[inset_0_1px_0_rgba(255,255,255,.45)]",
  secondary: "border border-[var(--v-line)] bg-[var(--v-glass-2)] text-[var(--v-text)] shadow-[inset_0_1px_0_var(--v-hi)] hover:bg-[var(--v-glass-3)]",
  ghost: "text-[var(--v-muted)] hover:bg-[var(--v-glass-2)] hover:text-[var(--v-text)]",
  danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-[inset_0_1px_0_rgba(255,255,255,.3)]",
};

export function Button({
  variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition active:translate-y-px focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--v-sky-soft)] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 rounded-[10px] px-3 text-[12.5px]" : size === "lg" ? "h-12 rounded-[14px] px-[22px] text-[14.5px]" : "h-10 rounded-xl px-4 text-[13.5px]",
        VARIANT[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("card", className)}>{children}</div>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : hint ? <span className="mt-1 block text-xs muted">{hint}</span> : null}
    </label>
  );
}

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx("input", p.className)} />;

export function Select({ options, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select {...rest} className={cx("input pr-8", className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

type Tone = "slate" | "brand" | "green" | "amber" | "red" | "cyan" | "violet";
const TONE: Record<Tone, string> = {
  slate: "bg-[var(--v-glass-3)] text-[var(--v-muted)]",
  brand: "bg-[var(--v-sky-soft)] text-[var(--v-sky)]",
  green: "bg-[var(--v-ok-soft)] text-[var(--v-ok)]",
  amber: "bg-[var(--v-warn-soft)] text-[var(--v-warn)]",
  red: "bg-[var(--v-bad-soft)] text-[var(--v-bad)]",
  cyan: "bg-[var(--v-sky-soft)] text-[var(--v-sky)]",
  violet: "bg-[var(--v-lilac-soft)] text-[var(--v-lilac)]",
};
export function Badge({ tone = "slate", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-[9px] text-xs font-semibold", TONE[tone], className)}>{children}</span>;
}

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cx("h-5 w-5 animate-spin text-[var(--v-sky)]", className)} />;

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[18px] border border-dashed border-[var(--v-line)] px-6 py-11 text-center">
      <div className="tile mb-3 h-[52px] w-[52px] rounded-2xl">{icon}</div>
      <p className="text-base font-bold">{title}</p>
      {text && <p className="mt-1 max-w-md text-sm muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, icon, actions }: { title: string; subtitle?: string; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 px-1.5 pt-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-center gap-3.5">
        {icon && <div className="tile hidden h-12 w-12 rounded-2xl sm:grid [&>svg]:h-6 [&>svg]:w-6">{icon}</div>}
        <div className="min-w-0">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[30px]">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[14.5px] muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Alert({ tone = "info", title, children, action }: { tone?: "info" | "warning" | "error" | "success"; title?: string; children?: ReactNode; action?: ReactNode }) {
  const cls = {
    info: "border-[var(--v-line)] bg-[var(--v-sky-soft)] [&>svg]:text-[var(--v-sky)]",
    warning: "border-[var(--v-line)] bg-[var(--v-warn-soft)] [&>svg]:text-[var(--v-warn)]",
    error: "border-[var(--v-line)] bg-[var(--v-bad-soft)] [&>svg]:text-[var(--v-bad)]",
    success: "border-[var(--v-line)] bg-[var(--v-ok-soft)] [&>svg]:text-[var(--v-ok)]",
  }[tone];
  const Icon = { info: Info, warning: AlertTriangle, error: XCircle, success: CheckCircle2 }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex gap-3 rounded-[14px] border p-3.5 text-sm text-[var(--v-text)]", cls)}>
      <Icon className="mt-0.5 h-4 w-4 flex-none" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030612]/55 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cx("max-h-[90vh] w-full overflow-y-auto rounded-[22px] border border-[var(--v-line)] bg-[var(--v-pop)] p-6 shadow-[inset_0_1px_0_var(--v-hi),var(--v-drop)] backdrop-blur-2xl", wide ? "max-w-4xl" : "max-w-md")}
            initial={{ y: 16, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 16, scale: 0.98 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold">{title}</h2>
              <button onClick={onClose} className="rounded-lg p-1 text-[var(--v-muted)] hover:bg-[var(--v-glass-2)]" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({ open, title, text, confirmLabel, onConfirm, onClose, loading }: {
  open: boolean; title: string; text: string; confirmLabel: string; onConfirm: () => void; onClose: () => void; loading?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm muted">{text}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t("Cancel")}</Button>
        <Button variant="danger" loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <label className={cx("flex items-start justify-between gap-4 py-3", disabled && "opacity-50")}>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative h-6 w-[42px] flex-none rounded-full border transition", checked ? "border-transparent bg-[var(--v-switch-on)]" : "border-[var(--v-line)] bg-[var(--v-switch-off)]")}
      >
        <span className={cx("absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition", checked ? "left-[20px]" : "left-[2px]")} />
      </button>
    </label>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="seg" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={cx("seg-btn", value === tab.value && "is-on")}
        >
          {tab.label}
          {tab.count !== undefined && <small className="text-[11px] font-bold text-[var(--v-faint)]">{tab.count}</small>}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--v-track)]">
      <div className={cx("h-full rounded-full transition-all", pct >= 100 ? "bg-rose-400" : pct >= 80 ? "bg-amber-400" : "bg-[var(--v-sky)]")} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ------------------------------------------------------------------ toasts
type Toast = { id: number; tone: "success" | "error" | "info"; text: string };
const ToastCtx = createContext<(tone: Toast["tone"], text: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
              className={cx("pointer-events-auto flex items-start gap-2 rounded-xl border p-3 text-sm shadow-lg",
                t.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-950 dark:text-rose-100"
                : t.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950 dark:text-emerald-100"
                : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900")}>
              {t.tone === "error" ? <XCircle className="mt-0.5 h-4 w-4 flex-none" /> : t.tone === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" /> : <Info className="mt-0.5 h-4 w-4 flex-none" />}
              <span>{t.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
