import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const money = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

const REASON_LABEL = {
  expired_stock: "Expired stock",
  damaged_goods: "Damaged goods",
  wrong_item: "Wrong item shipped",
  other: "Other",
};

export default function RetailerReturns() {
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    api.get("/retailer-portal/credit-notes").then(setNotes);
  }, []);

  return (
    <div>
      <h1 className="font-display text-3xl font-medium text-ink">Returns</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Credit notes wholesalers have issued you for returns — each one already deducted from the matching bill.
      </p>

      <div className="mt-6 space-y-3">
        {notes.map((n) => (
          <div key={n.id} className="card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">{n.invoice_number}</span>
              <span className="font-mono text-ink">{money(n.amount)}</span>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              {REASON_LABEL[n.reason] || n.reason} · {new Date(n.created_at).toLocaleDateString("en-IN")}
            </p>
            {n.note && <p className="mt-2 rounded-md bg-paper px-3 py-2 text-xs text-ink">{n.note}</p>}
          </div>
        ))}
        {notes.length === 0 && <p className="text-sm text-ink-soft">No credit notes on record yet.</p>}
      </div>
    </div>
  );
}
