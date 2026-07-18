import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const REASON_LABEL = {
  wrong_bill: "I never received this bill",
  payment_not_marked: "Payment not marked cleared",
  wrong_amount: "Wrong amount",
  other: "Other",
};

const STATUS_STYLE = {
  open: "bg-rust/10 text-rust",
  resolved: "bg-risk-low/10 text-risk-low",
  rejected: "bg-ink-soft/10 text-ink-soft",
};

const STATUS_NOTE = {
  open: "Waiting on the wholesaler to review.",
  resolved: "The wholesaler confirmed and fixed the record.",
  rejected: "The wholesaler reviewed and the original bill stands.",
};

export default function RetailerDisputes() {
  const [disputes, setDisputes] = useState([]);

  useEffect(() => {
    api.get("/retailer-portal/disputes").then(setDisputes);
  }, []);

  return (
    <div>
      <h1 className="font-display text-3xl font-medium text-ink">My disputes</h1>
      <p className="mt-1 text-sm text-ink-soft">Bills you've flagged, and how each one was resolved.</p>

      <div className="mt-6 space-y-3">
        {disputes.map((d) => (
          <div key={d.id} className="card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">{REASON_LABEL[d.reason] || d.reason}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLE[d.status]}`}>
                {d.status}
              </span>
            </div>
            {d.description && <p className="mt-2 text-sm text-ink-soft">{d.description}</p>}
            <p className="mt-2 text-xs text-ink-soft">{STATUS_NOTE[d.status]}</p>
            {d.resolution_note && (
              <p className="mt-1 rounded-md bg-paper px-3 py-2 text-xs text-ink">"{d.resolution_note}"</p>
            )}
          </div>
        ))}
        {disputes.length === 0 && (
          <p className="text-sm text-ink-soft">You haven't raised any disputes.</p>
        )}
      </div>
    </div>
  );
}
