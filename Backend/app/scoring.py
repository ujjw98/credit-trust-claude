"""
Proprietary Retailer Credit Score (RCS) engine.

A CIBIL-style score on a 300-900 scale built from four weighted pillars,
computed from a retailer's ledger data across ALL wholesalers on the
platform (this is a shared, cross-business score, not a per-relationship
one):

  Payment History   (max 240 pts, ~40% of the 600pt span)
      Based on average Days Past Due (DPD) across all payments, with a flat
      penalty for any bounced/failed payment in the last 12 months.

  Credit Utilization (max 180 pts, ~30%)
      Outstanding balance / total credit limit, summed across every
      wholesaler relationship that has a credit limit set. If NO wholesaler
      has set a limit yet, there's no honest utilization number to compute
      — rather than penalize for missing data, this pillar defaults to full
      points and `utilization_pct` is left null so the UI can show
      "insufficient data" instead of a misleading 0%.

  Relationship Vintage (max 90 pts, ~15%)
      Months since the retailer's earliest invoice on the platform.

  Returns / Credit Notes (max 90 pts, ~15%)
      Value of credit notes issued relative to total invoiced amount, across
      every wholesaler. A high return rate suggests poor stock management
      or possible debt write-off attempts via fake returns.

Final score = 300 + payment_points + utilization_points + vintage_points + returns_points
Tiers: Excellent >=700, Strained 500-699, Risk <500 (tune as real data comes in).
"""

from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app import models

BOUNCED_PENALTY = 90
TIER_EXCELLENT_MIN = 700
TIER_STRAINED_MIN = 500


def _payment_points(avg_dpd: float, bounced_count_12m: int) -> int:
    if avg_dpd <= 5:
        base = 150
    elif avg_dpd <= 15:
        base = 100
    elif avg_dpd <= 30:
        base = 45
    else:
        base = 0

    points = base + 90  # the extra 90 headroom lets a clean recent record offset one old bounce
    if bounced_count_12m > 0:
        points -= BOUNCED_PENALTY
    return max(0, min(240, points))


def _utilization_points(utilization_pct):
    if utilization_pct is None:
        return 180  # no credit limits set anywhere yet — benefit of the doubt, not a penalty
    if utilization_pct < 30:
        return 180
    if utilization_pct <= 60:
        return 120
    if utilization_pct <= 90:
        return 60
    return 0


def _vintage_points(months: float) -> int:
    if months > 36:
        return 90
    if months >= 12:
        return 60
    if months >= 3:
        return 30
    return 10


def _returns_points(return_rate_pct: float) -> int:
    if return_rate_pct < 5:
        return 90
    if return_rate_pct <= 15:
        return 50
    return 0


def _tier(rcs_score: int) -> models.RiskLevel:
    if rcs_score >= TIER_EXCELLENT_MIN:
        return models.RiskLevel.low       # "Excellent"
    if rcs_score >= TIER_STRAINED_MIN:
        return models.RiskLevel.medium    # "Strained"
    return models.RiskLevel.high          # "Risk"


def to_breakdown(cs: models.CreditScore) -> dict:
    """Serialize a CreditScore row into the shape schemas.RCSBreakdown expects."""
    tier_label = {"low": "excellent", "medium": "strained", "high": "risk"}
    return {
        "rcs_score": cs.rcs_score,
        "tier": tier_label[cs.risk.value],
        "payment_points": cs.payment_points,
        "utilization_points": cs.utilization_points,
        "vintage_points": cs.vintage_points,
        "returns_points": cs.returns_points,
        "utilization_pct": cs.utilization_pct,
        "average_delay_days": cs.average_delay,
        "bounced_count_12m": cs.bounced_count_12m,
        "return_rate_pct": cs.return_rate_pct,
        "reporting_businesses": cs.reporting_businesses,
    }


def recalculate_credit_score(db: Session, retailer_id: str) -> models.CreditScore:
    invoices = (
        db.query(models.Invoice)
        .filter(models.Invoice.retailer_id == retailer_id, models.Invoice.is_voided == False)  # noqa: E712
        .all()
    )

    # ---- Payment History pillar ----
    total_delay = 0
    delay_count = 0
    reporting_business_ids = set()
    twelve_months_ago = datetime.utcnow() - timedelta(days=365)
    bounced_count_12m = 0

    for inv in invoices:
        reporting_business_ids.add(inv.business_id)
        if inv.is_disputed:
            continue  # excluded from scoring while a dispute is open — see disputes module

        payments = db.query(models.Payment).filter(models.Payment.invoice_id == inv.id).all()
        for p in payments:
            total_delay += p.delay_days
            delay_count += 1
            if p.bounced and p.created_at and p.created_at >= twelve_months_ago:
                bounced_count_12m += 1

    avg_dpd = round(total_delay / delay_count, 1) if delay_count else 0.0
    payment_points = _payment_points(avg_dpd, bounced_count_12m)

    # ---- Credit Utilization pillar ----
    links = db.query(models.RetailerLink).filter(models.RetailerLink.retailer_id == retailer_id).all()
    limited_links = [l for l in links if l.credit_limit and l.credit_limit > 0]
    total_limit = sum(l.credit_limit for l in limited_links)

    if total_limit > 0:
        # outstanding owed to those specific wholesalers with a limit set
        limited_business_ids = {l.business_id for l in limited_links}
        outstanding = sum(
            inv.outstanding_amount for inv in invoices if inv.business_id in limited_business_ids
        )
        utilization_pct = round((outstanding / total_limit) * 100, 1)
    else:
        utilization_pct = None

    utilization_points = _utilization_points(utilization_pct)

    # ---- Relationship Vintage pillar ----
    if invoices:
        earliest = min(inv.invoice_date for inv in invoices)
        months_active = (date.today() - earliest).days / 30.44
    else:
        months_active = 0
    vintage_points = _vintage_points(months_active)

    # ---- Returns pillar (real Credit Note data) ----
    total_invoiced = sum(inv.amount for inv in invoices)
    total_credit_notes = (
        db.query(models.CreditNote).filter(models.CreditNote.retailer_id == retailer_id).all()
    )
    total_returns_value = sum(cn.amount for cn in total_credit_notes)
    return_rate_pct = round((total_returns_value / total_invoiced) * 100, 1) if total_invoiced else 0.0
    returns_points = _returns_points(return_rate_pct)

    rcs_score = 300 + payment_points + utilization_points + vintage_points + returns_points
    rcs_score = max(300, min(900, rcs_score))

    cs = db.query(models.CreditScore).filter(models.CreditScore.retailer_id == retailer_id).first()
    if not cs:
        cs = models.CreditScore(retailer_id=retailer_id)
        db.add(cs)

    cs.average_delay = avg_dpd
    cs.reporting_businesses = len(reporting_business_ids)
    cs.rcs_score = rcs_score
    cs.payment_points = payment_points
    cs.utilization_points = utilization_points
    cs.vintage_points = vintage_points
    cs.returns_points = returns_points
    cs.utilization_pct = utilization_pct
    cs.bounced_count_12m = bounced_count_12m
    cs.return_rate_pct = return_rate_pct
    cs.risk = _tier(rcs_score)

    db.commit()
    db.refresh(cs)
    return cs
