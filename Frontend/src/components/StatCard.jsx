export default function StatCard({ label, value, accent = "ink", sub }) {
  const accentClass =
    {
      ink: "text-ink",
      gold: "text-gold-dark",
      rust: "text-rust",
      low: "text-risk-low",
    }[accent] || "text-ink";

  return (
    <div className="card p-5">
      <p className="label">{label}</p>
      <p className={`font-display text-3xl font-medium ${accentClass}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-soft">{sub}</p>}
    </div>
  );
}
