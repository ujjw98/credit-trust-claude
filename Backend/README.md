# CreditTrust API — Phase 1 & 2 MVP (FastAPI)

Credit Intelligence Platform for Pharmaceutical Wholesalers — Python/FastAPI backend.

## What's implemented (Phases 0-5 of the v2 roadmap, on top of the original MVP)

### Bulk Bill Settlement
`POST /payments/bulk-settle` — one payment (one cheque, one bank transfer) allocated across multiple invoices in a single call. Each allocation is validated and applied independently (installment-aware, see below), all tagged with a shared `settlement_id` so the payment history shows they came from one settlement. Rejects any single allocation that exceeds what's actually owed.

### Flexible Credit Term Configurations
Invoices are no longer limited to a fixed Net-X window:
- `due_date_override` — a single custom due date (e.g. "all January invoices due in May") instead of `invoice_date + credit_days`.
- **Installments** — split an invoice into a schedule of `{due_date, amount}` rows (e.g. "50% by Feb 10, 50% by Feb 20"). Installment amounts must sum to the invoice total. The invoice is "overdue" if *any* installment is overdue, not just the final date. Payments can target a specific installment or auto-apply to the oldest unpaid one — see `app/routers/payment_router.py::_apply_single_payment`, which both the single-payment and bulk-settlement endpoints share so the math never drifts apart.

### Returns Management (Credit Notes)
`POST /credit-notes` — issue a credit note against returned/expired/damaged stock. Deducts directly from the invoice's outstanding balance (and from the relevant installment, if the invoice has a schedule, so the two stay consistent). Feeds the **Returns Trend pillar of RCS with real data** — this replaces the "always 0%" placeholder from Phase 3. Retailers can see credit notes issued against them at `GET /retailer-portal/credit-notes`.

### A note on a bug I found and fixed while building this
Bulk settlement's naive default (auto-fill each selected invoice's *full* outstanding balance) broke for invoices with an installment schedule, since a single payment can only satisfy the current installment, not the whole future schedule at once. Fixed by capping the default allocation to the next unpaid installment's remaining balance for split invoices, with a visible "Max ₹X (next installment)" hint in the UI — caught via an automated browser test before it ever reached a real user.



### Bug fixes
- **Wholesaler profile was unreachable** — added `GET/PUT /auth/business-profile` and a Profile page in the frontend.
- **Dashboard "retailers" metric was ambiguous** — now explicitly two numbers: `unique_retailers_billed` (distinct retailers) and `total_invoices` (total invoice count), shown separately in the UI.
- **Payment logs didn't show who paid** — `PaymentOut` now includes `retailer_name`, and dashboard recent activity links each payment to the retailer.

### Wholesaler-retailer relationship mapping (real fix, not cosmetic)
Previously, `GET /retailers` returned every retailer on the platform — meaning a wholesaler's list filled up with retailers they'd never interacted with. Now:
- A new `RetailerLink` table is the source of truth for "is this actually your retailer."
- A link is created **only** when a wholesaler explicitly adds a retailer, views their profile, or bills them (see `app/relationships.py`) — never just because a retailer registered.
- `GET /retailers` now returns only linked retailers, with `?tier=excellent|strained|risk` filtering.

### Proprietary Retailer Credit Score (RCS)
A CIBIL-style score (300–900 scale) in `app/scoring.py`, built from four weighted pillars — Payment History, Credit Utilization, Relationship Vintage, Returns Trend. See the module docstring for the full formula. Tiers: Excellent (≥700) / Strained (500–699) / Risk (<500).
- `PUT /retailers/{id}/credit-limit` — a wholesaler sets the credit limit they extend to a retailer, feeding the Utilization pillar.
- `POST /payments` now accepts `bounced: true` for a failed/returned payment — it doesn't reduce the balance owed, but does count against the Payment History pillar (flat penalty if any bounce in the last 12 months).
- Every retailer profile (`GET /retailers/{id}`, `GET /retailer-portal/dashboard`, `GET /network-search`) now returns a full `rcs` breakdown object instead of a single opaque number.

### Retailer profile depth
- `total_suppliers` — how many wholesalers currently have a relationship with this retailer.
- `payment_default_count` — overdue invoices + bounced payments, all-time, across every wholesaler.

## What's implemented (Phase 6 — backend only, frontend NOT yet updated)

**⚠️ IMPORTANT: this phase is backend-complete and test-verified, but the frontend has not been touched. None of the below has any UI yet.**

