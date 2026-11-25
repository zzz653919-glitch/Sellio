import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, LineChart, Lock, Mail, Sparkles, Tag, User as UserIcon } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Logo } from "../components/Layout";
import { CodeForm, type CodeChallenge } from "../components/CodeForm";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { Alert, Button, Field, Input } from "../components/ui";
import { errorMessage, post } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import type { User } from "../lib/types";

function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-cyan-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="relative flex items-center gap-2.5 text-xl font-extrabold"><img src="/favicon.svg" alt="" className="h-10 w-10" /> PricePro</div>
        <div className="relative space-y-6">
          <h2 className="text-4xl font-extrabold leading-tight">{t("Product intelligence for modern sellers")}</h2>
          {[
            { icon: Sparkles, title: "AI Product Studio", text: "Turn product photos into professional advertisements." },
            { icon: LineChart, title: "Demand Forecast", text: "See where demand for a product is growing — worldwide and by country." },
            { icon: Tag, title: "Smart Price Finder", text: "Compare live store prices and find the cheapest offer." },
          ].map(({ icon: Icon, title: ft, text }) => (
            <div key={ft} className="flex gap-3">
              <span className="h-fit rounded-xl bg-white/15 p-2"><Icon className="h-5 w-5" /></span>
              <div><p className="font-semibold">{t(ft)}</p><p className="text-sm opacity-85">{t(text)}</p></div>
            </div>
          ))}
        </div>
        <p className="relative text-sm opacity-75">© {new Date().getFullYear()} PricePro</p>
      </div>
      <div className="relative flex items-center justify-center p-6">
        <LanguageSwitch className="absolute right-4 top-4" />
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <Logo className="mb-8 lg:hidden" />
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </motion.div>
      </div>
    </div>
  );
}

const Icon = ({ children }: { children: ReactNode }) => <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{children}</span>;

export function LoginPage() {
  const { t } = useI18n();
  const { setUser } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<CodeChallenge | null>(null);
  const m = useMutation({
    mutationFn: () => post<CodeChallenge>("/auth/login", { email, password }),
    onSuccess: (d) => setStep(d),
  });
  const done = (u: User) => {
    setUser(u);
    nav((location.state as { from?: string } | null)?.from ?? "/", { replace: true });
  };
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  if (step) {
    return (
      <AuthShell title={t("Enter the code from your email")} subtitle={t("Two-step sign-in protects your account.")}>
        <CodeForm start={step} onVerified={done} onBack={() => { setStep(null); setPassword(""); m.reset(); }} />
      </AuthShell>
    );
  }
  return (
    <AuthShell title={t("Welcome back")} subtitle={t("Sign in to your PricePro account")}>
      <form onSubmit={submit} className="space-y-4">
        {m.error && <Alert tone="error">{t(errorMessage(m.error))}</Alert>}
        <Field label={t("Email")}>
          <div className="relative"><Icon><Mail className="h-4 w-4" /></Icon><Input className="pl-9" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </Field>
        <Field label={t("Password")}>
          <div className="relative"><Icon><Lock className="h-4 w-4" /></Icon><Input className="pl-9" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        </Field>
        <div className="flex justify-end"><Link to="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">{t("Forgot password?")}</Link></div>
        <Button type="submit" className="w-full" size="lg" loading={m.isPending}>{t("Continue")}</Button>
        <p className="text-center text-sm muted">{t("No account yet?")} <Link to="/signup" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">{t("Create one")}</Link></p>
      </form>
    </AuthShell>
  );
}

