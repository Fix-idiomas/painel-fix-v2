import Link from "next/link";
import {
  GraduationCap,
  CalendarDays,
  CheckCircle2,
  Wallet,
  BarChart3,
  Building2,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Clock,
  Languages,
  Users,
} from "lucide-react";

const features = [
  {
    Icon: GraduationCap,
    title: "Gestão de Alunos",
    description:
      "Cadastro completo, status de matrícula, vencimento de mensalidade, aniversariantes e histórico de pagamentos.",
  },
  {
    Icon: CalendarDays,
    title: "Turmas & Agenda",
    description:
      "Crie turmas com regras de recorrência, gere sessões automaticamente e visualize a semana de aulas.",
  },
  {
    Icon: CheckCircle2,
    title: "Controle de Presença",
    description:
      "Registre presença em poucos cliques e acompanhe a frequência por aluno, turma ou período.",
  },
  {
    Icon: Wallet,
    title: "Financeiro Completo",
    description:
      "Cobranças mensais geradas em lote, controle de despesas, outras receitas e fluxo de caixa.",
  },
  {
    Icon: BarChart3,
    title: "Relatórios & KPIs",
    description:
      "Inadimplência, aging de recebíveis, receita consolidada e indicadores prontos para decisão.",
  },
  {
    Icon: Building2,
    title: "Multi-tenant",
    description:
      "Cada escola opera em ambiente isolado, com identidade visual, usuários e permissões próprias.",
  },
];

const steps = [
  {
    n: "01",
    title: "Cadastre sua escola",
    description:
      "Configure o ambiente da sua unidade em minutos: identidade visual, usuários e permissões.",
  },
  {
    n: "02",
    title: "Importe alunos e turmas",
    description:
      "Adicione alunos, professores e monte turmas com regras de recorrência semanal.",
  },
  {
    n: "03",
    title: "Opere com tranquilidade",
    description:
      "Registre presenças, gere mensalidades em lote e acompanhe os KPIs no painel.",
  },
];

const stats = [
  { value: "100%", label: "Foco em escolas de idiomas" },
  { value: "Multi-unidade", label: "Cada escola em ambiente isolado" },
  { value: "Web", label: "Acesse de qualquer lugar" },
];

