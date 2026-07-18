import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

const STATES = [
  "Rajasthan", "Gujarat", "Maharashtra", "Delhi", "Uttar Pradesh", "Madhya Pradesh",
  "Punjab", "Haryana", "West Bengal", "Karnataka", "Tamil Nadu", "Telangana", "Other",
];

export default function Profile() {
  const { profile: user } = useAuth();
  const [business, setBusiness] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.get("/auth/business-profile").then((b) => {
      setBusiness(b);
      setForm(b);
    });

  useEffect(() => {
    load();
  }, []);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const { name, owner_name, email, address_line, city, state, pincode } = form;
      const updated = await api.put("/auth/business-profile", {
        name, owner_name, email, address_line, city, state, pincode,
      });
      setBusiness(updated);
      setForm(updated);
      setEditing(false);
      setNotice("Profile updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (!business) return <p className="font-mono text-sm text-ink-soft">Loading…</p>;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium text-ink">Business Profile</h1>
          <p className="mt-1 text-sm text-ink-soft">Your wholesaler account details.</p>
        </div>
        {!editing && (
          <button className="btn-secondary" onClick={() => setEditing(true)}>
            Edit profile
          </button>
        )}
      </div>

      {notice && <p className="mt-4 text-sm text-risk-low">{notice}</p>}

      {!editing ? (
        <div className="card mt-5 p-6">
          <div className="grid grid-cols-2 gap-5">
            <Field label="Business name" value={business.name} />
            <Field label="Owner name" value={business.owner_name} />
            <Field label="GST number" value={business.gst_number} mono />
            <Field label="Drug license" value={business.drug_license_number} mono />
            <Field label="Mobile" value={business.mobile} mono />
            <Field label="Email" value={business.email} />
            <Field
              label="Address"
              value={[business.address_line, business.city, business.state, business.pincode]
                .filter(Boolean)
                .join(", ")}
              span
            />
            <Field label="Verified" value={business.is_verified ? "Yes" : "No"} />
            <Field label="Signed in as" value={`${user?.name} (${user?.role})`} />
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="card mt-5 space-y-4 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Business name</label>
              <input className="input" value={form.name || ""} onChange={update("name")} required />
            </div>
            <div>
              <label className="label">Owner name</label>
              <input className="input" value={form.owner_name || ""} onChange={update("owner_name")} required />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={form.email || ""} onChange={update("email")} required />
          </div>
          <div>
            <label className="label">Address line</label>
            <input className="input" value={form.address_line || ""} onChange={update("address_line")} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <input className="input" placeholder="City" value={form.city || ""} onChange={update("city")} />
            <select className="input" value={form.state || ""} onChange={update("state")}>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input className="input font-mono" placeholder="Pincode" value={form.pincode || ""} onChange={update("pincode")} />
          </div>
          <p className="text-xs text-ink-soft">GST number, drug license, and mobile number can't be changed here — contact support if these need correction.</p>
          {error && <p className="text-sm text-rust">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setForm(business);
                setEditing(false);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({ label, value, mono, span }) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <p className="label">{label}</p>
      <p className={`text-sm text-ink ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
    </div>
  );
}
