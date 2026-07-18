# CreditTrust Frontend

React + Vite + Tailwind frontend for the CreditTrust credit intelligence platform — two portals, one app: a **Wholesaler Ledger** for distributors and a **Retailer Portal** for pharmacies.

⚠️ **This frontend covers Phases 0–5 only.** The backend (see the `credittrust` project) has a further Phase 6 — global retailer search, invoice edit/void with audit trail, and advanced filtering — that this frontend does NOT have a UI for yet. Those backend endpoints exist and are tested, but there's nothing in this app to call them. See the backend README's "Immediate next step" section for the build plan.

This was built and visually tested end-to-end against the CreditTrust FastAPI backend (see the `credittrust` project) — registration, OTP, invoices, payments, disputes, and notifications all confirmed working in a real browser (Chromium via Playwright), not just compiled.

## Design direction

Since this is an operational trust ledger (not a marketing site), the visual language leans into that: a warm "ledger paper" background with faint ruled lines, a serif display face (Fraunces) for headings alongside Inter for UI text and IBM Plex Mono for numbers/GST/invoice IDs, and a signature **ink-stamp badge** (`StampBadge` component) for credit scores and risk — evoking the rubber stamps used on physical ledgers and bills in the Indian pharma trade.

## Running it locally

```bash
npm install
npm run dev
```

**If you previously ran `npm install` and hit an error like `Cannot find native binding` or `Vite requires Node.js version 20.19+ or 22.12+`**: that was caused by the project initially pinning to Vite 8, which bundles an experimental Rolldown-based bundler requiring platform-specific native binaries — these don't always install correctly (a known npm optional-dependency bug) and also bump the minimum Node version. This has been fixed by pinning to stable Vite 5 instead, which works on Node 18+ with no native binary dependency. If you have a stale install from before this fix:

```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

By default it points at `http://localhost:8000` (the FastAPI backend). To change this, edit `.env`:

```
VITE_API_BASE_URL=http://localhost:8000
```

**Start the backend first** (see the `credittrust` project's README), then run this frontend — you need both running to test anything.

## What's built

**Landing** (`/`) — choose Wholesaler Ledger or Retailer Portal.

**Wholesaler app** (`/app/*`, sidebar layout):
- Dashboard — outstanding, overdue, collection rate, recent activity with retailer name on every payment
- Retailers — list, search, tier filter (Excellent/Strained/Risk), add (duplicate-GST detection), profile with full RCS breakdown, credit limit setting
- Invoices — create with flexible credit terms (standard Net-X, custom due date, or split installments), expandable rows for payment history and inline payment recording (installment-aware, bounced-payment logging), issue credit notes for returns
- **Bulk Settlement** (`/app/settle`) — settle multiple invoices with one payment; auto-caps the default allocation to what's actually payable for split invoices
- **Returns** — history of credit notes issued
- Disputes — see disputes retailers have raised, resolve or reject them
- Reports — download Outstanding / Overdue / Collection as `.xlsx`
- Profile — view/edit business details
- Notification bell — polls for new notifications (e.g. a new dispute), unread badge, mark-as-read

**Retailer portal** (`/retailer-app/*`, sidebar layout):
- Registration auto-links to an existing retailer record if a wholesaler already billed them (matched by GST/Drug License) — surfaced clearly in the UI during OTP step
- Dashboard — their own RCS score/tier stamp, total outstanding, wholesalers reporting, open disputes
- My Bills — every invoice issued to them across **all** wholesalers, installment schedules shown inline, with a "This looks wrong →" action on any bill
- Dispute modal — flag a bill as unpaid-but-marked, wrong amount, never received, or other; submits immediately and excludes that invoice from their credit score
- **Returns** — credit notes issued against them
- My Disputes — history and resolution notes
- Notification bell — same pattern, notified when a wholesaler resolves their dispute

## Project structure

```
src/
  lib/api.js              # fetch wrapper, token storage, error handling
  context/AuthContext.jsx # session state for both actor types (business/retailer)
  components/
    AppShell.jsx           # wholesaler sidebar layout
    RetailerShell.jsx       # retailer sidebar layout
    NotificationBell.jsx    # shared, parameterized by endpoint
    StampBadge.jsx          # signature credit-score/risk stamp
    StatCard.jsx
    ProtectedRoute.jsx
  pages/
    PortalSelect.jsx
    business/    # Login, Register, Dashboard, Retailers, RetailerProfile, Invoices, Disputes, Reports
    retailer/    # Login, Register, Dashboard, Invoices, Disputes
```

## Notes / next steps

- Auth tokens are stored in `localStorage` (this is a standalone app, not a Claude artifact, so that's safe here — just don't reuse this pattern inside a Claude-artifact context, where `localStorage` isn't available).
- The notification bell polls every 15s; a production build would likely swap this for WebSockets or SSE.
- No build step is required to test — `npm run dev` is enough — but `npm run build` has been verified to produce a clean production bundle.
