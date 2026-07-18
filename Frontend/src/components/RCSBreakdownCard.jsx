const PILLARS = [
  { key: "payment_points", max: 240, label: "Payment History" },
  { key: "utilization_points", max: 180, label: "Credit Utilization" },
  { key: "vintage_points", max: 90, label: "Relationship Vintage" },
  { key: "returns_points", max: 90, label: "Returns Trend" },
];

export default function RCSBreakdownCard({ rcs }) {
  if (!rcs) {
    return (
      <div className="card p-5">
        <p className="label">Credit score</p>
        <p className="mt-2 text-sm text-ink-soft">No score yet — this retailer has no invoice history.</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between">
        <p className="label">Retailer Credit Score (RCS)</p>
        <p className="font-mono text-xs text-ink-soft">300–900 scale</p>
      </div>
      <div className="mt-3 space-y-3">
        {PILLARS.map((p) => (
          <div key={p.key}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-soft">{p.label}</span>
              <span className="font-mono text-ink">
                {rcs[p.key]} / {p.max}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-paper">
              <div className="h-full bg-gold" style={{ width: `${(rcs[p.key] / p.max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-xs">
        <div>
          <p className="text-ink-soft">Avg. delay</p>
          <p className="font-mono text-ink">{rcs.average_delay_days} days</p>
        </div>
        <div>
          <p className="text-ink-soft">Utilization</p>
          <p className="font-mono text-ink">
            {rcs.utilization_pct === null ? "No data" : `${rcs.utilization_pct}%`}
          </p>
        </div>
        <div>
          <p className="text-ink-soft">Bounced payments (12mo)</p>
          <p className={`font-mono ${rcs.bounced_count_12m > 0 ? "text-rust" : "text-ink"}`}>
            {rcs.bounced_count_12m}
          </p>
        </div>
        <div>
          <p className="text-ink-soft">Wholesalers reporting</p>
          <p className="font-mono text-ink">{rcs.reporting_businesses}</p>
        </div>
      </div>
    </div>
  );
}
