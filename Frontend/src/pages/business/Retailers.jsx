import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";

const STATES = [
  "Rajasthan", "Gujarat", "Maharashtra", "Delhi", "Uttar Pradesh", "Madhya Pradesh",
  "Punjab", "Haryana", "West Bengal", "Karnataka", "Tamil Nadu", "Telangana", "Other",
];

const TIERS = [
  { value: "", label: "All" },
  { value: "excellent", label: "Excellent" },
  { value: "strained", label: "Strained" },
  { value: "risk", label: "Risk" },
];

const TIER_CHIP = {
  excellent: "bg-risk-low/10 text-risk-low",
  strained: "bg-gold/10 text-gold-dark",
  risk: "bg-rust/10 text-rust",
};

const emptyForm = {
  name: "",
  gstin: "",
  drug_license: "",
  owner_name: "",
  mobile: "",
  address_line: "",
  city: "",
  state: "Rajasthan",
  pincode: "",
};

export default function Retailers() {
  const [retailers, setRetailers] = useState([]);
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // --- Phase 6: platform-wide global search (separate from "my retailers" search above) ---
  const [globalQuery, setGlobalQuery] = useState("");
  const [globalResults, setGlobalResults] = useState([]);
  const [globalSearching, setGlobalSearching] = useState(false);
  const [globalError, setGlobalError] = useState("");

  const load = async (q, t) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (t) params.set("tier", t);
    const qs = params.toString();
    const data = await api.get(`/retailers${qs ? `?${qs}` : ""}`);
    setRetailers(data);
  };

  useEffect(() => {
    load(query, tier);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier]);

  // Debounced platform-wide search — browsing these results does NOT create a
  // relationship; only opening the full profile does (matches backend semantics).
  useEffect(() => {
    const q = globalQuery.trim();
    if (q.length < 2) {
      setGlobalResults([]);
      setGlobalError("");
      return;
    }
    setGlobalSearching(true);
    setGlobalError("");
    const handle = setTimeout(() => {
      api
        .get(`/retailers/search?q=${encodeURIComponent(q)}`)
        .then(setGlobalResults)
        .catch((err) => {
          setGlobalResults([]);
          setGlobalError(err instanceof ApiError ? err.message : "Search failed.");
        })
        .finally(() => setGlobalSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [globalQuery]);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSearch = (e) => {
    e.preventDefault();
    load(query, tier);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ""));
      const added = await api.post("/retailers", payload);
      setForm(emptyForm);
      setShowForm(false);
      setNotice(`${added.name} added to your retailer book.`);
      load(query, tier);
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
          <h1 className="font-display text-3xl font-medium text-ink">Retailers</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Pharmacies you have an active relationship with — added, viewed, or billed by you.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "+ Add retailer"}
        </button>
      </div>

      {notice && <p className="mt-4 text-sm text-risk-low">{notice}</p>}

      {showForm && (
        <form onSubmit={handleAdd} className="card mt-5 space-y-4 p-6">
          <p className="text-xs text-ink-soft">
            If this retailer already exists on the platform (same GSTIN or drug license), you'll be linked to their
            real payment history instead of creating a duplicate.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Retailer name</label>
              <input className="input" value={form.name} onChange={update("name")} required />
            </div>
            <div>
              <label className="label">Owner name</label>
              <input className="input" value={form.owner_name} onChange={update("owner_name")} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">GSTIN</label>
              <input className="input font-mono" value={form.gstin} onChange={update("gstin")} />
            </div>
            <div>
              <label className="label">Drug license</label>
              <input className="input font-mono" value={form.drug_license} onChange={update("drug_license")} />
            </div>
            <div>
              <label className="label">Mobile</label>
              <input className="input" value={form.mobile} onChange={update("mobile")} />
            </div>
          </div>
          <div>
            <label className="label">Address line</label>
            <input className="input" value={form.address_line} onChange={update("address_line")} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <input className="input" placeholder="City" value={form.city} onChange={update("city")} />
            <select className="input" value={form.state} onChange={update("state")}>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input className="input font-mono" placeholder="Pincode" value={form.pincode} onChange={update("pincode")} />
          </div>
          {error && <p className="text-sm text-rust">{error}</p>}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save retailer"}
          </button>
        </form>
      )}

      {/* --- Phase 6: platform-wide search --- */}
      <div className="card mt-6 p-5">
        <p className="label">Find any retailer on the platform</p>
        <p className="mt-1 text-xs text-ink-soft">
          Searches every registered retailer by Firm Name, Owner Name, or GSTIN — not just retailers already in your
          book. Just browsing a result here doesn't add them; opening their profile does.
        </p>
        <input
          className="input mt-3 max-w-md"
          placeholder="Search platform-wide (min 2 characters)…"
          value={globalQuery}
          onChange={(e) => setGlobalQuery(e.target.value)}
        />

        {globalSearching && <p className="mt-3 text-xs text-ink-soft">Searching…</p>}
        {globalError && <p className="mt-3 text-xs text-rust">{globalError}</p>}

        {globalQuery.trim().length >= 2 && !globalSearching && globalResults.length === 0 && !globalError && (
          <p className="mt-3 text-xs text-ink-soft">No matching retailer found on the platform.</p>
        )}

        {globalResults.length > 0 && (
          <div className="mt-4 divide-y divide-line rounded-md border border-line">
            {globalResults.map((r) => (
              <Link
                key={r.id}
                to={`/app/retailers/${r.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-paper"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{r.name}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {r.owner_name ? `Owner: ${r.owner_name}` : "Owner: —"}
                    {" | "}
                    GSTIN: <span className="font-mono">{r.gstin || "—"}</span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {r.rcs_score ? (
                    <span className={`rounded-full px-2.5 py-1 font-mono text-xs font-medium ${TIER_CHIP[r.tier]}`}>
                      {r.rcs_score}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-soft">No score yet</span>
                  )}
                  <span
                    className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
                      r.is_linked ? "bg-risk-low/10 text-risk-low" : "bg-ink/5 text-ink-soft"
                    }`}
                  >
                    {r.is_linked ? "In your book" : "Not yet in your book — view profile to add"}
                  </span>
                  <span className="text-xs font-medium text-gold-dark">View profile →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            className="input max-w-xs"
            placeholder="Search my retailers by name or owner…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>

        <div className="flex gap-1.5">
          {TIERS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTier(t.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                tier === t.value ? "bg-ink text-white" : "bg-paper-card text-ink-soft border border-line hover:bg-paper"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card mt-4 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">GSTIN</th>
              <th className="px-4 py-3 font-medium">City</th>
              <th className="px-4 py-3 font-medium">Credit limit</th>
              <th className="px-4 py-3 font-medium">RCS</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {retailers.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 hover:bg-paper">
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">{r.name}</p>
                  <p className="text-xs text-ink-soft">{r.owner_name ? `Owner: ${r.owner_name}` : ""}</p>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink-soft">{r.gstin || "—"}</td>
                <td className="px-4 py-3 text-ink-soft">{r.city || "—"}</td>
                <td className="px-4 py-3 font-mono text-ink-soft">
                  {r.credit_limit ? `₹${Number(r.credit_limit).toLocaleString("en-IN")}` : "Not set"}
                </td>
                <td className="px-4 py-3">
                  {r.rcs_score ? (
                    <span className={`rounded-full px-2.5 py-1 font-mono text-xs font-medium ${TIER_CHIP[r.tier]}`}>
                      {r.rcs_score}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-soft">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/app/retailers/${r.id}`} className="text-xs font-medium text-gold-dark hover:underline">
                    View profile →
                  </Link>
                </td>
              </tr>
            ))}
            {retailers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-soft">
                  No retailers here yet. Add one above, use platform-wide search, or their profile will appear once
                  you look them up or bill them.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