export function SignupPage() {
  const { t, lang } = useI18n();
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const strong = f.password.length >= 8 && /[A-Za-z]/.test(f.password) && /\d/.test(f.password);
  const [step, setStep] = useState<CodeChallenge | null>(null);
  const m = useMutation({
    mutationFn: () => post<CodeChallenge>("/auth/signup", { ...f, language: lang }),
    onSuccess: (d) => setStep(d),
  });
  if (step) {
    return (
      <AuthShell title={t("Confirm your email")} subtitle={t("Enter the code to finish creating your account.")}>
        <CodeForm start={step} onVerified={(u) => { setUser(u); nav("/", { replace: true }); }} />
      </AuthShell>
    );
  }
  return (
    <AuthShell title={t("Create your account")} subtitle={t("Start with the Free plan. No card required.")}>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-4">
        {m.error && <Alert tone="error">{t(errorMessage(m.error))}</Alert>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("First name")}><div className="relative"><Icon><UserIcon className="h-4 w-4" /></Icon><Input className="pl-9" required autoComplete="given-name" value={f.firstName} onChange={set("firstName")} /></div></Field>
          <Field label={t("Last name")}><Input required autoComplete="family-name" value={f.lastName} onChange={set("lastName")} /></Field>
        </div>
        <Field label={t("Email")}><div className="relative"><Icon><Mail className="h-4 w-4" /></Icon><Input className="pl-9" type="email" required autoComplete="email" value={f.email} onChange={set("email")} /></div></Field>
        <Field label={t("Password")} hint={t("At least 8 characters with a letter and a number.")}>
          <div className="relative"><Icon><Lock className="h-4 w-4" /></Icon><Input className="pl-9" type="password" required autoComplete="new-password" value={f.password} onChange={set("password")} /></div>
        </Field>
        {f.password && (
          <p className={`flex items-center gap-1.5 text-xs ${strong ? "text-emerald-600" : "text-amber-600"}`}>
            <CheckCircle2 className="h-3.5 w-3.5" />{strong ? t("Password meets the requirements") : t("Add more characters, a letter and a number")}
          </p>
        )}
        <Button type="submit" className="w-full" size="lg" loading={m.isPending} disabled={!strong}>{t("Create account")}</Button>
        <p className="text-center text-sm muted">{t("Already have an account?")} <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">{t("Sign in")}</Link></p>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const m = useMutation({ mutationFn: () => post<{ message: string; devResetUrl?: string }>("/auth/forgot-password", { email }) });
  return (
    <AuthShell title={t("Reset your password")} subtitle={t("We will email you a link to choose a new password.")}>
      {m.isSuccess ? (
        <div className="space-y-4">
          <Alert tone="success">{t("If an account exists for this email, a reset link has been sent.")}</Alert>
          {m.data.devResetUrl && <Alert tone="info">{t("Development mode (no email server): ")}<a className="font-semibold underline" href={m.data.devResetUrl}>{t("open reset link")}</a></Alert>}
          <Link to="/login"><Button variant="secondary" className="w-full">{t("Back to sign in")}</Button></Link>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-4">
          {m.error && <Alert tone="error">{errorMessage(m.error)}</Alert>}
          <Field label={t("Email")}><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Button type="submit" className="w-full" size="lg" loading={m.isPending}>{t("Send reset link")}</Button>
          <p className="text-center text-sm"><Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">{t("Back to sign in")}</Link></p>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const m = useMutation({ mutationFn: () => post("/auth/reset-password", { token, password }) });
  const mismatch = confirm.length > 0 && confirm !== password;
  return (
    <AuthShell title={t("Choose a new password")}>
      {!token ? (
        <Alert tone="error">{t("This reset link is invalid. Request a new one.")}</Alert>
      ) : m.isSuccess ? (
        <div className="space-y-4">
          <Alert tone="success">{t("Your password was changed. All sessions were signed out.")}</Alert>
          <Link to="/login"><Button className="w-full">{t("Sign in")}</Button></Link>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (!mismatch) m.mutate(); }} className="space-y-4">
          {m.error && <Alert tone="error">{errorMessage(m.error)}</Alert>}
          <Field label={t("New password")} hint={t("At least 8 characters with a letter and a number.")}><Input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Field label={t("Confirm password")} error={mismatch ? t("Passwords do not match") : undefined}><Input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          <Button type="submit" className="w-full" size="lg" loading={m.isPending} disabled={mismatch}>{t("Update password")}</Button>
        </form>
      )}
    </AuthShell>
  );
}
