import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas, auth
from app.scoring import recalculate_credit_score
from app.routers.invoice_router import refresh_invoice_status

router = APIRouter(prefix="/payments", tags=["Payment Update"])


def _to_payment_out(payment: models.Payment) -> schemas.PaymentOut:
    return schemas.PaymentOut(
        id=payment.id,
        invoice_id=payment.invoice_id,
        installment_id=payment.installment_id,
        settlement_id=payment.settlement_id,
        amount=payment.amount,
        payment_date=payment.payment_date,
        reference_number=payment.reference_number,
        delay_days=payment.delay_days,
        bounced=payment.bounced,
        retailer_name=payment.invoice.retailer.name if payment.invoice and payment.invoice.retailer else None,
    )


def _apply_single_payment(
    db: Session, invoice: models.Invoice, amount: float, payment_date, reference_number, bounced: bool,
    installment_id: str = None, settlement_id: str = None,
) -> models.Payment:
    """Core logic for applying one payment amount against one invoice,
    installment-aware. Shared by both the single-payment and bulk-settlement
    endpoints so the delay/utilization/status math never drifts apart."""
    target_installment = None
    if invoice.installments:
        if installment_id:
            target_installment = next((i for i in invoice.installments if i.id == installment_id), None)
            if not target_installment:
                raise HTTPException(status_code=404, detail="Installment not found on this invoice")
        else:
            # auto-apply to the oldest unpaid installment
            pending = [i for i in invoice.installments if i.paid_amount < i.amount]
            target_installment = min(pending, key=lambda i: i.due_date) if pending else None

        if target_installment and not bounced:
            remaining = target_installment.amount - target_installment.paid_amount
            if amount > remaining + 0.01:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"₹{amount} exceeds installment #{target_installment.sequence}'s remaining balance of "
                        f"₹{remaining} on invoice {invoice.invoice_number}. This invoice has a split schedule — "
                        f"allocate no more than what's due on its next installment, or settle it separately "
                        f"one installment at a time."
                    ),
                )

    due_date = target_installment.due_date if target_installment else invoice.due_date
    delay_days = max(0, (payment_date - due_date).days)

    if not bounced:
        if amount > invoice.outstanding_amount + 0.01:
            raise HTTPException(status_code=400, detail="Payment exceeds invoice outstanding balance")
        invoice.outstanding_amount = round(invoice.outstanding_amount - amount, 2)
        if target_installment:
            target_installment.paid_amount = round(target_installment.paid_amount + amount, 2)
        refresh_invoice_status(invoice)

    payment = models.Payment(
        invoice_id=invoice.id,
        installment_id=target_installment.id if target_installment else None,
        settlement_id=settlement_id,
        amount=amount,
        payment_date=payment_date,
        reference_number=reference_number,
        delay_days=delay_days,
        bounced=bounced,
    )
    db.add(payment)
    return payment


@router.post("", response_model=schemas.PaymentOut)
def record_payment(
    payload: schemas.PaymentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    invoice = (
        db.query(models.Invoice)
        .filter(models.Invoice.id == payload.invoice_id, models.Invoice.business_id == current_user.business_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be positive")

    payment = _apply_single_payment(
        db, invoice, payload.amount, payload.payment_date, payload.reference_number, payload.bounced,
        installment_id=payload.installment_id,
    )
    db.commit()
    db.refresh(payment)

    recalculate_credit_score(db, invoice.retailer_id)

    return _to_payment_out(payment)


@router.post("/bulk-settle", response_model=schemas.BulkSettlementResult)
def bulk_settle(
    payload: schemas.BulkSettlementCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Settle multiple outstanding bills with a single payment (one cheque or
    bank transfer) — a ledger-matching interface where the caller specifies
    exactly how much of that one payment goes against each invoice.
    """
    if not payload.allocations:
        raise HTTPException(status_code=400, detail="Provide at least one invoice allocation")

    settlement_id = str(uuid.uuid4())
    payments = []
    retailer_id = None

    for alloc in payload.allocations:
        invoice = (
            db.query(models.Invoice)
            .filter(
                models.Invoice.id == alloc.invoice_id,
                models.Invoice.business_id == current_user.business_id,
                models.Invoice.retailer_id == payload.retailer_id,
            )
            .first()
        )
        if not invoice:
            raise HTTPException(status_code=404, detail=f"Invoice {alloc.invoice_id} not found for this retailer")
        if alloc.amount <= 0:
            raise HTTPException(status_code=400, detail="Each allocation amount must be positive")

        retailer_id = invoice.retailer_id
        payment = _apply_single_payment(
            db, invoice, alloc.amount, payload.payment_date, payload.reference_number, bounced=False,
            settlement_id=settlement_id,
        )
        payments.append(payment)

    db.commit()
    for p in payments:
        db.refresh(p)

    if retailer_id:
        recalculate_credit_score(db, retailer_id)

    return schemas.BulkSettlementResult(
        settlement_id=settlement_id,
        total_amount=sum(a.amount for a in payload.allocations),
        payments=[_to_payment_out(p) for p in payments],
    )


@router.get("/invoice/{invoice_id}", response_model=list[schemas.PaymentOut])
def list_payments_for_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    invoice = (
        db.query(models.Invoice)
        .filter(models.Invoice.id == invoice_id, models.Invoice.business_id == current_user.business_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    payments = db.query(models.Payment).filter(models.Payment.invoice_id == invoice_id).all()
    return [_to_payment_out(p) for p in payments]
