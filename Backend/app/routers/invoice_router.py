from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app import models, schemas, auth
from app.scoring import recalculate_credit_score
from app.relationships import get_or_create_link
from app.audit import diff_summary, log_invoice_action
from app.routers.disputes_router import _resolve_dispute_internal

router = APIRouter(prefix="/invoices", tags=["Credit Sale (Invoice) Entry"])


def refresh_invoice_status(invoice: models.Invoice):
    """Recompute status from outstanding balance & due date(s). When an
    invoice has a split installment schedule, it's overdue if ANY
    installment is past due and not fully paid — not just the final date.
    Voided invoices are left untouched — they're excluded from active
    reporting entirely, not given a "paid"/"overdue" status."""
    if invoice.is_voided:
        return

    if invoice.outstanding_amount <= 0:
        invoice.status = models.InvoiceStatus.paid
        return

    if invoice.installments:
        is_overdue = any(i.status == "overdue" for i in invoice.installments)
    else:
        is_overdue = date.today() > invoice.due_date

    if invoice.outstanding_amount < invoice.amount:
        invoice.status = models.InvoiceStatus.overdue if is_overdue else models.InvoiceStatus.partial
    else:
        invoice.status = models.InvoiceStatus.overdue if is_overdue else models.InvoiceStatus.outstanding


def _to_out(invoice: models.Invoice) -> schemas.InvoiceOut:
    retailer = invoice.retailer
    return schemas.InvoiceOut(
        id=invoice.id,
        retailer_id=invoice.retailer_id,
        retailer_name=retailer.name if retailer else None,
        retailer_owner_name=retailer.owner_name if retailer else None,
        retailer_gstin=retailer.gstin if retailer else None,
        invoice_number=invoice.invoice_number,
        invoice_date=invoice.invoice_date,
        amount=invoice.amount,
        credit_days=invoice.credit_days,
        due_date=invoice.due_date,
        status=invoice.status,
        outstanding_amount=invoice.outstanding_amount,
        is_disputed=invoice.is_disputed,
        is_voided=invoice.is_voided,
        void_reason=invoice.void_reason,
        installments=invoice.installments,
    )