- **Global retailer search** — `GET /retailers/search?q=...` searches every registered retailer platform-wide (not just ones a wholesaler already has a relationship with), matching Firm Name, Owner Name, or GSTIN. Browsing search results does NOT create a relationship — only opening a full profile (`GET /retailers/{id}`) does, consistent with the existing relationship-mapping design. Short/empty queries return `[]` to avoid noisy results.
- **Three-identifier retailer schema** — `RetailerOut`/`RetailerListItem`/`RetailerGlobalSearchResult` and `InvoiceOut` (via `retailer_name`/`retailer_owner_name`/`retailer_gstin`) now consistently expose Firm Name, Owner Name, and GSTIN together everywhere, so retailers with the same name are distinguishable.
- **Invoice edit / void with full audit trail** — new `InvoiceAuditLog` model records every `created` / `modified` / `voided` / `dispute_resolved_via_edit` action with a human-readable diff (`app/audit.py`). Editing is blocked once an invoice is fully paid, UNLESS it's under an open dispute. Void (`DELETE /invoices/{id}`) is a soft-delete (`is_voided`, `void_reason`, `voided_at`) requiring a reason — never a hard delete — and voided invoices are excluded from dashboards, RCS scoring, and reports but remain visible via `?include_voided=true` for auditing. `GET /invoices/{id}/audit-log` returns the full history, newest first.
- **Resolve a dispute while editing the bill** — `PUT /invoices/{id}` accepts `resolve_dispute_note`; if the invoice has an open dispute, fixing the bill and resolving the dispute happens in one call (logged as `dispute_resolved_via_edit`).
- **Advanced filtering** — `GET /invoices` and `GET /credit-notes` both accept `retailer_q` (Firm Name/GSTIN free text), `date_from`/`date_to`, plus the existing `status`/`retailer_id` filters.

All of the above was verified with `test_quality6.py` (full assertion suite: search isolation, edit/void rules, audit log correctness, dispute-resolve-on-edit, filters) — backend only, no browser/UI testing was done this phase.

## Not yet built (next passes — see the dev plan)
- **Phase 6 frontend** — see "Immediate next step" below. This is the actual next task.
- **Advanced dispute workflow** — reason codes, communication log, formal approval states (current dispute flow is intentionally simple: open → resolve/reject).
- **Interactive report exports** — current `.xlsx` exports are static; live filtering post-download isn't implemented.
- Real SMS provider for OTP (still console-printed for dev/testing).
- Premium-plan enforcement on `network-search` outstanding-amount visibility.

## Immediate next step (start here in a new session)

