import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import StampBadge from "../../components/StampBadge";
import RCSBreakdownCard from "../../components/RCSBreakdownCard";
import StatCard from "../../components/StatCard";

const money = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

export default function RetailerDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/retailer-portal/dashboard")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-rust">{error}</p>;
  if (!data) return <p className="font-mono text-sm text-ink-soft">Loading…</p>;

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium text-ink">{data.retailer_name}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Your payment record, as seen by every wholesaler on the platform.
          </p>
        </div>
        <StampBadge rcs={data.rcs} size="lg" />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-5 lg:grid-cols-4">
        <StatCard label="Total outstanding" value={money(data.total_outstanding)} accent="rust" />
        <StatCard label="Wholesalers reporting" value={data.reporting_wholesalers} accent="ink" />
        <StatCard label="Total invoices" value={data.total_invoices} accent="ink" />
        <StatCard
          label="Open disputes"
          value={data.open_disputes}
          accent={data.open_disputes > 0 ? "gold" : "low"}
        />
      </div>

      {data.open_disputes > 0 && (
        <div className="mt-6 rounded-md border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold-dark">
          You have {data.open_disputes} open dispute{data.open_disputes > 1 ? "s" : ""}. These bills are excluded
          from your credit score while the wholesaler reviews them.{" "}
          <Link to="/retailer-app/disputes" className="font-medium underline">
            View disputes
          </Link>
        </div>
      )}

      <div className="mt-5 max-w-md">
        <RCSBreakdownCard rcs={data.rcs} />
      </div>

      <div className="mt-8">
        <Link to="/retailer-app/invoices" className="btn-primary">
          View all my bills
        </Link>
      </div>
    </div>
  );
}
