from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas, auth, scoring
from app.scoring import recalculate_credit_score
from app.notifications import notify

router = APIRouter(prefix="/retailer-portal", tags=["Retailer Portal — My Bills & Disputes"])


@router.get("/dashboard", response_model=schemas.RetailerPortalDashboard)
def retailer_dashboard(
    db: Session = Depends(get_db),
    current_retailer_user: models.RetailerUser = Depends(auth.get_current_retailer_user),
):
    retailer = current_retailer_user.retailer
    invoices = (
        db.query(models.Invoice)
        .filter(models.Invoice.retailer_id == retailer.id, models.Invoice.is_voided == False)  # noqa: E712
        .all()
    )

    total_outstanding = sum(i.outstanding_amount for i in invoices)
    reporting_wholesalers = len({i.business_id for i in invoices})
    open_disputes = (
        db.query(models.Dispute)
        .join(models.Invoice)
        .filter(models.Invoice.retailer_id == retailer.id, models.Dispute.status == models.DisputeStatus.open)
        .count()
    )

    cs = retailer.credit_score
    return schemas.RetailerPortalDashboard(
        retailer_name=retailer.name,
        rcs=schemas.RCSBreakdown(**scoring.to_breakdown(cs)) if cs else None,
        reporting_wholesalers=reporting_wholesalers,
        total_outstanding=round(total_outstanding, 2),
        total_invoices=len(invoices),
        open_disputes=open_disputes,
    )


@router.get("/invoices", response_model=List[schemas.RetailerPortalInvoiceOut])
def my_invoices(
    db: Session = Depends(get_db),
    current_retailer_user: models.RetailerUser = Depends(auth.get_current_retailer_user),
):
    """
    Every bill issued against this retailer, across ALL wholesalers — so the
    retailer can independently confirm a bill exists and check whether a
    payment they made has actually been marked cleared on the platform.
    """
    invoices = (
        db.query(models.Invoice)
        .filter(models.Invoice.retailer_id == current_retailer_user.retailer_id)
        .order_by(models.Invoice.invoice_date.desc())
        .all()
    )
    return [
        schemas.RetailerPortalInvoiceOut(
            id=inv.id,
            wholesaler_name=inv.business.name,
            invoice_number=inv.invoice_number,
            invoice_date=inv.invoice_date,
            amount=inv.amount,
            outstanding_amount=inv.outstanding_amount,
            status=inv.status,
            due_date=inv.due_date,
            is_disputed=inv.is_disputed,
            is_voided=inv.is_voided,
            installments=inv.installments,
        )
        for inv in invoices
    ]


@router.get("/credit-notes", response_model=List[schemas.CreditNoteOut])
def my_credit_notes(
    db: Session = Depends(get_db),
    current_retailer_user: models.RetailerUser = Depends(auth.get_current_retailer_user),
):
    """Credit notes issued against this retailer's returns, across every wholesaler."""
    notes = (
        db.query(models.CreditNote)
        .filter(models.CreditNote.retailer_id == current_retailer_user.retailer_id)
        .order_by(models.CreditNote.created_at.desc())
        .all()
    )
    return [
        schemas.CreditNoteOut(
            id=n.id,
            invoice_id=n.invoice_id,
            invoice_number=n.invoice.invoice_number if n.invoice else None,
            retailer_name=n.retailer.name if n.retailer else None,
            amount=n.amount,
            reason=n.reason,
            note=n.note,
            created_at=n.created_at,
        )
        for n in notes
    ]


@router.post("/invoices/{invoice_id}/dispute", response_model=schemas.DisputeOut)
def raise_dispute(
    invoice_id: str,
    payload: schemas.DisputeCreate,
    db: Session = Depends(get_db),
    current_retailer_user: models.RetailerUser = Depends(auth.get_current_retailer_user),
):
    """
    Retailer flags a bill as wrong, or a payment as cleared-but-not-marked.
    The invoice is immediately excluded from credit score penalties until the
    issuing wholesaler resolves the dispute.
    """
    invoice = (
        db.query(models.Invoice)
        .filter(
            models.Invoice.id == invoice_id,
            models.Invoice.retailer_id == current_retailer_user.retailer_id,
        )
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found for your retailer account")

    existing_open = (
        db.query(models.Dispute)
        .filter(models.Dispute.invoice_id == invoice_id, models.Dispute.status == models.DisputeStatus.open)
        .first()
    )
    if existing_open:
        raise HTTPException(status_code=400, detail="This invoice already has an open dispute")

    dispute = models.Dispute(
        invoice_id=invoice_id,
        retailer_user_id=current_retailer_user.id,
        reason=payload.reason,
        description=payload.description,
    )
    invoice.is_disputed = True
    db.add(dispute)
    db.commit()
    db.refresh(dispute)

    recalculate_credit_score(db, invoice.retailer_id)

    notify(
        db,
        recipient_type=models.RecipientType.business,
        recipient_id=invoice.business_id,
        type_=models.NotificationType.dispute_raised,
        title=f"Dispute raised on invoice {invoice.invoice_number}",
        message=(
            f"{current_retailer_user.retailer.name} disputed invoice "
            f"{invoice.invoice_number} ({payload.reason}). "
            f"This invoice is excluded from their credit score until resolved."
        ),
        invoice_id=invoice.id,
        dispute_id=dispute.id,
    )

    return dispute


@router.get("/disputes", response_model=List[schemas.DisputeOut])
def my_disputes(
    db: Session = Depends(get_db),
    current_retailer_user: models.RetailerUser = Depends(auth.get_current_retailer_user),
):
    return (
        db.query(models.Dispute)
        .filter(models.Dispute.retailer_user_id == current_retailer_user.id)
        .order_by(models.Dispute.created_at.desc())
        .all()
    )


@router.get("/notifications", response_model=schemas.NotificationSummary)
def retailer_notifications(
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_retailer_user: models.RetailerUser = Depends(auth.get_current_retailer_user),
):
    query = db.query(models.Notification).filter(
        models.Notification.recipient_type == models.RecipientType.retailer,
        models.Notification.recipient_id == current_retailer_user.retailer_id,
    )
    if unread_only:
        query = query.filter(models.Notification.is_read.is_(False))

    notifications = query.order_by(models.Notification.created_at.desc()).limit(100).all()
    unread_count = (
        db.query(models.Notification)
        .filter(
            models.Notification.recipient_type == models.RecipientType.retailer,
            models.Notification.recipient_id == current_retailer_user.retailer_id,
            models.Notification.is_read.is_(False),
        )
        .count()
    )
    return schemas.NotificationSummary(unread_count=unread_count, notifications=notifications)


@router.put("/notifications/{notification_id}/read", response_model=schemas.NotificationOut)
def retailer_mark_read(
    notification_id: str,
    db: Session = Depends(get_db),
    current_retailer_user: models.RetailerUser = Depends(auth.get_current_retailer_user),
):
    n = (
        db.query(models.Notification)
        .filter(
            models.Notification.id == notification_id,
            models.Notification.recipient_type == models.RecipientType.retailer,
            models.Notification.recipient_id == current_retailer_user.retailer_id,
        )
        .first()
    )
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    db.commit()
    db.refresh(n)
    return n
