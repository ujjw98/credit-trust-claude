import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

const STATES = [
  "Rajasthan", "Gujarat", "Maharashtra", "Delhi", "Uttar Pradesh", "Madhya Pradesh",
  "Punjab", "Haryana", "West Bengal", "Karnataka", "Tamil Nadu", "Telangana", "Other",
];

export default function Register() {
  const [step, setStep] = useState("form"); // 'form' | 'otp'
  const [form, setForm] = useState({
    business_name: "",
    gst_number: "",
    drug_license_number: "",
    owner_name: "",
    mobile: "",
    email: "",
    address_line: "",
    city: "",
    state: "Rajasthan",
    pincode: "",
    password: "",
  });
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/auth/register", form, { auth: false });
      setStep("otp");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/auth/verify-otp", { mobile: form.mobile, otp_code: otp }, { auth: false });
      const { access_token } = await api.post(
        "/auth/login",
        { mobile: form.mobile, password: form.password },
        { auth: false }
      );
      await login("business", access_token);
      navigate("/app");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ledger-bg flex min-h-screen items-center justify-center px-6 py-16">
      <div className="card w-full max-w-lg p-8">
        <p className="font-mono text-[11px] uppercase tracking-widest text-gold-dark">Wholesaler Ledger</p>
        <h1 className="mt-2 font-display text-2xl font-medium text-ink">
          {step === "form" ? "Register your business" : "Verify your mobile"}
        </h1>

        {step === "form" ? (
          <form onSubmit={handleRegister} className="mt-6 space-y-4">
            <div>
              <label className="label">Business name</label>
              <input className="input" value={form.business_name} onChange={update("business_name")} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">GST number</label>
                <input className="input font-mono" value={form.gst_number} onChange={update("gst_number")} required />
              </div>
              <div>
                <label className="label">Drug license no.</label>
                <input
                  className="input font-mono"
                  value={form.drug_license_number}
                  onChange={update("drug_license_number")}
                  required
                />
              </div>
            </div>
            <div>
              <label className="label">Owner name</label>
              <input className="input" value={form.owner_name} onChange={update("owner_name")} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Mobile number</label>
                <input className="input" value={form.mobile} onChange={update("mobile")} required />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" value={form.email} onChange={update("email")} required />
              </div>
            </div>

            <div className="border-t border-line pt-4">
              <p className="label mb-3">Business address</p>
              <div className="space-y-3">
                <input
                  className="input"
                  placeholder="Address line (shop no., market, street)"
                  value={form.address_line}
                  onChange={update("address_line")}
                  required
                />
                <div className="grid grid-cols-3 gap-3">
                  <input className="input" placeholder="City" value={form.city} onChange={update("city")} required />
                  <select className="input" value={form.state} onChange={update("state")} required>
                    {STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input font-mono"
                    placeholder="Pincode"
                    value={form.pincode}
                    onChange={update("pincode")}
                    required
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                value={form.password}
                onChange={update("password")}
                required
                minLength={8}
              />
            </div>
            {error && <p className="text-sm text-rust">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? "Registering…" : "Register business"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="mt-6 space-y-4">
            <p className="text-sm text-ink-soft">
              We've sent a 6-digit code to <span className="font-mono text-ink">{form.mobile}</span>. In this MVP,
              the code is printed to the backend server console/log instead of sent via SMS.
            </p>
            <div>
              <label className="label">OTP code</label>
              <input
                className="input font-mono text-lg tracking-[0.3em]"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={6}
                required
              />
            </div>
            {error && <p className="text-sm text-rust">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? "Verifying…" : "Verify & sign in"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-ink-soft">
          Already registered?{" "}
          <Link to="/login" className="font-medium text-gold-dark hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
