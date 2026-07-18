import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

const TYPE_LABEL = {
  dispute_raised: "Dispute raised",
  dispute_resolved: "Dispute resolved",
  dispute_rejected: "Dispute rejected",
  invoice_due: "Invoice due",
  invoice_overdue: "Invoice overdue",
  payment_received: "Payment received",
};

export default function NotificationBell({ listPath, readPath }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState({ unread_count: 0, notifications: [] });
  const ref = useRef(null);

  const load = async () => {
    try {
      const data = await api.get(listPath);
      setSummary(data);
    } catch {
      // silent — notifications are non-critical to core flows
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const markRead = async (id) => {
    try {
      await api.put(readPath(id));
      load();
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2 text-paper-card/90 hover:bg-white/10"
        aria-label="Notifications"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {summary.unread_count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rust px-1 text-[10px] font-semibold text-white">
            {summary.unread_count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-line bg-paper-card shadow-lg">
          <div className="border-b border-line px-4 py-2.5">
            <p className="text-sm font-medium text-ink">Notifications</p>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {summary.notifications.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-ink-soft">Nothing here yet.</p>
            )}
            {summary.notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className={`block w-full border-b border-line px-4 py-3 text-left last:border-0 hover:bg-paper ${
                  n.is_read ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-gold-dark">
                    {TYPE_LABEL[n.type] || n.type}
                  </span>
                  {!n.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rust" />}
                </div>
                <p className="mt-1 text-sm font-medium text-ink">{n.title}</p>
                <p className="mt-0.5 text-xs text-ink-soft">{n.message}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
