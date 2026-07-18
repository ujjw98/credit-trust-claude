import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";

const money = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

const STATUS_STYLE = {
  paid: "bg-risk-low/10 text-risk-low",
  outstanding: "bg-gold/10 text-gold-dark",
  partial: "bg-gold/10 text-gold-dark",
  overdue: "bg-rust/10 text-rust",
};

const CREDIT_NOTE_REASONS = [
  { value: "expired_stock", label: "Expired stock" },
  { value: "damaged_goods", label: "Damaged goods" },
  { value: "wrong_item", label: "Wrong item shipped" },
  { value: "other", label: "Other" },
];

const emptyInstallment = () => ({ due_date: "", amount: "" });

export default function Invoices() {
  const [searchParams] = useSearchParams();
  const preselectedRetailer = searchParams.get("retailer") || "";

  const [retailers, setRetailers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [showForm, setShowForm] = useState(Boolean(preselectedRetailer));
  const [termMode, setTermMode] = useState("standard"); // 'standard' | 'custom_date' | 'installments'
  const [form, setForm] = useState({
    retailer_id: preselectedRetailer,
    invoice_number: "",
    invoice_date: new Date().toISOString().slice(0, 10),
    amount: "",
    credit_days: 30,
    due_date_override: "",
    remarks: "",
  });
  const [installments, setInstallments] = useState([emptyInstallment(), emptyInstallment()]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const retailerName = (rid) => retailers.find((r) => r.id === rid)?.name || "—";

  const loadInvoices = () => api.get("/invoices").then(setInvoices);

  useEffect(() => {
    api.get("/retailers").then(setRetailers);
    loadInvoices();
  }, []);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const installmentTotal = installments.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const amountMismatch = termMode === "installments" && Number(form.amount) > 0 && installmentTotal !== Number(form.amount);

  const updateInstallment = (idx, field) => (e) => {
    const next = [...installments];
    next[idx] = { ...next[idx], [field]: e.target.value };
    setInstallments(next);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = {
        retailer_id: form.retailer_id,
        invoice_number: form.invoice_number,
        invoice_date: form.invoice_date,
        amount: Number(form.amount),
        credit_days: Number(form.credit_days),
        remarks: form.remarks || undefined,
      };
      if (termMode === "custom_date") {
        payload.due_date_override = form.due_date_override;
      }
      if (termMode === "installments") {
        payload.installments = installments
          .filter((i) => i.due_date && i.amount)
          .map((i) => ({ due_date: i.due_date, amount: Number(i.amount) }));
      }
      await api.post("/invoices", payload);
      setForm((f) => ({ ...f, invoice_number: "", amount: "", due_date_override: "", remarks: "" }));
      setInstallments([emptyInstallment(), emptyInstallment()]);
      setTermMode("standard");
      setShowForm(false);
      loadInvoices();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium text-ink">Invoices</h1>
          <p className="mt-1 text-sm text-ink-soft">Credit sales issued to your retailers.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/app/settle" className="btn-secondary">
            Bulk settle
          </Link>
          <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "+ Create credit sale"}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card mt-5 space-y-4 p-6">
          <div>
            <label className="label">Retailer</label>
            <select className="input" value={form.retailer_id} onChange={update("retailer_id")} required>
              <option value="" disabled>
                Select a retailer…
              </option>
              {retailers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Invoice number</label>
              <input className="input font-mono" value={form.invoice_number} onChange={update("invoice_number")} required />
            </div>
            <div>
              <label className="label">Invoice date</label>
              <input type="date" className="input" value={form.invoice_date} onChange={update("invoice_date")} required />
            </div>
            <div>
              <label className="label">Amount (₹)</label>
              <input type="number" step="0.01" className="input" value={form.amount} onChange={update("amount")} required />
            </div>
          </div>

          <div className="border-t border-line pt-4">
            <p className="label mb-2">Credit terms</p>
            <div className="flex gap-1.5">
              {[
                { value: "standard", label: "Standard (Net-X days)" },
                { value: "custom_date", label: "Custom due date" },
                { value: "installments", label: "Split into installments" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTermMode(opt.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    termMode === opt.value ? "bg-ink text-white" : "bg-paper-card text-ink-soft border border-line hover:bg-paper"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {termMode === "standard" && (
              <div className="mt-3 max-w-[200px]">
                <label className="label">Credit days</label>
                <input type="number" className="input" value={form.credit_days} onChange={update("credit_days")} required />
              </div>
            )}

            {termMode === "custom_date" && (
              <div className="mt-3 max-w-[200px]">
                <label className="label">Due date</label>
                <input
                  type="date"
                  className="input"
                  value={form.due_date_override}
                  onChange={update("due_date_override")}
                  required
                />
                <p className="mt-1 text-xs text-ink-soft">e.g. all January invoices due by a fixed May date.</p>
              </div>
            )}

            {termMode === "installments" && (
              <div className="mt-3 space-y-2">
                {installments.map((inst, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-6 text-xs text-ink-soft">#{idx + 1}</span>
                    <input
                      type="date"
                      className="input"
                      value={inst.due_date}
                      onChange={updateInstallment(idx, "due_date")}
                      required
                    />
                    <input
                      type="number"
                      step="0.01"
                      className="input"
                      placeholder="Amount"
                      value={inst.amount}
                      onChange={updateInstallment(idx, "amount")}
                      required
                    />
                    {installments.length > 2 && (
                      <button
                        type="button"
                        className="text-xs text-rust"
                        onClick={() => setInstallments(installments.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="text-xs font-medium text-gold-dark hover:underline"
                  onClick={() => setInstallments([...installments, emptyInstallment()])}
                >
                  + Add installment
                </button>
                <p className={`text-xs ${amountMismatch ? "text-rust" : "text-ink-soft"}`}>
                  Installments total: {money(installmentTotal)}
                  {form.amount ? ` / ${money(form.amount)}` : ""}
                  {amountMismatch ? " — must match the invoice amount" : ""}
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="label">Remarks (optional)</label>
            <input className="input" value={form.remarks} onChange={update("remarks")} />
          </div>
          {error && <p className="text-sm text-rust">{error}</p>}
          <button type="submit" className="btn-primary" disabled={busy || amountMismatch}>
            {busy ? "Saving…" : "Create invoice"}
          </button>
        </form>
      )}

      <div className="card mt-6 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium">Retailer</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Outstanding</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <InvoiceRow
                key={inv.id}
                inv={inv}
                retailerName={retailerName(inv.retailer_id)}
                expanded={expanded === inv.id}
                onToggle={() => setExpanded(expanded === inv.id ? null : inv.id)}
                onChanged={loadInvoices}
              />
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-soft">
                  No invoices yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InvoiceRow({ inv, retailerName, expanded, onToggle, onChanged }) {
  const [payments, setPayments] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payRef, setPayRef] = useState("");
  const [payBounced, setPayBounced] = useState(false);
  const [payInstallmentId, setPayInstallmentId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [showCreditNote, setShowCreditNote] = useState(false);
  const [cnAmount, setCnAmount] = useState("");
  const [cnReason, setCnReason] = useState(CREDIT_NOTE_REASONS[0].value);
  const [cnNote, setCnNote] = useState("");
  const [cnError, setCnError] = useState("");
  const [cnBusy, setCnBusy] = useState(false);

  const hasInstallments = inv.installments && inv.installments.length > 0;

  useEffect(() => {
    if (expanded) {
      api.get(`/payments/invoice/${inv.id}`).then(setPayments);
      const nextInstallment = hasInstallments
        ? inv.installments.find((i) => i.status !== "paid")
        : null;
      setPayAmount(
        nextInstallment
          ? String(nextInstallment.amount - nextInstallment.paid_amount)
          : inv.outstanding_amount > 0
          ? String(inv.outstanding_amount)
          : ""
      );
      setPayInstallmentId(nextInstallment ? nextInstallment.id : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, inv.id, inv.outstanding_amount]);

  const handlePay = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/payments", {
        invoice_id: inv.id,
        amount: Number(payAmount),
        payment_date: payDate,
        reference_number: payRef || undefined,
        bounced: payBounced,
        installment_id: hasInstallments ? payInstallmentId || undefined : undefined,
      });
      setPayRef("");
      setPayBounced(false);
      onChanged();
      api.get(`/payments/invoice/${inv.id}`).then(setPayments);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const handleCreditNote = async (e) => {
    e.preventDefault();
    setCnError("");
    setCnBusy(true);
    try {
      await api.post("/credit-notes", {
        invoice_id: inv.id,
        amount: Number(cnAmount),
        reason: cnReason,
        note: cnNote || undefined,
      });
      setCnAmount("");
      setCnNote("");
      setShowCreditNote(false);
      onChanged();
    } catch (err) {
      setCnError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setCnBusy(false);
    }
  };

  return (
    <>
      <tr className="cursor-pointer border-b border-line hover:bg-paper" onClick={onToggle}>
        <td className="px-4 py-3 font-mono text-xs text-ink">
          {inv.invoice_number}
          {hasInstallments && (
            <span className="ml-1.5 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-sans font-medium text-gold-dark">
              Split
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-ink">{retailerName}</td>
        <td className="px-4 py-3 font-mono text-ink">{money(inv.amount)}</td>
        <td className="px-4 py-3 font-mono text-ink">{money(inv.outstanding_amount)}</td>
        <td className="px-4 py-3">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLE[inv.status]}`}>
            {inv.status}
          </span>
        </td>
        <td className="px-4 py-3 text-right text-xs text-ink-soft">{expanded ? "Hide ▲" : "Details ▼"}</td>
      </tr>
      {expanded && (
        <tr className="border-b border-line bg-paper">
          <td colSpan={6} className="px-4 py-4">
            {hasInstallments && (
              <div className="mb-4">
                <p className="label mb-2">Installment schedule</p>
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
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="label mb-2">Payment history</p>
                {!payments ? (
                  <p className="text-xs text-ink-soft">Loading…</p>
                ) : payments.length === 0 ? (
                  <p className="text-xs text-ink-soft">No payments recorded yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {payments.map((p) => (
                      <li key={p.id} className="flex justify-between text-xs">
                        <span className="font-mono text-ink">{money(p.amount)}</span>
                        <span className="text-ink-soft">{p.payment_date}</span>
                        {p.settlement_id && (
                          <span className="rounded-full bg-ink/5 px-2 py-0.5 font-medium text-ink-soft">
                            Bulk settlement
                          </span>
                        )}
                        {p.bounced ? (
                          <span className="rounded-full bg-rust/10 px-2 py-0.5 font-medium text-rust">Bounced</span>
                        ) : (
                          <span className={p.delay_days > 0 ? "text-rust" : "text-risk-low"}>
                            {p.delay_days > 0 ? `${p.delay_days}d late` : "on time"}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {!showCreditNote ? (
                  <button
                    className="mt-4 text-xs font-medium text-gold-dark hover:underline"
                    onClick={() => setShowCreditNote(true)}
                  >
                    + Issue credit note (returns)
                  </button>
                ) : (
                  <form onSubmit={handleCreditNote} className="mt-4 space-y-2 rounded-md border border-line p-3">
                    <p className="text-xs font-medium text-ink">Issue credit note</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        step="0.01"
                        className="input"
                        placeholder="Amount"
                        value={cnAmount}
                        onChange={(e) => setCnAmount(e.target.value)}
                        required
                      />
                      <select className="input" value={cnReason} onChange={(e) => setCnReason(e.target.value)}>
                        {CREDIT_NOTE_REASONS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      className="input"
                      placeholder="Note (optional)"
                      value={cnNote}
                      onChange={(e) => setCnNote(e.target.value)}
                    />
                    {cnError && <p className="text-xs text-rust">{cnError}</p>}
                    <div className="flex gap-2">
                      <button type="submit" className="btn-gold" disabled={cnBusy}>
                        {cnBusy ? "Issuing…" : "Issue credit note"}
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => setShowCreditNote(false)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {inv.outstanding_amount > 0 ? (
                <form onSubmit={handlePay} className="space-y-2.5">
                  <p className="label mb-2">Record a payment</p>
                  {hasInstallments && (
                    <select
                      className="input"
                      value={payInstallmentId}
                      onChange={(e) => setPayInstallmentId(e.target.value)}
                    >
                      <option value="">Auto (oldest unpaid installment)</option>
                      {inv.installments
                        .filter((i) => i.status !== "paid")
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            Installment #{i.sequence} — {money(i.amount - i.paid_amount)} remaining, due {i.due_date}
                          </option>
                        ))}
                    </select>
                  )}
                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      type="number"
                      step="0.01"
                      className="input"
                      placeholder="Amount"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      required
                    />
                    <input
                      type="date"
                      className="input"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      required
                    />
                  </div>
                  <input
                    className="input"
                    placeholder="Reference number (optional)"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                  />
                  <label className="flex items-center gap-2 text-xs text-ink-soft">
                    <input
                      type="checkbox"
                      checked={payBounced}
                      onChange={(e) => setPayBounced(e.target.checked)}
                      className="rounded border-line"
                    />
                    This payment bounced / failed (won't reduce the balance, but is logged against their score)
                  </label>
                  {error && <p className="text-xs text-rust">{error}</p>}
                  <button type="submit" className={payBounced ? "btn-secondary" : "btn-gold"} disabled={busy}>
                    {busy ? "Recording…" : payBounced ? "Log bounced payment" : "Record payment"}
                  </button>
                </form>
              ) : (
                <p className="text-sm text-risk-low">Fully paid.</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
