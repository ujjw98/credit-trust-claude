import { useState } from "react";
import { BASE_URL } from "../../lib/api";

const REPORTS = [
  { key: "outstanding", label: "Outstanding Report", desc: "All invoices with a balance still owed." },
  { key: "overdue", label: "Overdue Report", desc: "Invoices past their due date." },
  { key: "collection", label: "Collection Report", desc: "Every payment received, with delay days." },
];

export default function Reports() {
  const [downloading, setDownloading] = useState(null);

  const download = async (key) => {
    setDownloading(key);
    try {
      const token = localStorage.getItem("credittrust_token");
      const res = await fetch(`${BASE_URL}/reports/${key}.xlsx`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${key}_report.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div>
      <h1 className="font-display text-3xl font-medium text-ink">Reports</h1>
      <p className="mt-1 text-sm text-ink-soft">Export your ledger data as Excel.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {REPORTS.map((r) => (
          <div key={r.key} className="card flex flex-col p-6">
            <p className="font-display text-lg font-medium text-ink">{r.label}</p>
            <p className="mt-2 flex-1 text-sm text-ink-soft">{r.desc}</p>
            <button className="btn-secondary mt-5" onClick={() => download(r.key)} disabled={downloading === r.key}>
              {downloading === r.key ? "Preparing…" : "Download .xlsx"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
