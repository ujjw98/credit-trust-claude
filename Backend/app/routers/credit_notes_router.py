from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app import models, schemas, auth
from app.scoring import recalculate_credit_score
from app.routers.invoice_router import refresh_invoice_status
from app.notifications import notify

router = APIRouter(prefix="/credit-notes", tags=["Returns Management (Credit Notes)"])


def _to_out(cn: models.CreditNote) -> schemas.CreditNoteOut:
    return schemas.CreditNoteOut(
        id=cn.id,
        invoice_id=cn.invoice_id,
        invoice_number=cn.invoice.invoice_number if cn.invoice else None,
        retailer_name=cn.retailer.name if cn.retailer else None,
        amount=cn.amount,
        reason=cn.reason,
        note=cn.note,
        created_at=cn.created_at,
    )


@router.post("", response_model=schemas.CreditNoteOut)
def issue_credit_note(
    payload: schemas.CreditNoteCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_owner_or_admin),
):
    """
    Issue a credit note against returned/expired/damaged stock. Deducts
    directly from the invoice's outstanding balance — like a payment, but
    backed by returned goods rather than cash — and feeds the Returns Trend
    pillar of the retailer's platform-wide RCS score. If the invoice has an
    installment schedule, the credit is applied to the oldest unpaid
    installment so the schedule stays consistent with the overall balance.
    """
    invoice = (
        db.query(models.Invoice)
        .filter(models.Invoice.id == payload.invoice_id, models.Invoice.business_id == current_user.business_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.is_voided:
        raise HTTPException(status_code=400, detail="This invoice has been voided — no further changes can be made")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Credit note amount must be positive")
    if payload.amount > invoice.outstanding_amount + 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"Credit note of ₹{payload.amount} exceeds the invoice's outstanding balance of ₹{invoice.outstanding_amount}",
        )

    if invoice.installments:
        pending = [i for i in invoice.installments if i.paid_amount < i.amount]
        target_installment = min(pending, key=lambda i: i.due_date) if pending else None
        if target_installment:
            remaining = target_installment.amount - target_installment.paid_amount
            if payload.amount > remaining + 0.01:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Credit note of ₹{payload.amount} exceeds installment #{target_installment.sequence}'s "
                        f"remaining balance of ₹{remaining}. Issue separate credit notes per installment."
                    ),
                )
            target_installment.paid_amount = round(target_installment.paid_amount + payload.amount, 2)

    credit_note = models.CreditNote(
        business_id=current_user.business_id,
        retailer_id=invoice.retailer_id,
        invoice_id=invoice.id,
        amount=payload.amount,
        reason=payload.reason,
        note=payload.note,
    )
    db.add(credit_note)

    invoice.outstanding_amount = round(invoice.outstanding_amount - payload.amount, 2)
    refresh_invoice_status(invoice)

    db.commit()
    db.refresh(credit_note)

    recalculate_credit_score(db, invoice.retailer_id)

    retailer = invoice.retailer
    notify(
        db,
        recipient_type=models.RecipientType.retailer,
        recipient_id=retailer.id,
        type_=models.NotificationType.credit_note_issued,
        title=f"Credit note issued on invoice {invoice.invoice_number}",
        message=f"₹{payload.amount} credited against invoice {invoice.invoice_number} ({payload.reason.replace('_', ' ')}).",
        invoice_id=invoice.id,
    )

    return _to_out(credit_note)


@router.get("", response_model=List[schemas.CreditNoteOut])
def list_credit_notes(
    retailer_id: Optional[str] = None,
    retailer_q: Optional[str] = Query(None, description="Search by retailer Firm Name or GSTIN"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    query = db.query(models.CreditNote).filter(models.CreditNote.business_id == current_user.business_id)
    if retailer_id:
        query = query.filter(models.CreditNote.retailer_id == retailer_id)
    if retailer_q:
        like = f"%{retailer_q}%"
        query = query.join(models.Retailer).filter(
            or_(models.Retailer.name.ilike(like), models.Retailer.gstin.ilike(like))
        )
    if date_from:
        query = query.filter(models.CreditNote.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(models.CreditNote.created_at <= datetime.combine(date_to, datetime.max.time()))
    notes = query.order_by(models.CreditNote.created_at.desc()).all()
    return [_to_out(n) for n in notes]
