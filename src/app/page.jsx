import Link from "next/link";
import {
  GraduationCap,
  CalendarDays,
  CheckCircle2,
  Wallet,
  BarChart3,
  ArrowRight,
  Sparkles,
  Heart,
  Coffee,
  FileSpreadsheet,
  ReceiptText,
} from "lucide-react";

const features = [
  {
    Icon: ReceiptText,
    title: "Financeiro PF & PJ no mesmo painel",
    description:
      "Pague a Microsoft no cartão pessoal, mas marque como custo da escola. Os números aparecem juntos quando você quer — separados quando precisa.",
    highlight: true,
  },
  {
    Icon: GraduationCap,
    title: "Seus alunos organizados",
    description:
      "Cadastro com mensalidade, vencimento, contato e histórico. Aniversariantes do mês e quem está prestes a vencer aparecem na hora certa.",
  },
  {
    Icon: CalendarDays,
    title: "Turmas e agenda sem dor de cabeça",
    description:
      "Monte turmas com regras de recorrência semanal e o sistema gera as sessões pra você. Veja sua semana num relance.",
  },
  {
    Icon: CheckCircle2,
    title: "Presença em poucos cliques",
    description:
      "Registre quem veio em cada aula. A frequência fica gravada por aluno e por turma, pronta pra consulta.",
  },
  {
    Icon: Wallet,
    title: "Mensalidades em lote",
    description:
      "Gere as cobranças do mês todas de uma vez. Marque como pago, cancele, reabra. Sem planilha, sem retrabalho.",
  },
  {
    Icon: BarChart3,
    title: "KPIs que importam pra você",
    description:
      "Receita do mês, inadimplência, aging de recebíveis. Indicadores prontos, do tamanho da sua operação.",
  },
];

const steps = [
  {
    n: "01",
    title: "Crie sua conta",
    description: "Em minutos. Sem cartão, sem promessa de upgrade caro depois.",
  },
  {
    n: "02",
    title: "Cadastre seus alunos e turmas",
    description:
      "Importe ou cadastre como preferir. Defina mensalidade, vencimento e regras de aula.",
  },
  {
    n: "03",
    title: "Volte a focar em dar aula",
    description:
      "A operação roda no automático. Você abre o painel quando quiser ver como está indo.",
  },
];