@router.post("", response_model=schemas.InvoiceOut)
def create_invoice(
    payload: schemas.InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    retailer = db.query(models.Retailer).filter(models.Retailer.id == payload.retailer_id).first()
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found")

    if payload.installments:
        total_installments = sum(i.amount for i in payload.installments)
        if abs(total_installments - payload.amount) > 0.01:
            raise HTTPException(
                status_code=400,
                detail=f"Installment amounts (₹{total_installments}) must add up to the invoice total (₹{payload.amount})",
            )

    get_or_create_link(db, current_user.business_id, payload.retailer_id, models.LinkSource.invoice)

    invoice = models.Invoice(
        business_id=current_user.business_id,
        retailer_id=payload.retailer_id,
        invoice_number=payload.invoice_number,
        invoice_date=payload.invoice_date,
        amount=payload.amount,
        credit_days=payload.credit_days,
        due_date_override=payload.due_date_override,
        remarks=payload.remarks,
        outstanding_amount=payload.amount,
    )
    db.add(invoice)
    db.flush()

    if payload.installments:
        for idx, inst in enumerate(payload.installments, start=1):
            db.add(
                models.Installment(
                    invoice_id=invoice.id, sequence=idx, due_date=inst.due_date, amount=inst.amount
                )
            )
        db.flush()
        db.refresh(invoice)

    refresh_invoice_status(invoice)
    db.commit()
    db.refresh(invoice)

    log_invoice_action(
        db, invoice, models.AuditAction.created, business_user_id=current_user.id,
        note=f"Invoice {invoice.invoice_number} created for ₹{invoice.amount}",
    )

    recalculate_credit_score(db, payload.retailer_id)  # a new invoice can shift vintage/utilization pillars
    db.refresh(invoice)
    return _to_out(invoice)


@router.get("", response_model=List[schemas.InvoiceOut])
def list_invoices(
    retailer_id: Optional[str] = None,
    retailer_q: Optional[str] = Query(None, description="Search by retailer Firm Name or GSTIN"),
    status: Optional[models.InvoiceStatus] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    include_voided: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Advanced filtering: retailer (exact id or free-text Firm Name/GSTIN
    search), payment status, and an invoice-date range. Voided invoices are
    excluded by default — pass include_voided=true to see them (e.g. for an
    audit view).
    """
    query = db.query(models.Invoice).filter(models.Invoice.business_id == current_user.business_id)
    if not include_voided:
        query = query.filter(models.Invoice.is_voided == False)  # noqa: E712
    if retailer_id:
        query = query.filter(models.Invoice.retailer_id == retailer_id)
    if retailer_q:
        like = f"%{retailer_q}%"
        query = query.join(models.Retailer).filter(
            or_(models.Retailer.name.ilike(like), models.Retailer.gstin.ilike(like))
        )
    if status:
        query = query.filter(models.Invoice.status == status)
    if date_from:
        query = query.filter(models.Invoice.invoice_date >= date_from)
    if date_to:
        query = query.filter(models.Invoice.invoice_date <= date_to)

    invoices = query.order_by(models.Invoice.invoice_date.desc()).all()
    for inv in invoices:
        refresh_invoice_status(inv)
    db.commit()
    return [_to_out(inv) for inv in invoices]


@router.get("/{invoice_id}/audit-log", response_model=List[schemas.InvoiceAuditLogOut])
def get_invoice_audit_log(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Status history tracker — every edit, void, and dispute-driven
    correction made to this invoice, most recent first."""
    invoice = (
        db.query(models.Invoice)
        .filter(models.Invoice.id == invoice_id, models.Invoice.business_id == current_user.business_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    return [
        schemas.InvoiceAuditLogOut(
            id=entry.id,
            action=entry.action.value,
            field_changes=entry.field_changes,
            note=entry.note,
            created_at=entry.created_at,
            actor_name=entry.business_user.name if entry.business_user else None,
        )
        for entry in invoice.audit_logs
    ]


@router.put("/{invoice_id}", response_model=schemas.InvoiceOut)
def edit_invoice(
    invoice_id: str,
    payload: schemas.InvoiceUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Modify a draft/unpaid invoice's details (number, date, amount, credit
    terms, remarks). A fully paid invoice can't be edited UNLESS it's
    currently under an open dispute — that's the one case where correcting
    a paid bill is legitimate (e.g. the amount itself was wrong). Pass
    resolve_dispute_note to also resolve that dispute in the same call.
    """
    invoice = (
        db.query(models.Invoice)
        .filter(models.Invoice.id == invoice_id, models.Invoice.business_id == current_user.business_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.is_voided:
        raise HTTPException(status_code=400, detail="This invoice has been voided and can't be edited")
    if invoice.status == models.InvoiceStatus.paid and not invoice.is_disputed:
        raise HTTPException(
            status_code=400,
            detail="This invoice is fully paid and can't be edited. If something is wrong with it, "
            "the retailer (or you) can raise a dispute first, which unlocks editing.",
        )

    data = payload.model_dump(exclude_unset=True, exclude={"resolve_dispute_note"})
    before = {f: getattr(invoice, f) for f in data}

    paid_so_far = invoice.amount - invoice.outstanding_amount
    for field, value in data.items():
        setattr(invoice, field, value)
    if "amount" in data:
        invoice.outstanding_amount = max(0.0, invoice.amount - paid_so_far)

    refresh_invoice_status(invoice)

    summary = diff_summary(before, data)
    resolved_dispute = None

    if payload.resolve_dispute_note is not None and invoice.is_disputed:
        open_dispute = (
            db.query(models.Dispute)
            .filter(models.Dispute.invoice_id == invoice.id, models.Dispute.status == models.DisputeStatus.open)
            .first()
        )
        if open_dispute:
            resolved_dispute = _resolve_dispute_internal(
                db, open_dispute, current_user, "resolve", payload.resolve_dispute_note
            )
            log_invoice_action(
                db, invoice, models.AuditAction.dispute_resolved_via_edit, business_user_id=current_user.id,
                field_changes=summary, note=payload.resolve_dispute_note,
            )
        else:
            log_invoice_action(
                db, invoice, models.AuditAction.modified, business_user_id=current_user.id, field_changes=summary,
            )
    else:
        log_invoice_action(
            db, invoice, models.AuditAction.modified, business_user_id=current_user.id, field_changes=summary,
        )

    db.commit()
    db.refresh(invoice)

    if not resolved_dispute:
        recalculate_credit_score(db, invoice.retailer_id)
        db.refresh(invoice)

    return _to_out(invoice)


@router.delete("/{invoice_id}")
def void_invoice(
    invoice_id: str,
    payload: schemas.VoidInvoiceRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_owner_or_admin),
):
    """
    Voids (soft-deletes) an incorrect invoice. The record is kept — not hard
    deleted — with a full audit trail entry, so there's always a paper trail
    for why a bill was removed from active reporting. Voided invoices are
    excluded from balances, dashboards, and credit scoring, but remain
    visible with include_voided=true for auditing.
    """
    invoice = (
        db.query(models.Invoice)
        .filter(models.Invoice.id == invoice_id, models.Invoice.business_id == current_user.business_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.is_voided:
        raise HTTPException(status_code=400, detail="This invoice is already voided")
    if not payload.reason or not payload.reason.strip():
        raise HTTPException(status_code=400, detail="A reason is required to void an invoice")

    retailer_id = invoice.retailer_id
    invoice.is_voided = True
    invoice.void_reason = payload.reason
    invoice.voided_at = datetime.utcnow()

    log_invoice_action(
        db, invoice, models.AuditAction.voided, business_user_id=current_user.id, note=payload.reason,
    )

    db.commit()
    recalculate_credit_score(db, retailer_id)
    return {"message": "Invoice voided", "invoice_id": invoice_id}
