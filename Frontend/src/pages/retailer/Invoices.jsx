import { Fragment, useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";

const money = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

const STATUS_STYLE = {
  paid: "bg-risk-low/10 text-risk-low",
  outstanding: "bg-gold/10 text-gold-dark",
  partial: "bg-gold/10 text-gold-dark",
  overdue: "bg-rust/10 text-rust",
};

const REASONS = [
  { value: "payment_not_marked", label: "I paid this — it's not marked cleared" },
  { value: "wrong_bill", label: "I never received this bill" },
  { value: "wrong_amount", label: "The amount is wrong" },
  { value: "other", label: "Something else" },
];

export default function RetailerInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [disputingId, setDisputingId] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const load = () => api.get("/retailer-portal/invoices").then(setInvoices);

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h1 className="font-display text-3xl font-medium text-ink">My bills</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Every bill issued to you, across every wholesaler on the platform — this is your independent check on
        what's actually on record.
      </p>

      <div className="card mt-6 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3 font-medium">Wholesaler</th>
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Outstanding</th>
              <th className="px-4 py-3 font-medium">Due</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const hasInstallments = inv.installments && inv.installments.length > 0;
              const isExpanded = expanded === inv.id;
              return (
                <Fragment key={inv.id}>
                  <tr
                    className="border-b border-line last:border-0 hover:bg-paper align-top cursor-pointer"
                    onClick={() => hasInstallments && setExpanded(isExpanded ? null : inv.id)}
                  >
                    <td className="px-4 py-3 text-ink">{inv.wholesaler_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-soft">
                      {inv.invoice_number}
                      {hasInstallments && (
                        <span className="ml-1.5 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-sans font-medium text-gold-dark">
                          Split ▾
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-ink">{money(inv.amount)}</td>
                    <td className="px-4 py-3 font-mono text-ink">{money(inv.outstanding_amount)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-soft">{inv.due_date}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLE[inv.status]}`}>
                        {inv.status}
                      </span>
                      {inv.is_disputed && (
                        <span className="ml-1.5 rounded-full bg-gold/10 px-2.5 py-1 text-xs font-medium text-gold-dark">
                          Disputed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!inv.is_disputed && (
                        <button
                          className="text-xs font-medium text-rust hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDisputingId(inv.id);
                          }}
                        >
                          This looks wrong →
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && hasInstallments && (
                    <tr className="border-b border-line bg-paper">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {inv.installments.map((i) => (
                            <div key={i.id} className="rounded-md border border-line bg-paper-card px-3 py-2 text-xs">
                              <span className="font-medium text-ink">#{i.sequence}</span>{" "}
                              <span className="font-mono text-ink-soft">{i.due_date}</span>{" "}
                              <span className="font-mono text-ink">{money(i.amount)}</span>{" "}
                              <span
                                className={`ml-1 rounded-full px-2 py-0.5 font-medium capitalize ${
                                  i.status === "paid"
                                    ? "bg-risk-low/10 text-risk-low"
                                    : i.status === "overdue"
                                    ? "bg-rust/10 text-rust"
                                    : "bg-gold/10 text-gold-dark"
                                }`}
                              >
                                {i.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-ink-soft">
                  No bills on record yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {disputingId && (
        <DisputeModal
          invoiceId={disputingId}
          onClose={() => setDisputingId(null)}
          onSubmitted={() => {
            setDisputingId(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function DisputeModal({ invoiceId, onClose, onSubmitted }) {
  const [reason, setReason] = useState(REASONS[0].value);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post(`/retailer-portal/invoices/${invoiceId}/dispute`, { reason, description: description || undefined });
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-6">
      <div className="card w-full max-w-md p-6">
        <h2 className="font-display text-xl font-medium text-ink">Flag this bill</h2>
        <p className="mt-1 text-sm text-ink-soft">
          The wholesaler will be notified immediately. This bill is excluded from your credit score until they
          resolve it.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label className="label">What's wrong?</label>
            <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Details (optional but helpful)</label>
            <textarea
              className="input min-h-[80px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Paid via UPI on 20 June, reference UPI778"
            />
          </div>
          {error && <p className="text-sm text-rust">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Submitting…" : "Submit dispute"}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
