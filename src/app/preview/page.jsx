import Link from "next/link";

const MOCKS = [
  { href: "/preview/dashboard",                    title: "Início (Dashboard)", desc: "KPIs, próximas aulas, atividade recente" },
  { href: "/preview/alunos",                       title: "Alunos",             desc: "Lista com cards responsivos, busca, filtros" },
  { href: "/preview/pagadores",                    title: "Pagadores",          desc: "Responsáveis financeiros e pendências" },
  { href: "/preview/professores",                  title: "Professores",        desc: "Turmas, horas, repasses por professor" },
  { href: "/preview/turmas",                       title: "Turmas",             desc: "Grade de turmas com ocupação e status" },
  { href: "/preview/agenda",                       title: "Agenda",             desc: "Semana (desktop) + dia (mobile)" },
  { href: "/preview/financeiro",                   title: "Financeiro",         desc: "KPIs do mês, áreas, últimos lançamentos" },
  { href: "/preview/financeiro/mensalidades",      title: "Mensalidades",       desc: "Lançamentos recorrentes dos alunos" },
  { href: "/preview/gastos",                       title: "Gastos",             desc: "Despesas operacionais do mês" },
  { href: "/preview/financeiro/outras-receitas",   title: "Outras receitas",    desc: "Taxas, materiais, eventos" },
  { href: "/preview/financeiro/categorias",        title: "Categorias",         desc: "Categorias contábeis (receita/despesa)" },
  { href: "/preview/relatorios",                   title: "Relatórios",         desc: "Gráfico destaque + catálogo de relatórios" },
  { href: "/preview/config",                       title: "Configurações",      desc: "Organização, aparência, equipe, etc." },
  { href: "/preview/conta",                        title: "Minha conta",        desc: "Perfil, segurança, preferências" },
];

export default function PreviewIndex() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="mb-8">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--p-text-faint)]">
          Painel Fix · Preview
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--p-text)]">
          Redesign — mockups
        </h1>
        <p className="mt-2 text-sm text-[var(--p-text-muted)]">
          Páginas estáticas para validar a direção visual antes de aplicar ao app real.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {MOCKS.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="p-card p-card-hover flex items-center justify-between px-5 py-4"
          >
            <div>
              <div className="text-base font-medium text-[var(--p-text)]">{m.title}</div>
              <div className="mt-0.5 text-sm text-[var(--p-text-muted)]">{m.desc}</div>
            </div>
            <span className="text-[var(--p-text-faint)]">›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
