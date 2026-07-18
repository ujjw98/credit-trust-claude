from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app import models, schemas, auth, scoring
from app.relationships import get_or_create_link

router = APIRouter(prefix="/retailers", tags=["Retailer Management"])

TIER_TO_RISK = {"excellent": models.RiskLevel.low, "strained": models.RiskLevel.medium, "risk": models.RiskLevel.high}


def _retailer_search_filter(query, q: str):
    """Shared search predicate: matches on Firm Name, Owner Name, or GSTIN —
    the three identifiers a wholesaler might search by."""
    like = f"%{q}%"
    return query.filter(
        or_(
            models.Retailer.name.ilike(like),
            models.Retailer.owner_name.ilike(like),
            models.Retailer.gstin.ilike(like),
            models.Retailer.drug_license.ilike(like),
        )
    )


@router.post("", response_model=schemas.RetailerListItem)
def add_retailer(
    payload: schemas.RetailerCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Adds a retailer to YOUR retailer book. If this retailer already exists
    on the platform (matched by GST/Drug License — e.g. another wholesaler
    added them, or they self-registered), this links you to that existing
    record instead of creating a duplicate. A link is only rejected if you
    already have one with this retailer."""
    existing = None
    if payload.gstin:
        existing = db.query(models.Retailer).filter(models.Retailer.gstin == payload.gstin).first()
    if not existing and payload.drug_license:
        existing = db.query(models.Retailer).filter(models.Retailer.drug_license == payload.drug_license).first()

    if existing:
        retailer = existing
    else:
        retailer = models.Retailer(**payload.model_dump())
        db.add(retailer)
        db.commit()
        db.refresh(retailer)

    link, created = get_or_create_link(db, current_user.business_id, retailer.id, models.LinkSource.explicit_add)
    if not created:
        raise HTTPException(status_code=400, detail="This retailer is already in your retailer book.")

    cs = retailer.credit_score
    return schemas.RetailerListItem(
        **schemas.RetailerOut.model_validate(retailer).model_dump(),
        credit_limit=link.credit_limit,
        rcs_score=cs.rcs_score if cs else None,
        tier=scoring.to_breakdown(cs)["tier"] if cs else None,
    )


@router.get("", response_model=List[schemas.RetailerListItem])
def my_retailers(
    q: Optional[str] = None,
    tier: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Retailers YOU have an active relationship with — not every retailer on
    the platform. A relationship is created when you add a retailer, view
    their profile, or bill them; registering alone does not create one.
    Search matches Firm Name, Owner Name, or GSTIN."""
    query = (
        db.query(models.RetailerLink, models.Retailer)
        .join(models.Retailer, models.RetailerLink.retailer_id == models.Retailer.id)
        .filter(models.RetailerLink.business_id == current_user.business_id)
    )
    if q:
        query = _retailer_search_filter(query, q)
    if tier:
        if tier not in TIER_TO_RISK:
            raise HTTPException(status_code=400, detail="tier must be one of: excellent, strained, risk")
        query = query.join(models.CreditScore, models.CreditScore.retailer_id == models.Retailer.id).filter(
            models.CreditScore.risk == TIER_TO_RISK[tier]
        )

    results = []
    for link, retailer in query.limit(100).all():
        cs = retailer.credit_score
        results.append(
            schemas.RetailerListItem(
                **schemas.RetailerOut.model_validate(retailer).model_dump(),
                credit_limit=link.credit_limit,
                rcs_score=cs.rcs_score if cs else None,
                tier=scoring.to_breakdown(cs)["tier"] if cs else None,
            )
        )
    return results


@router.get("/search", response_model=List[schemas.RetailerGlobalSearchResult])
def global_search(
    q: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Universal search across EVERY registered retailer on the platform —
    not just ones this wholesaler already supplies. Matches Firm Name, Owner
    Name, or GSTIN, so typing a GST number pulls up that exact firm. This is
    a lightweight, browsing-only lookup: it does NOT create a business
    relationship. Only actually opening a retailer's full profile
    (GET /retailers/{id}) does that — searching to look someone up shouldn't
    silently add them to your retailer book.
    """
    if not q or len(q.strip()) < 2:
        return []

    query = db.query(models.Retailer)
    query = _retailer_search_filter(query, q.strip())
    retailers = query.limit(20).all()

    linked_ids = {
        rid
        for (rid,) in db.query(models.RetailerLink.retailer_id).filter(
            models.RetailerLink.business_id == current_user.business_id
        )
    }

    results = []
    for retailer in retailers:
        cs = retailer.credit_score
        results.append(
            schemas.RetailerGlobalSearchResult(
                **schemas.RetailerOut.model_validate(retailer).model_dump(),
                is_linked=retailer.id in linked_ids,
                rcs_score=cs.rcs_score if cs else None,
                tier=scoring.to_breakdown(cs)["tier"] if cs else None,
            )
        )
    return results


@router.get("/{retailer_id}", response_model=schemas.RetailerProfile)
def get_retailer_profile(
    retailer_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    View any retailer's profile — including ones not currently in your
    supply list, discovered via global search. This is the action that
    establishes a relationship (see get_or_create_link below); merely
    finding them in search results does not.
    """
    retailer = db.query(models.Retailer).filter(models.Retailer.id == retailer_id).first()
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found")

    link, _ = get_or_create_link(db, current_user.business_id, retailer_id, models.LinkSource.profile_view)

    invoices = (
        db.query(models.Invoice)
        .filter(models.Invoice.retailer_id == retailer_id, models.Invoice.is_voided == False)  # noqa: E712
        .all()
    )
    total_purchase = sum(i.amount for i in invoices)
    outstanding = sum(i.outstanding_amount for i in invoices)
    paid_invoices = sum(1 for i in invoices if i.status == models.InvoiceStatus.paid)
    overdue_invoices_ever = sum(1 for i in invoices if i.status == models.InvoiceStatus.overdue)

    all_payments = (
        db.query(models.Payment)
        .join(models.Invoice)
        .filter(models.Invoice.retailer_id == retailer_id, models.Invoice.is_voided == False)  # noqa: E712
        .all()
    )
    average_delay = (
        round(sum(p.delay_days for p in all_payments) / len(all_payments), 1) if all_payments else 0.0
    )
    bounced_ever = sum(1 for p in all_payments if p.bounced)

    total_suppliers = (
        db.query(models.RetailerLink).filter(models.RetailerLink.retailer_id == retailer_id).count()
    )

    cs = retailer.credit_score
    rcs = schemas.RCSBreakdown(**scoring.to_breakdown(cs)) if cs else None

    return schemas.RetailerProfile(
        retailer=retailer,
        total_purchase=total_purchase,
        outstanding=outstanding,
        average_delay=average_delay,
        paid_invoices=paid_invoices,
        overdue_invoices=overdue_invoices_ever,
        rcs=rcs,
        total_suppliers=total_suppliers,
        payment_default_count=overdue_invoices_ever + bounced_ever,
        credit_limit=link.credit_limit,
    )


@router.put("/{retailer_id}/credit-limit", response_model=schemas.RetailerListItem)
def set_credit_limit(
    retailer_id: str,
    payload: schemas.SetCreditLimit,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_owner_or_admin),
):
    """Sets the credit limit YOU extend to this retailer. Feeds the Credit
    Utilization pillar of their platform-wide RCS score."""
    retailer = db.query(models.Retailer).filter(models.Retailer.id == retailer_id).first()
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found")

    link, _ = get_or_create_link(db, current_user.business_id, retailer_id, models.LinkSource.explicit_add)
    link.credit_limit = payload.credit_limit
    db.commit()

    scoring.recalculate_credit_score(db, retailer_id)
    db.refresh(retailer)

    cs = retailer.credit_score
    return schemas.RetailerListItem(
        **schemas.RetailerOut.model_validate(retailer).model_dump(),
        credit_limit=link.credit_limit,
        rcs_score=cs.rcs_score if cs else None,
        tier=scoring.to_breakdown(cs)["tier"] if cs else None,
    )
