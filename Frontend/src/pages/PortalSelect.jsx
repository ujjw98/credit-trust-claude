import { Link } from "react-router-dom";

export default function PortalSelect() {
  return (
    <div className="ledger-bg flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="mb-12 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-dark">Credit Intelligence Platform</p>
        <h1 className="mt-3 font-display text-5xl font-medium tracking-tight text-ink">CreditTrust</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink-soft">
          A shared payment-history ledger for medicine wholesalers and the retailers they supply on credit —
          verified from both sides.
        </p>
      </div>

      <div className="grid w-full max-w-3xl gap-6 sm:grid-cols-2">
        <PortalCard
          eyebrow="For distributors"
          title="Wholesaler Ledger"
          description="Record credit sales, track outstanding balances, and check a retailer's payment history before extending credit."
          to="/login"
          cta="Enter wholesaler ledger"
        />
        <PortalCard
          eyebrow="For pharmacies"
          title="Retailer Portal"
          description="See every bill issued to you across all your wholesalers, and flag any bill that's wrong or any payment that isn't marked cleared."
          to="/retailer-login"
          cta="Enter retailer portal"
        />
      </div>
    </div>
  );
}

function PortalCard({ eyebrow, title, description, to, cta }) {
  return (
    <div className="card flex flex-col p-7">
      <p className="font-mono text-[11px] uppercase tracking-widest text-gold-dark">{eyebrow}</p>
      <h2 className="mt-2 font-display text-2xl font-medium text-ink">{title}</h2>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-soft">{description}</p>
      <Link to={to} className="btn-primary mt-6">
        {cta}
      </Link>
    </div>
  );
}
