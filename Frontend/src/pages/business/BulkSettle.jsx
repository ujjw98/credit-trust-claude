import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";

const money = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

export default function BulkSettle() {
  const [retailers, setRetailers] = useState([]);
  const [retailerId, setRetailerId] = useState("");
  const [invoices, setInvoices] = useState([]);
  const [allocations, setAllocations] = useState({}); // invoice_id -> amount string
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/retailers").then(setRetailers);
  }, []);

  useEffect(() => {
    setAllocations({});
    setResult(null);
    if (retailerId) {
      api.get(`/invoices?retailer_id=${retailerId}`).then((all) =>
        setInvoices(all.filter((i) => i.outstanding_amount > 0))
      );
    } else {
      setInvoices([]);
    }
  }, [retailerId]);

  const maxAllocatable = (inv) => {
    if (inv.installments && inv.installments.length > 0) {
      const pending = inv.installments.filter((i) => i.status !== "paid");
      if (pending.length === 0) return inv.outstanding_amount;
      const oldest = pending.reduce((a, b) => (a.due_date < b.due_date ? a : b));
      return Math.min(inv.outstanding_amount, oldest.amount - oldest.paid_amount);
    }
    return inv.outstanding_amount;
  };

  const toggleInvoice = (inv) => {
    setAllocations((prev) => {
      const next = { ...prev };
      if (next[inv.id] !== undefined) {
        delete next[inv.id];
      } else {
        next[inv.id] = String(maxAllocatable(inv));
      }
      return next;
    });
  };

  const setAllocationAmount = (invId) => (e) => {
    setAllocations((prev) => ({ ...prev, [invId]: e.target.value }));
  };

  const total = Object.values(allocations).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const selectedCount = Object.keys(allocations).length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api.post("/payments/bulk-settle", {
        retailer_id: retailerId,
        payment_date: paymentDate,
        reference_number: reference || undefined,
        allocations: Object.entries(allocations).map(([invoice_id, amount]) => ({
          invoice_id,
          amount: Number(amount),
        })),
      });
      setResult(res);
      setAllocations({});
      api.get(`/invoices?retailer_id=${retailerId}`).then((all) =>
        setInvoices(all.filter((i) => i.outstanding_amount > 0))
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="font-display text-3xl font-medium text-ink">Bulk Settlement</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Settle several bills with one payment — pick the invoices, allocate how much of the payment covers each,
        and record it as a single cheque or bank transfer.
      </p>

      <div className="card mt-6 p-6">
        <label className="label">Retailer</label>
        <select className="input max-w-sm" value={retailerId} onChange={(e) => setRetailerId(e.target.value)}>
          <option value="">Select a retailer…</option>
          {retailers.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        {retailerId && (
          <>
            {invoices.length === 0 ? (
              <p className="mt-6 text-sm text-ink-soft">No outstanding invoices for this retailer.</p>
            ) : (
              <form onSubmit={handleSubmit} className="mt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                      <th className="py-2 font-medium"></th>
                      <th className="py-2 font-medium">Invoice</th>
                      <th className="py-2 font-medium">Due date</th>
                      <th className="py-2 font-medium">Outstanding</th>
                      <th className="py-2 font-medium">Allocate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => {
                      const checked = allocations[inv.id] !== undefined;
                      const cap = maxAllocatable(inv);
                      const isSplit = inv.installments && inv.installments.length > 0;
                      return (
                        <tr key={inv.id} className="border-b border-line last:border-0">
                          <td className="py-2.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleInvoice(inv)}
                              className="rounded border-line"
                            />
                          </td>
                          <td className="py-2.5 font-mono text-xs text-ink">
                            {inv.invoice_number}
                            {isSplit && (
                              <span className="ml-1.5 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-sans font-medium text-gold-dark">
                                Split
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 font-mono text-xs text-ink-soft">{inv.due_date}</td>
                          <td className="py-2.5 font-mono text-ink">{money(inv.outstanding_amount)}</td>
                          <td className="py-2.5">
                            <input
                              type="number"
                              step="0.01"
                              className="input w-32"
                              disabled={!checked}
                              value={allocations[inv.id] ?? ""}
                              onChange={setAllocationAmount(inv.id)}
                              max={cap}
                            />
                            {isSplit && checked && (
                              <p className="mt-1 text-[11px] text-ink-soft">Max ₹{cap.toLocaleString("en-IN")} (next installment)</p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="mt-5 grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">Payment date</label>
                    <input
                      type="date"
                      className="input"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Reference number</label>
                    <input
                      className="input"
                      placeholder="Cheque / UTR no."
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    <p className="label">Total this settlement</p>
                    <p className="font-display text-xl font-medium text-ink">{money(total)}</p>
                  </div>
                </div>

                {error && <p className="mt-3 text-sm text-rust">{error}</p>}

                <button type="submit" className="btn-primary mt-5" disabled={busy || selectedCount === 0}>
                  {busy ? "Settling…" : `Settle ${selectedCount} invoice${selectedCount === 1 ? "" : "s"}`}
                </button>
              </form>
            )}
          </>
        )}

        {result && (
          <div className="mt-6 rounded-md border border-risk-low/30 bg-risk-low/10 p-4 text-sm text-risk-low">
            Settled {money(result.total_amount)} across {result.payments.length} invoice
            {result.payments.length === 1 ? "" : "s"}.
          </div>
        )}
      </div>
    </div>
  );
}