export const metadata = {
  title: "Fix Idiomas — Feito por professor, pra professor.",
  description:
    "Plataforma de gestão para professores autônomos e micro-escolas. PF e PJ no mesmo painel, sem virar empresa.",
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
            <a href="#diferencial" className="hover:text-slate-900 transition-colors">
              Por que diferente
            </a>
            <a href="#funcionalidades" className="hover:text-slate-900 transition-colors">
              Funcionalidades
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
            Para professores e micro-escolas de idiomas
          </span>

          <h1 className="mt-6 text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] max-w-3xl mx-auto">
            Organize seu negócio sem precisar{" "}
            <span style={{ color: "var(--fix-primary)" }}>virar uma empresa.</span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Sua vida pessoal e a sua escola estão misturadas — e tá tudo bem.
            Fix junta seus alunos, turmas, presenças e finanças num painel
            que entende esse dia a dia. Feito por professor, pra professor.
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
              href="#diferencial"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-lg text-base font-semibold border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50 transition-colors"
            >
              Por que somos diferentes
            </a>
          </div>

          {/* Linha de objeções respondidas */}
          <div className="mt-14 flex flex-wrap gap-2 justify-center text-xs">
            {[
              "Sem trocar planilha por ERP caro",
              "PF e PJ no mesmo lugar",
              "Preço de quem tem 30 alunos",
            ].map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200"
              >
                <CheckCircle2 size={13} style={{ color: "var(--fix-primary)" }} />
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── Por que diferente (contraste) ─────────── */}
      <section
        id="diferencial"
        className="py-20 sm:py-28"
        style={{ background: "var(--fix-bg)" }}
      >
        <div className="max-w-5xl mx-auto px-6">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--fix-primary)" }}
            >
              Por que diferente
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              Os outros sistemas falam com a sua escola.
              <br />
              <span style={{ color: "var(--fix-primary)" }}>A gente fala com você.</span>
            </h2>
            <p className="mt-4 text-base text-slate-600 leading-relaxed">
              Quem dá aula sozinho ou com poucos professores não é igual a uma escola
              com 300 alunos, prédio e secretaria. Mas o mercado finge que é.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {/* Os outros */}
            <div className="p-7 rounded-2xl border border-slate-200 bg-white">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
                Os outros sistemas
              </div>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex gap-2">
                  <span className="text-slate-400 mt-0.5">✕</span>
                  Cobram R$ 180 a R$ 300 por mês — caro pra quem tem 25, 30 alunos.
                </li>
                <li className="flex gap-2">
                  <span className="text-slate-400 mt-0.5">✕</span>
                  Te tratam como CNPJ formal, ignorando que sua vida e seu negócio se
                  misturam no dia a dia.
                </li>
                <li className="flex gap-2">
                  <span className="text-slate-400 mt-0.5">✕</span>
                  São ERPs robustos adaptados — cheios de feature que você nunca vai usar.
                </li>
                <li className="flex gap-2">
                  <span className="text-slate-400 mt-0.5">✕</span>
                  Falam com "a sua escola". Nunca com você.
                </li>
              </ul>
            </div>

            {/* Fix */}
            <div
              className="p-7 rounded-2xl border-2 shadow-sm"
              style={{
                borderColor: "var(--fix-primary)",
                background: "white",
              }}
            >
              <div
                className="text-xs font-semibold uppercase tracking-wider mb-4 inline-flex items-center gap-1.5"
                style={{ color: "var(--fix-primary)" }}
              >
                <Sparkles size={13} />
                Fix Idiomas
              </div>
              <ul className="space-y-3 text-sm text-slate-700">
                <li className="flex gap-2">
                  <CheckCircle2
                    size={16}
                    className="mt-0.5 shrink-0"
                    style={{ color: "var(--fix-primary)" }}
                  />
                  Preço compatível com a realidade de quem dá aula.
                </li>
                <li className="flex gap-2">
                  <CheckCircle2
                    size={16}
                    className="mt-0.5 shrink-0"
                    style={{ color: "var(--fix-primary)" }}
                  />
                  Separa PF e PJ quando você quer; mostra junto quando faz sentido.
                </li>
                <li className="flex gap-2">
                  <CheckCircle2
                    size={16}
                    className="mt-0.5 shrink-0"
                    style={{ color: "var(--fix-primary)" }}
                  />
                  Só o que professor de idiomas usa. Nada de inflado.
                </li>
                <li className="flex gap-2">
                  <CheckCircle2
                    size={16}
                    className="mt-0.5 shrink-0"
                    style={{ color: "var(--fix-primary)" }}
                  />
                  Feito por professor, pra professor. A gente vive a mesma rotina.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── Features ─────────── */}
      <section id="funcionalidades" className="py-20 sm:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--fix-primary)" }}
            >
              Funcionalidades
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              O que cabe no seu dia a dia
            </h2>
            <p className="mt-4 text-base text-slate-600 leading-relaxed">
              Cada módulo nasceu de uma necessidade real de quem dá aula —
              não de um checklist de ERP corporativo.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map(({ Icon, title, description, highlight }) => (
              <div
                key={title}
                className={
                  "group relative p-6 rounded-2xl bg-white border transition-all hover:shadow-md " +
                  (highlight
                    ? "border-2 shadow-sm"
                    : "border-slate-200 hover:border-slate-300")
                }
                style={
                  highlight
                    ? { borderColor: "var(--fix-primary)" }
                    : undefined
                }
              >
                {highlight && (
                  <span
                    className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                    style={{
                      color: "var(--fix-primary)",
                      background: "rgba(139, 28, 44, 0.08)",
                    }}
                  >
                    Diferencial
                  </span>
                )}
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
      <section
        id="como-funciona"
        className="py-20 sm:py-28"
        style={{ background: "var(--fix-bg)" }}
      >
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
      <section id="para-quem" className="py-20 sm:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--fix-primary)" }}
            >
              Para quem é
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
              Se você se reconhece aqui, a Fix foi feita pra você.
            </h2>
            <p className="mt-5 text-base text-slate-600 leading-relaxed">
              Não importa se você dá aula sozinho ou tem dois ou três professores
              ajudando. Se você é dono e operador ao mesmo tempo, a gente entende.
            </p>
          </div>

          <ul className="grid sm:grid-cols-2 gap-4">
            {[
              {
                Icon: GraduationCap,
                label: "Professor autônomo",
                detail: "Dá aula particular ou em casa.",
              },
              {
                Icon: Heart,
                label: "Micro-escola",
                detail: "Você e mais alguns professores.",
              },
              {
                Icon: FileSpreadsheet,
                label: "Cansou da planilha",
                detail: "Mas acha ERP caro demais.",
              },
              {
                Icon: Coffee,
                label: "Vida e trabalho misturados",
                detail: "Quer organizar sem virar empresa.",
              },
            ].map(({ Icon, label, detail }) => (
              <li
                key={label}
                className="flex items-start gap-3 p-4 rounded-xl bg-white border border-slate-200"
              >
                <div
                  className="w-9 h-9 grid place-items-center rounded-lg shrink-0"
                  style={{
                    background: "rgba(139, 28, 44, 0.08)",
                    color: "var(--fix-primary)",
                  }}
                >
                  <Icon size={18} />
                </div>
                <div>
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{detail}</div>
                </div>
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
                Volte a focar no que você ama: dar aula.
              </h2>
              <p className="mt-4 text-base sm:text-lg text-white/85 max-w-xl mx-auto">
                A gente cuida do resto — do jeito que faz sentido pra você.
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
              Feito por professor, pra professor. Sem firula corporativa.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
              Produto
            </h4>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>
                <a href="#diferencial" className="hover:text-slate-900 transition-colors">
                  Por que diferente
                </a>
              </li>
              <li>
                <a href="#funcionalidades" className="hover:text-slate-900 transition-colors">
                  Funcionalidades
                </a>
              </li>
              <li>
                <a href="#para-quem" className="hover:text-slate-900 transition-colors">
                  Para quem é
                </a>
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
                  Entrar
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
            <span>Feito com cuidado para quem ensina idiomas.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