Build the Phase 6 **frontend** to match the backend work above:
1. **Global search bar** on the Retailers page — dynamic-as-you-type call to `GET /retailers/search?q=`, showing results with an "Not yet in your book — view profile to add" affordance for `is_linked: false` results.
2. **Retailer cards/dropdowns everywhere** updated to show all three identifiers: Firm Name (header), Owner Name + GSTIN (subtext) — matching the card layout the user specified: `APEX PHARMACY` / `Owner: Rahul Sharma | GSTIN: 07AAAAA1111A1Z1`.
3. **Invoice edit UI** — a "Modify Invoice" action (only enabled per the backend's paid/disputed rules), a "Void" action requiring a reason, and a "Status History" panel showing `GET /invoices/{id}/audit-log`.
4. **Advanced filter bar** on the Invoices page — retailer search, payment status, date range (Today/Last 7 Days/Custom), and a Standard vs. Return Bill toggle (merge `/invoices` and `/credit-notes` results client-side, or query both).

After building, run a full Playwright visual regression (register → global search → edit/void an invoice → check audit log → filter invoices) before repackaging both zips, the same pattern used for every prior phase in this project.



- **Auth & Business Registration**: register business + owner account, OTP verification (dev-mode: OTP is printed to server console/log instead of sent via SMS), JWT login, invite staff. Business address is structured: `address_line`, `city`, `state`, `pincode`.
- **Retailer Management**: add retailer, duplicate GST/Drug-License detection, retailer profile with purchase/outstanding/delay stats. Retailer address is also structured (`address_line`, `city`, `state`, `pincode`).
- **Credit Sale (Invoice) Entry**: create/edit/delete invoices, auto status (outstanding/partial/overdue/paid).
- **Payment Update**: record payments, auto-calculates delay days vs. due date, updates invoice status and balance.
- **Credit Score Engine**: see "Proprietary Retailer Credit Score (RCS)" above — this superseded the original simple 0-100 scoring described in the initial BRD.
- **Dashboard**: outstanding, due-today, overdue amount, retailer count, collection rate, recent activity.
- **Industry-wide Retailer Search**: cross-business lookup by GST/Drug License/Name — returns **only** payment-behaviour fields (score, risk, avg delay) per the BRD's default privacy rule; no invoice/outstanding amounts exposed.
- **Reports**: Outstanding, Overdue, and Collection reports as downloadable `.xlsx`.
- Role-based access (owner/staff/admin), password hashing (bcrypt), JWT bearer auth.

### Retailer self-service portal (new)

Retailers are no longer dependent on a wholesaler telling them the truth. They get their own login:

- `POST /retailer-auth/register` — a retailer registers directly. If a wholesaler already added them (matched by GST or Drug License), the new login is automatically linked to that existing record so the retailer sees their real history, not a blank slate.
- `POST /retailer-auth/verify-otp`, `POST /retailer-auth/login` — same OTP + JWT pattern as the wholesaler side, but tokens are scoped separately (a retailer token cannot call wholesaler endpoints and vice versa).
- `GET /retailer-portal/dashboard` — their own credit score, risk, total outstanding, number of wholesalers reporting on them, open disputes.
- `GET /retailer-portal/invoices` — **every bill issued against them, across all wholesalers**, with wholesaler name, amount, status, and due date — so they can independently confirm a bill exists and whether a payment they made was actually marked cleared.
- `POST /retailer-portal/invoices/{id}/dispute` — flag a bill as wrong, or a payment as cleared-but-not-marked. **The invoice is immediately excluded from credit score penalties** the moment a dispute is raised, so a wholesaler can't silently damage a retailer's score by failing to update a payment or issuing an incorrect bill.
- `GET /retailer-portal/disputes` — their own dispute history and resolution notes.

### Wholesaler-side dispute resolution (new)

- `GET /disputes` — see disputes retailers have raised against your invoices.
- `PUT /disputes/{id}/resolve` — resolve (`action: "resolve"`, if the retailer was right — e.g. fix the payment via the normal `/payments` endpoint, then resolve) or reject (`action: "reject"`, if the bill is correct as-is). Either way the invoice re-enters credit scoring once resolved.

This was tested end-to-end: a retailer disputed a payment the wholesaler hadn't marked, the invoice was excluded from scoring while open, the wholesaler then recorded the missing payment and resolved the dispute, and the retailer's score correctly returned to 100/low-risk with the invoice showing "paid."

### Not yet built (later phases per roadmap)
Premium data-sharing tier enforcement, notifications/reminders, subscriptions & billing, audit logs, ERP integrations, AI risk prediction — see BRD "Future Features".

## Tech stack

- **FastAPI** + **SQLAlchemy** (SQLite by default — swap to Postgres by setting `DATABASE_URL`)
- **JWT** auth via `python-jose`, password hashing via `bcrypt`
- **openpyxl** for Excel report export
- Auto-generated interactive API docs (Swagger UI) — this is your instant test console, no separate frontend needed for the MVP.

## Running it locally

```bash
cd credittrust
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Then open **http://localhost:8000/docs** — this gives you a full interactive UI to test every endpoint (register, login, add retailers, create invoices, record payments, etc.) without writing any frontend code.

By default it uses a local SQLite file `credittrust.db` (created automatically on first run — safe to delete to reset all data).

## Testing the MVP flow (via /docs or curl)

1. `POST /auth/register` — register a business + owner. Since there's no SMS provider wired up yet, the OTP is printed to the server console (`[DEV OTP] mobile=... otp=...`) so you can complete verification.
2. `POST /auth/verify-otp` — verify using the OTP from the console.
3. `POST /auth/login` — get a JWT `access_token`. In `/docs`, click **Authorize** and paste the token to unlock the protected endpoints.
4. `POST /retailers` — add a retailer.
5. `POST /invoices` — create a credit sale against that retailer.
6. `POST /payments` — record a payment; delay days and credit score are computed automatically.
7. `GET /dashboard`, `GET /retailers/{id}`, `GET /network-search`, `GET /reports/outstanding.xlsx` — see the results.

This full flow (registration → OTP → login → retailer → invoice → payment → credit score → dashboard → network search → Excel export) has already been tested end-to-end against this codebase and works correctly.

## Switching to PostgreSQL (for staging/production)

```bash
export DATABASE_URL="postgresql://user:password@host:5432/credittrust"
```
SQLAlchemy will handle the rest; no code changes needed.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./credittrust.db` | DB connection string |
| `SECRET_KEY` | dev key (change this!) | JWT signing secret |

## Project structure

```
app/
  main.py            # FastAPI app + router registration
  database.py         # SQLAlchemy engine/session
  models.py            # ORM models (Business, User, Retailer, Invoice, Payment, CreditScore)
  schemas.py           # Pydantic request/response schemas
  auth.py              # JWT + bcrypt password handling, role guards
  scoring.py           # Credit score engine
  routers/
    auth_router.py            # wholesaler register, OTP, login, invite staff
    retailer_router.py        # retailer CRUD + profile (wholesaler-side)
    invoice_router.py         # invoice CRUD + status logic
    payment_router.py         # payment recording + delay calc
    dashboard_router.py       # wholesaler dashboard summary
    search_router.py          # cross-business privacy-safe search
    reports_router.py         # Excel exports
    retailer_auth_router.py   # retailer self-registration, OTP, login
    retailer_portal_router.py # retailer's own dashboard, invoices, disputes
    disputes_router.py        # wholesaler-side dispute viewing & resolution
```

## Next steps (Phase 3 & beyond)

- Wire a real SMS provider (Twilio/MSG91) for OTP instead of console-print (applies to both wholesaler and retailer registration).
- Enforce the premium-plan outstanding-amount sharing rule in `network-search` (currently all businesses see only the private view).
- Add notifications (invoice due/overdue, payment received, **new dispute raised/resolved**) — likely a scheduled job + WhatsApp/SMS integration.
- Consider notifying a wholesaler immediately (not just via polling `/disputes`) when a retailer raises a dispute.
- Add subscription/billing and audit logging.
- Build the frontend (React + Vite + Tailwind + shadcn/ui, as per the original BRD) — now needs two portals: wholesaler dashboard and retailer self-service portal.
