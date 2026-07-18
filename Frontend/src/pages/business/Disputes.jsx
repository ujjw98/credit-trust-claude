import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";

const REASON_LABEL = {
  wrong_bill: "Wrong bill",
  payment_not_marked: "Payment not marked",
  wrong_amount: "Wrong amount",
  other: "Other",
};

const STATUS_STYLE = {
  open: "bg-rust/10 text-rust",
  resolved: "bg-risk-low/10 text-risk-low",
  rejected: "bg-ink-soft/10 text-ink-soft",
};

export default function Disputes() {
  const [disputes, setDisputes] = useState([]);

  const load = () => api.get("/disputes").then(setDisputes);

  useEffect(() => {
    load();
  }, []);

  const open = disputes.filter((d) => d.status === "open");
  const closed = disputes.filter((d) => d.status !== "open");

  return (
    <div>
      <h1 className="font-display text-3xl font-medium text-ink">Disputes</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Bills retailers have flagged as wrong, or payments they say aren't marked cleared. Open disputes are
        excluded from that retailer's credit score until you resolve them.
      </p>

      <div className="mt-6">
        <p className="label mb-3">
          Open <span className="text-rust">({open.length})</span>
        </p>
        {open.length === 0 ? (
          <p className="text-sm text-ink-soft">No open disputes. Nice ledger.</p>
        ) : (
          <div className="space-y-3">
            {open.map((d) => (
              <DisputeCard key={d.id} dispute={d} onResolved={load} />
            ))}
          </div>
        )}
      </div>

      {closed.length > 0 && (
        <div className="mt-8">
          <p className="label mb-3">Resolved</p>
          <div className="space-y-3">
            {closed.map((d) => (
              <div key={d.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">{REASON_LABEL[d.reason] || d.reason}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLE[d.status]}`}>
                    {d.status}
                  </span>
                </div>
                {d.resolution_note && <p className="mt-1.5 text-xs text-ink-soft">{d.resolution_note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DisputeCard({ dispute, onResolved }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const resolve = async (action) => {
    setError("");
    setBusy(true);
    try {
      await api.put(`/disputes/${dispute.id}/resolve`, { action, resolution_note: note || undefined });
      onResolved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card border-l-4 border-l-rust p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{REASON_LABEL[dispute.reason] || dispute.reason}</span>
        <span className="font-mono text-xs text-ink-soft">
          {new Date(dispute.created_at).toLocaleDateString("en-IN")}
        </span>
      </div>
      {dispute.description && <p className="mt-2 text-sm text-ink-soft">{dispute.description}</p>}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          className="input flex-1"
          placeholder="Resolution note (e.g. which reference you verified)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex gap-2">
          <button className="btn-gold" disabled={busy} onClick={() => resolve("resolve")}>
            Uphold & fix
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => resolve("reject")}>
            Reject — bill stands
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-rust">{error}</p>}
      <p className="mt-2 text-xs text-ink-soft">
        If the retailer is right, record the missing payment or fix the invoice first via Invoices, then click
        "Uphold & fix."
      </p>
    </div>
  );
}
