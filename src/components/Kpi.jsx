export default function Kpi({ title, value, tone = "neutral" }) {
  return (
    <div className={`kpi kpi--${tone}`}>
      <h3 className="kpi__title">{title}</h3>
      <p className="kpi__value">{value}</p>
    </div>
  );
}

