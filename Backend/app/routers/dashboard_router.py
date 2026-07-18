from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app import models, schemas, auth

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("", response_model=schemas.DashboardSummary)
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    biz_id = current_user.business_id
    invoices = (
        db.query(models.Invoice)
        .filter(models.Invoice.business_id == biz_id, models.Invoice.is_voided == False)  # noqa: E712
        .all()
    )

    total_outstanding = sum(i.outstanding_amount for i in invoices)
    overdue_amount = sum(i.outstanding_amount for i in invoices if i.status == models.InvoiceStatus.overdue)
    due_today = sum(1 for i in invoices if i.due_date == date.today() and i.outstanding_amount > 0)

    # Two distinct metrics, intentionally separate: how many DIFFERENT
    # retailers you've billed vs. how many invoices you've issued in total
    # (one retailer can have many invoices).
    unique_retailers_billed = (
        db.query(func.count(func.distinct(models.Invoice.retailer_id)))
        .filter(models.Invoice.business_id == biz_id, models.Invoice.is_voided == False)  # noqa: E712
        .scalar()
        or 0
    )
    total_invoices = len(invoices)

    total_invoiced = sum(i.amount for i in invoices)
    collected = total_invoiced - total_outstanding
    collection_rate = round((collected / total_invoiced) * 100, 1) if total_invoiced else 0.0

    recent_payments = (
        db.query(models.Payment)
        .join(models.Invoice)
        .filter(models.Invoice.business_id == biz_id, models.Invoice.is_voided == False)  # noqa: E712
        .order_by(models.Payment.created_at.desc())
        .limit(8)
        .all()
    )
    recent_activity = [
        schemas.RecentActivityItem(
            type="payment",
            invoice_id=p.invoice_id,
            retailer_id=p.invoice.retailer_id,
            retailer_name=p.invoice.retailer.name if p.invoice.retailer else "Unknown retailer",
            amount=p.amount,
            date=str(p.payment_date),
            bounced=p.bounced,
        )
        for p in recent_payments
    ]

    return schemas.DashboardSummary(
        total_credit_outstanding=round(total_outstanding, 2),
        invoices_due_today=due_today,
        overdue_amount=round(overdue_amount, 2),
        unique_retailers_billed=unique_retailers_billed,
        total_invoices=total_invoices,
        collection_rate=collection_rate,
        recent_activity=recent_activity,
    )
