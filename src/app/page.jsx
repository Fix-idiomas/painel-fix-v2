import Link from "next/link";

const features = [
  {
    icon: "👨‍🎓",
    title: "Gestão de Alunos",
    description:
      "Cadastro completo com dados de contato, mensalidade, vencimento e histórico de pagamentos.",
  },
  {
    icon: "👩‍🏫",
    title: "Turmas & Agenda",
    description:
      "Monte turmas, defina regras de recorrência e acompanhe a agenda de aulas em tempo real.",
  },
  {
    icon: "✅",
    title: "Controle de Presença",
    description:
      "Registre presenças por sessão e visualize o histórico de frequência de cada aluno.",
  },
  {
    icon: "💰",
    title: "Financeiro Completo",
    description:
      "Gere cobranças mensais, registre pagamentos, controle despesas e acompanhe KPIs financeiros.",
  },
  {
    icon: "📊",
    title: "Relatórios",
    description:
      "Visualize inadimplências, receitas consolidadas, aging de recebíveis e muito mais.",
  },
  {
    icon: "⚙️",
    title: "Multi-tenant",
    description:
      "Cada escola tem seu próprio ambiente isolado com identidade visual e usuários próprios.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--fix-bg)" }}>
      {/* ── Navbar ── */}
      <header
        style={{ background: "var(--fix-surface)", borderBottom: "1px solid var(--fix-border)" }}
        className="sticky top-0 z-50 shadow-sm"
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <span
              className="text-2xl font-bold tracking-tight"
              style={{ color: "var(--fix-primary)" }}
            >
              Fix
            </span>
            <span className="text-2xl font-light text-slate-600">Idiomas</span>
          </div>

          {/* CTA */}
          <Link
            href="/login"
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{
              background: "var(--fix-primary)",
              focusRingColor: "var(--fix-primary)",
            }}
          >
            Entrar
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section
        className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24"
        style={{
          background: "linear-gradient(135deg, var(--fix-primary) 0%, #b02238 100%)",
        }}
      >
        <span
          className="inline-block mb-4 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-widest"
          style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
        >
          Plataforma de gestão escolar
        </span>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight max-w-3xl">
          Tudo que sua escola de idiomas precisa, em um só lugar.
        </h1>
        <p
          className="mt-6 text-lg sm:text-xl max-w-xl leading-relaxed"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          Gerencie alunos, turmas, professores e finanças com facilidade. Menos planilha, mais resultado.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4">
          <Link
            href="/login"
            className="px-8 py-3 rounded-lg font-semibold text-base transition-all hover:opacity-90 shadow-lg"
            style={{ background: "#fff", color: "var(--fix-primary)" }}
          >
            Acessar o painel
          </Link>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="max-w-6xl mx-auto px-6 py-20 w-full">
        <div className="text-center mb-12">
          <h2
            className="text-3xl font-bold"
            style={{ color: "var(--fix-text)" }}
          >
            Funcionalidades principais
          </h2>
          <p className="mt-3 text-base" style={{ color: "var(--fix-text-muted)" }}>
            Desenvolvido especialmente para escolas de idiomas.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl p-6 flex flex-col gap-3 transition-shadow hover:shadow-md"
              style={{
                background: "var(--fix-surface)",
                border: "1px solid var(--fix-border)",
              }}
            >
              <span className="text-3xl">{f.icon}</span>
              <h3 className="text-base font-semibold" style={{ color: "var(--fix-text)" }}>
                {f.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--fix-text-muted)" }}>
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        className="text-center py-8 text-xs"
        style={{
          borderTop: "1px solid var(--fix-border)",
          color: "var(--fix-text-muted)",
          background: "var(--fix-surface)",
        }}
      >
        © {new Date().getFullYear()} Fix Idiomas · Todos os direitos reservados
      </footer>
    </div>
  );
}
