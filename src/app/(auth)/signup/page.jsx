"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const TRUST_POINTS = [
  "14 dias grátis · sem cartão",
  "PF e PJ no mesmo painel",
  "Cancele quando quiser",
];

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSignup(e) {
    e.preventDefault();
    setError("");

    if ((password || "").length < 8) {
      setError("Senha precisa ter ao menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    try {
      setLoading(true);
      const { data, error: signupErr } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signupErr) throw signupErr;

      if (data.session) {
        // sessão imediata (sem confirmação de e-mail) → vai pro onboarding
        router.push("/onboarding");
        return;
      }
      // precisa confirmar e-mail → manda pro login com mensagem
      router.push("/login?signup=ok");
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  const pwStrength = passwordStrength(password);

  return (
    <div className="min-h-screen md:grid md:grid-cols-2 bg-slate-50">
      {/* Mobile hero strip */}
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
        <div className="relative mt-5 inline-flex items-center gap-2 rounded-full bg-white/15 border border-white/20 px-3 py-1 text-[11px] font-medium backdrop-blur">
          <Sparkles className="h-3 w-3" />
          14 dias grátis · sem cartão
        </div>
        <h1 className="relative mt-3 text-2xl font-bold tracking-tight">
          Crie sua escola
        </h1>
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
          <span className="grid place-items-center h-9 w-9 rounded-lg bg-white/95 text-base font-bold" style={{ color: "var(--fix-primary)" }}>
            F
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Fix <span className="text-white/70 font-light">Idiomas</span>
          </span>
        </Link>

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 border border-white/20 px-3 py-1 text-xs font-medium backdrop-blur">
            <Sparkles className="h-3 w-3" />
            Comece grátis · sem cartão
          </div>
          <h1 className="mt-6 text-3xl lg:text-4xl font-bold tracking-tight leading-tight max-w-md">
            Volte a focar no que você ama:{" "}
            <span className="text-white/90">dar aula.</span>
          </h1>
          <p className="mt-4 text-white/80 leading-relaxed max-w-md">
            A gente cuida do resto — alunos, turmas, presenças e finanças num
            painel feito por professor, pra professor.
          </p>

          <ul className="mt-8 space-y-3 max-w-md">
            {TRUST_POINTS.map((t) => (
              <li key={t} className="flex items-center gap-3 text-sm text-white/90">
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
            Crie sua escola
          </h2>
          <p className="hidden md:block mt-2 text-sm lg:text-base text-slate-600">
            14 dias grátis · sem cartão. Cancele quando quiser.
          </p>

          <form onSubmit={handleSignup} className="mt-2 md:mt-8 space-y-5">
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
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
              />
              {password && <StrengthBar score={pwStrength} />}
            </div>

            <PasswordField
              label="Confirmar senha"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showPw}
              onToggleShow={() => setShowPw((v) => !v)}
              placeholder="Repita a senha"
              autoComplete="new-password"
            />

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
                  Criando conta…
                </>
              ) : (
                <>
                  Criar conta grátis
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <p className="text-[11px] text-slate-500 text-center leading-relaxed">
              Ao criar a conta, você concorda em receber comunicações operacionais
              da Fix Idiomas. Sem spam.
            </p>
          </form>

          <div className="mt-6 text-sm text-slate-600 text-center">
            Já tem conta?{" "}
            <Link
              href="/login"
              className="font-medium hover:underline"
              style={{ color: "var(--fix-primary)" }}
            >
              Entrar
            </Link>
          </div>
        </div>
      </main>
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
          minLength={8}
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

function passwordStrength(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

function StrengthBar({ score }) {
  const labels = ["Fraca", "Razoável", "Boa", "Forte", "Excelente"];
  const colors = ["bg-rose-400", "bg-amber-400", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"];
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="flex-1 grid grid-cols-4 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 rounded-full ${
              score > i ? colors[score - 1] : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <span className="text-[11px] text-slate-500 w-16 text-right">
        {labels[Math.max(score - 1, 0)]}
      </span>
    </div>
  );
}
