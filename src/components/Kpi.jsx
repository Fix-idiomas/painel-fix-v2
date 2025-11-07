// Padrão dos cards do print: cartão branco, borda sutil e sombra leve. Sem faixas coloridas.
// Mantém suporte a `subtitle` (linhas auxiliares) e ignora `tone` para visual consistente.
export default function Kpi({ title, value, subtitle = null, tone = "neutral" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <div className="text-xs text-slate-600">{title}</div>
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      {subtitle && (
        <div className="mt-1 text-xs text-slate-500 whitespace-pre-line">{subtitle}</div>
      )}
    </div>
  );
}

