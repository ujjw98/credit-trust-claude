import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import StatCard from "../../components/StatCard";

const money = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/dashboard")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-rust">{error}</p>;
  if (!data) return <p className="font-mono text-sm text-ink-soft">Loading ledger…</p>;

  return (
    <div>
      <h1 className="font-display text-3xl font-medium text-ink">Dashboard</h1>
      <p className="mt-1 text-sm text-ink-soft">Your credit sales at a glance.</p>

      <div className="mt-8 grid grid-cols-2 gap-5 lg:grid-cols-4">
        <StatCard label="Total outstanding" value={money(data.total_credit_outstanding)} accent="ink" />
        <StatCard label="Overdue amount" value={money(data.overdue_amount)} accent="rust" />
        <StatCard label="Invoices due today" value={data.invoices_due_today} accent="gold" />
        <StatCard
          label="Unique retailers billed"
          value={data.unique_retailers_billed}
          accent="ink"
          sub={`${data.total_invoices} invoices total`}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-1">
          <p className="label">Collection rate</p>
          <p className="font-display text-3xl font-medium text-risk-low">{data.collection_rate}%</p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-paper">
            <div className="h-full bg-risk-low" style={{ width: `${Math.min(data.collection_rate, 100)}%` }} />
          </div>
        </div>

        <div className="card p-5 lg:col-span-2">
          <p className="label mb-3">Recent activity</p>
          {data.recent_activity.length === 0 ? (
            <p className="text-sm text-ink-soft">No payments recorded yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.recent_activity.map((a, i) => (
                <li key={i} className="flex items-center justify-between py-2.5 text-sm">
                  <Link to={`/app/retailers/${a.retailer_id}`} className="text-ink hover:text-gold-dark hover:underline">
                    {a.retailer_name}
                  </Link>
                  <span className="font-mono text-ink">{money(a.amount)}</span>
                  {a.bounced && (
                    <span className="rounded-full bg-rust/10 px-2 py-0.5 text-xs font-medium text-rust">Bounced</span>
                  )}
                  <span className="font-mono text-xs text-ink-soft">{a.date}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <Link to="/app/retailers" className="btn-primary">
          + Add retailer
        </Link>
        <Link to="/app/invoices" className="btn-secondary">
          + Create credit sale
        </Link>
      </div>
    </div>
  );
}
