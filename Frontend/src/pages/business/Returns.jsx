import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const money = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

const REASON_LABEL = {
  expired_stock: "Expired stock",
  damaged_goods: "Damaged goods",
  wrong_item: "Wrong item shipped",
  other: "Other",
};

export default function Returns() {
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    api.get("/credit-notes").then(setNotes);
  }, []);

  return (
    <div>
      <h1 className="font-display text-3xl font-medium text-ink">Returns</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Credit notes you've issued against returned or written-off stock. Each one deducted directly from the
        invoice's outstanding balance.
      </p>

      <div className="card mt-6 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium">Retailer</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Note</th>
              <th className="px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((n) => (
              <tr key={n.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-ink">{n.invoice_number}</td>
                <td className="px-4 py-3 text-ink">{n.retailer_name}</td>
                <td className="px-4 py-3 font-mono text-ink">{money(n.amount)}</td>
                <td className="px-4 py-3 text-ink-soft">{REASON_LABEL[n.reason] || n.reason}</td>
                <td className="px-4 py-3 text-xs text-ink-soft">{n.note || "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink-soft">
                  {new Date(n.created_at).toLocaleDateString("en-IN")}
                </td>
              </tr>
            ))}
            {notes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-soft">
                  No credit notes issued yet. You can issue one from an invoice's detail view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