export const metadata = {
  title: "Fix Idiomas — Plataforma de gestão para escolas de idiomas",
  description:
    "Gestão completa de alunos, turmas, agenda, presença e financeiro para escolas de idiomas.",
};

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      {/* ─────────── Navbar ─────────── */}
      <header className="sticky top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-white/80 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <span
              className="grid place-items-center w-9 h-9 rounded-lg text-white font-bold text-lg shadow-sm"
              style={{ background: "var(--fix-primary)" }}
            >
              F
            </span>
            <span className="font-semibold text-lg tracking-tight">
              Fix <span className="text-slate-500 font-light">Idiomas</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm text-slate-600">
            <a href="#funcionalidades" className="hover:text-slate-900 transition-colors">
              Funcionalidades
            </a>
            <a href="#como-funciona" className="hover:text-slate-900 transition-colors">
              Como funciona
            </a>
            <a href="#para-quem" className="hover:text-slate-900 transition-colors">
              Para quem é
            </a>
          </nav>

          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md hover:opacity-95"
            style={{ background: "var(--fix-primary)" }}
          >
            Entrar
            <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      {/* ─────────── Hero ─────────── */}
      <section className="relative overflow-hidden">
        {/* Decorative gradient blobs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full opacity-30 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, var(--fix-primary) 0%, transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-32 w-[420px] h-[420px] rounded-full opacity-20 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, var(--fix-accent) 0%, transparent 70%)",
          }}
        />

        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-24 sm:pt-28 sm:pb-32 text-center">
          <span
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border"
            style={{
              borderColor: "var(--fix-border)",
              color: "var(--fix-primary)",
              background: "rgba(139, 28, 44, 0.06)",
            }}
          >
            <Sparkles size={12} />
            Plataforma de gestão escolar
          </span>

          <h1 className="mt-6 text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] max-w-3xl mx-auto">
            A operação da sua escola{" "}
            <span style={{ color: "var(--fix-primary)" }}>fluindo sem fricção.</span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Alunos, turmas, presença e financeiro em uma plataforma feita
            sob medida para escolas de idiomas. Menos planilha, mais resultado.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-lg text-base font-semibold text-white shadow-md transition-all hover:shadow-lg hover:scale-[1.02]"
              style={{ background: "var(--fix-primary)" }}
            >
              Acessar o painel
              <ArrowRight size={16} />
            </Link>
            <a
              href="#funcionalidades"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-lg text-base font-semibold border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50 transition-colors"
            >
              Ver funcionalidades
            </a>
          </div>

          {/* Stats strip */}
          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {stats.map((s) => (
              <div
                key={s.label}
                className="px-4 py-5 rounded-xl border border-slate-200 bg-white/70 backdrop-blur-sm"
              >
                <div
                  className="text-2xl font-bold tracking-tight"
                  style={{ color: "var(--fix-primary)" }}
                >
                  {s.value}
                </div>
                <div className="mt-1 text-sm text-slate-600">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── Features ─────────── */}
      <section
        id="funcionalidades"
        className="py-20 sm:py-28"
        style={{ background: "var(--fix-bg)" }}
      >
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--fix-primary)" }}
            >
              Funcionalidades
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              Tudo que você precisa, num só lugar
            </h2>
            <p className="mt-4 text-base text-slate-600 leading-relaxed">
              Cada módulo foi pensado para o dia a dia de uma escola de idiomas —
              sem ferramentas dispersas e processos manuais.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map(({ Icon, title, description }) => (
              <div
                key={title}
                className="group relative p-6 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all"
              >
                <div
                  className="w-11 h-11 grid place-items-center rounded-xl mb-4 transition-transform group-hover:scale-110"
                  style={{
                    background: "rgba(139, 28, 44, 0.08)",
                    color: "var(--fix-primary)",
                  }}
                >
                  <Icon size={22} strokeWidth={2.2} />
                </div>
                <h3 className="text-base font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── Como funciona ─────────── */}
      <section id="como-funciona" className="py-20 sm:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--fix-primary)" }}
            >
              Como funciona
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              Comece em três passos
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connecting line (decorative, hidden on mobile) */}
            <div
              aria-hidden
              className="hidden md:block absolute top-7 left-[16.66%] right-[16.66%] h-px"
              style={{
                background:
                  "linear-gradient(to right, transparent, var(--fix-border), transparent)",
              }}
            />

            {steps.map((s) => (
              <div key={s.n} className="relative text-center">
                <div
                  className="relative z-10 mx-auto w-14 h-14 grid place-items-center rounded-full text-white font-bold text-lg shadow-md"
                  style={{ background: "var(--fix-primary)" }}
                >
                  {s.n}
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-xs mx-auto">
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── Para quem é ─────────── */}
      <section
        id="para-quem"
        className="py-20 sm:py-28"
        style={{ background: "var(--fix-bg)" }}
      >
        <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--fix-primary)" }}
            >
              Para quem é
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
              Feito para escolas de idiomas que querem crescer com previsibilidade.
            </h2>
            <p className="mt-5 text-base text-slate-600 leading-relaxed">
              Da escola de bairro à rede com várias unidades — Fix te dá o
              controle financeiro, pedagógico e operacional num único painel.
            </p>
          </div>

          <ul className="grid sm:grid-cols-2 gap-4">
            {[
              { Icon: Languages, label: "Escolas de idiomas" },
              { Icon: Users, label: "Coordenadores e secretarias" },
              { Icon: Clock, label: "Quem busca economizar tempo" },
              { Icon: ShieldCheck, label: "Times que valorizam dados seguros" },
            ].map(({ Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-200"
              >
                <div
                  className="w-9 h-9 grid place-items-center rounded-lg"
                  style={{
                    background: "rgba(139, 28, 44, 0.08)",
                    color: "var(--fix-primary)",
                  }}
                >
                  <Icon size={18} />
                </div>
                <span className="text-sm font-medium">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ─────────── CTA banner ─────────── */}
      <section className="py-20 sm:py-24 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div
            className="relative overflow-hidden rounded-3xl px-8 py-14 sm:px-14 sm:py-16 text-center text-white shadow-xl"
            style={{
              background:
                "linear-gradient(135deg, var(--fix-primary) 0%, #b02238 50%, var(--fix-accent) 130%)",
            }}
          >
            {/* Decorative grid */}
            <div
              aria-hidden
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
                backgroundSize: "24px 24px",
              }}
            />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight max-w-2xl mx-auto leading-tight">
                Pronto para deixar a operação da sua escola no piloto automático?
              </h2>
              <p className="mt-4 text-base sm:text-lg text-white/85 max-w-xl mx-auto">
                Acesse o painel e comece a usar agora mesmo.
              </p>
              <Link
                href="/login"
                className="mt-8 inline-flex items-center gap-2 px-8 py-3.5 rounded-lg text-base font-semibold bg-white shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
                style={{ color: "var(--fix-primary)" }}
              >
                Acessar o painel
                <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── Footer ─────────── */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-12 grid sm:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="grid place-items-center w-8 h-8 rounded-lg text-white font-bold text-sm"
                style={{ background: "var(--fix-primary)" }}
              >
                F
              </span>
              <span className="font-semibold tracking-tight">
                Fix <span className="text-slate-500 font-light">Idiomas</span>
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Plataforma de gestão para escolas de idiomas.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
              Produto
            </h4>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>
                <a href="#funcionalidades" className="hover:text-slate-900 transition-colors">
                  Funcionalidades
                </a>
              </li>
              <li>
                <a href="#como-funciona" className="hover:text-slate-900 transition-colors">
                  Como funciona
                </a>
              </li>
              <li>
                <Link href="/login" className="hover:text-slate-900 transition-colors">
                  Entrar
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
              Conta
            </h4>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>
                <Link href="/login" className="hover:text-slate-900 transition-colors">
                  Login
                </Link>
              </li>
              <li>
                <Link href="/signup" className="hover:text-slate-900 transition-colors">
                  Criar conta
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-100">
          <div className="max-w-6xl mx-auto px-6 py-6 text-xs text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-2">
            <span>© {new Date().getFullYear()} Fix Idiomas. Todos os direitos reservados.</span>
            <span>Feito com cuidado para escolas de idiomas.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
