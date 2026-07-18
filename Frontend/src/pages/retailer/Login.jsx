import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

export default function RetailerLogin() {
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { access_token } = await api.post("/retailer-auth/login", { mobile, password }, { auth: false });
      await login("retailer", access_token);
      navigate("/retailer-app");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ledger-bg flex min-h-screen items-center justify-center px-6 py-16">
      <div className="card w-full max-w-sm p-8">
        <p className="font-mono text-[11px] uppercase tracking-widest text-gold-dark">Retailer Portal</p>
        <h1 className="mt-2 font-display text-2xl font-medium text-ink">Sign in</h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label">Mobile number</label>
            <input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-rust">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-soft">
          New here?{" "}
          <Link to="/retailer-register" className="font-medium text-gold-dark hover:underline">
            Register your pharmacy
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-ink-soft">
          <Link to="/" className="hover:underline">
            ← Back to portal select
          </Link>
        </p>
      </div>
    </div>
  );
}
