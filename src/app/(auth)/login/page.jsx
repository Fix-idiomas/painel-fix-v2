"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen grid place-items-center text-sm text-slate-500">
          Carregando…
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}

export const dynamic = "force-dynamic";

const TRUST_POINTS = [
  "PF e PJ no mesmo painel",
  "Lembretes automáticos por e-mail",
  "Suporte que entende o dia a dia",
];

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotMsg, setForgotMsg] = useState("");
  const [forgotError, setForgotError] = useState(false);

  useEffect(() => {
    if (searchParams?.get("signup") === "ok") {
      setNotice("Conta criada. Confira seu e-mail pra confirmar o cadastro.");
    }
  }, [searchParams]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (loginErr) throw loginErr;

      const { data: tenantId, error: tErr } = await supabase.rpc(
        "current_tenant_id"
      );
      if (tErr) throw new Error("Falha ao validar tenant: " + tErr.message);

      if (!tenantId) {
        router.replace("/onboarding");
        router.refresh();
        return;
      }

      const next = searchParams?.get("next") || "/recepcao";
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e) {
    e?.preventDefault?.();
    setForgotSending(true);
    setForgotMsg("");
    setForgotError(false);
    try {
      const emailToSend = (forgotEmail || email || "").trim();
      if (!emailToSend) throw new Error("Informe seu e-mail.");
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : "http://localhost:3000";
      const redirectTo = `${origin}/reset-password`;
      const { error: rErr } = await supabase.auth.resetPasswordForEmail(
        emailToSend,
        { redirectTo }
      );
      if (rErr) throw rErr;
      setForgotMsg("Se o e-mail existir, enviamos um link de recuperação.");
    } catch (err) {
      setForgotError(true);
      setForgotMsg(err?.message || String(err));
    } finally {
      setForgotSending(false);
    }
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-2 bg-slate-50">
      {/* Mobile hero strip (escondido em md+) */}
      <div
        className="md:hidden relative px-6 pt-10 pb-12 text-white overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, var(--fix-primary) 0%, #5a121e 100%)",
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "20px 20px",
          }}
        />
        <Link href="/" className="relative inline-flex items-center gap-2">
          <span
            className="grid place-items-center h-9 w-9 rounded-lg bg-white/95 text-base font-bold"
            style={{ color: "var(--fix-primary)" }}
          >
            F
          </span>
          <span className="font-semibold tracking-tight text-white">
            Fix <span className="text-white/70 font-light">Idiomas</span>
          </span>
        </Link>
        <h1 className="relative mt-6 text-2xl font-bold tracking-tight">
          Bem-vindo de volta.
        </h1>
        <p className="relative mt-1 text-sm text-white/80">
          Acesse sua escola e continue de onde parou.
        </p>
      </div>

      {/* Painel lateral (desktop/tablet) */}
      <aside
        className="relative hidden md:flex flex-col justify-between p-10 lg:p-12 text-white overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, var(--fix-primary) 0%, #5a121e 100%)",
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />

        <Link href="/" className="relative flex items-center gap-2.5">
          <span
            className="grid place-items-center h-9 w-9 rounded-lg bg-white/95 text-base font-bold"
            style={{ color: "var(--fix-primary)" }}
          >
            F
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Fix <span className="text-white/70 font-light">Idiomas</span>
          </span>
        </Link>

        <div className="relative">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight leading-tight max-w-md">
            Bem-vindo de volta.
          </h1>
          <p className="mt-4 text-white/80 leading-relaxed max-w-md">
            Continue cuidando dos seus alunos, turmas e finanças num lugar só.
          </p>

          <ul className="mt-8 space-y-3 max-w-md">
            {TRUST_POINTS.map((t) => (
              <li
                key={t}
                className="flex items-center gap-3 text-sm text-white/90"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-white" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative text-xs text-white/60">
          © {new Date().getFullYear()} Fix Idiomas
        </div>
      </aside>

      {/* Formulário */}
      <main className="flex items-start md:items-center justify-center px-4 sm:px-6 md:px-10 lg:px-16 -mt-8 md:mt-0 pb-10 md:py-10">
        <div className="w-full max-w-md md:max-w-lg bg-white md:bg-transparent rounded-2xl md:rounded-none shadow-sm md:shadow-none border md:border-0 border-slate-200 p-6 sm:p-8 md:p-0">
          <h2 className="hidden md:block text-2xl lg:text-3xl font-semibold tracking-tight text-slate-900">
            Entrar no painel
          </h2>
          <p className="hidden md:block mt-2 text-sm lg:text-base text-slate-600">
            Acesse a sua escola e continue de onde parou.
          </p>

          {notice && (
            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {notice}
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-2 md:mt-8 space-y-5">
            <Field
              label="E-mail"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="voce@escola.com"
              autoComplete="email"
              icon={Mail}
              required
            />

            <div>
              <PasswordField
                label="Senha"
                value={password}
                onChange={setPassword}
                show={showPw}
                onToggleShow={() => setShowPw((v) => !v)}
                placeholder="Sua senha"
                autoComplete="current-password"
              />
              <div className="mt-1.5 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setForgotOpen(true);
                    setForgotEmail(email);
                    setForgotMsg("");
                    setForgotError(false);
                  }}
                  className="text-xs text-slate-600 hover:underline"
                >
                  Esqueci minha senha
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow disabled:opacity-60"
              style={{ background: "var(--fix-primary)" }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Entrando…
                </>
              ) : (
                <>
                  Entrar
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-sm text-slate-600 text-center">
            Ainda não tem conta?{" "}
            <Link
              href="/signup"
              className="font-medium hover:underline"
              style={{ color: "var(--fix-primary)" }}
            >
              Criar conta grátis
            </Link>
          </div>
        </div>
      </main>

      {forgotOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm grid place-items-center px-4">
          <form
            onSubmit={handleForgot}
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl border border-slate-200"
          >
            <div className="flex items-start justify-between mb-1">
              <h3 className="text-base font-semibold text-slate-900">
                Recuperar senha
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (forgotSending) return;
                  setForgotOpen(false);
                  setForgotMsg("");
                }}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Informe seu e-mail. Enviaremos um link pra redefinir a senha.
            </p>

            <Field
              label="E-mail"
              type="email"
              value={forgotEmail}
              onChange={setForgotEmail}
              placeholder="voce@escola.com"
              icon={Mail}
              required
            />

            {forgotMsg && (
              <div
                className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                  forgotError
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800"
                }`}
              >
                {forgotMsg}
              </div>
            )}

            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  if (forgotSending) return;
                  setForgotOpen(false);
                  setForgotMsg("");
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                disabled={forgotSending}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={forgotSending}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                style={{ background: "var(--fix-primary)" }}
              >
                {forgotSending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {forgotSending ? "Enviando…" : "Enviar link"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  icon: Icon,
  required,
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <div className="relative mt-1">
        {Icon && (
          <Icon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className={`w-full rounded-lg border border-slate-300 bg-white py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 ${
            Icon ? "pl-10 pr-3" : "px-3"
          }`}
        />
      </div>
    </label>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggleShow,
  placeholder,
  autoComplete,
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <div className="relative mt-1">
        <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}
