import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import StampBadge from "../../components/StampBadge";
import RCSBreakdownCard from "../../components/RCSBreakdownCard";

const money = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

export default function RetailerProfile() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [editingLimit, setEditingLimit] = useState(false);
  const [limitValue, setLimitValue] = useState("");
  const [limitBusy, setLimitBusy] = useState(false);
  const [limitError, setLimitError] = useState("");

  const load = () =>
    api
      .get(`/retailers/${id}`)
      .then((p) => {
        setProfile(p);
        setLimitValue(p.credit_limit ?? "");
      })
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const saveLimit = async (e) => {
    e.preventDefault();
    setLimitError("");
    setLimitBusy(true);
    try {
      await api.put(`/retailers/${id}/credit-limit`, { credit_limit: Number(limitValue) });
      setEditingLimit(false);
      load();
    } catch (err) {
      setLimitError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLimitBusy(false);
    }
  };

  if (error) return <p className="text-sm text-rust">{error}</p>;
  if (!profile) return <p className="font-mono text-sm text-ink-soft">Loading…</p>;

  const r = profile.retailer;

  return (
    <div>
      <Link to="/app/retailers" className="text-xs font-medium text-ink-soft hover:underline">
        ← All retailers
      </Link>

      <div className="mt-3 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium text-ink">{r.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {r.owner_name && `${r.owner_name} · `}
            {[r.address_line, r.city, r.state, r.pincode].filter(Boolean).join(", ") || "No address on file"}
          </p>
          <p className="mt-1 font-mono text-xs text-ink-soft">
            {r.gstin && `GSTIN ${r.gstin}`} {r.drug_license && `· DL ${r.drug_license}`}
          </p>
        </div>
        <StampBadge rcs={profile.rcs} size="lg" />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-5 lg:grid-cols-4">
        <div className="card p-5">
          <p className="label">Total purchase</p>
          <p className="font-display text-2xl font-medium text-ink">{money(profile.total_purchase)}</p>
        </div>
        <div className="card p-5">
          <p className="label">Outstanding</p>
          <p className="font-display text-2xl font-medium text-rust">{money(profile.outstanding)}</p>
        </div>
        <div className="card p-5">
          <p className="label">Total suppliers</p>
          <p className="font-display text-2xl font-medium text-ink">{profile.total_suppliers}</p>
          <p className="mt-0.5 text-xs text-ink-soft">wholesalers currently supplying this retailer</p>
        </div>
        <div className="card p-5">
          <p className="label">Payment defaults</p>
          <p className="font-display text-2xl font-medium text-rust">{profile.payment_default_count}</p>
          <p className="mt-0.5 text-xs text-ink-soft">overdue invoices + bounced payments, all-time</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <RCSBreakdownCard rcs={profile.rcs} />

        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="label">Your credit limit for this retailer</p>
            {!editingLimit && (
              <button className="text-xs font-medium text-gold-dark hover:underline" onClick={() => setEditingLimit(true)}>
                {profile.credit_limit ? "Edit" : "Set limit"}
              </button>
            )}
          </div>

          {!editingLimit ? (
            <p className="mt-2 font-display text-2xl font-medium text-ink">
              {profile.credit_limit ? money(profile.credit_limit) : "Not set"}
            </p>
          ) : (
            <form onSubmit={saveLimit} className="mt-3 flex items-end gap-2">
              <div className="flex-1">
                <label className="label">Credit limit (₹)</label>
                <input
                  type="number"
                  className="input"
                  value={limitValue}
                  onChange={(e) => setLimitValue(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn-gold" disabled={limitBusy}>
                {limitBusy ? "Saving…" : "Save"}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setEditingLimit(false)}>
                Cancel
              </button>
            </form>
          )}
          {limitError && <p className="mt-2 text-xs text-rust">{limitError}</p>}
          <p className="mt-3 text-xs text-ink-soft">
            Feeds this retailer's platform-wide Credit Utilization score, summed against every wholesaler that has
            set a limit for them.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm">
            <div>
              <p className="text-ink-soft">Paid invoices (with you)</p>
              <p className="font-mono text-ink">{profile.paid_invoices}</p>
            </div>
            <div>
              <p className="text-ink-soft">Overdue invoices (with you)</p>
              <p className="font-mono text-ink">{profile.overdue_invoices}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <Link to={`/app/invoices?retailer=${r.id}`} className="btn-primary">
          + Create credit sale for {r.name}
        </Link>
      </div>
    </div>
  );
}
