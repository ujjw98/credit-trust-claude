from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas, auth
from app.scoring import recalculate_credit_score
from app.notifications import notify

router = APIRouter(prefix="/disputes", tags=["Wholesaler — Dispute Resolution"])


@router.get("", response_model=List[schemas.DisputeOut])
def list_disputes(
    status: Optional[models.DisputeStatus] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Disputes raised by retailers against invoices issued by MY business."""
    query = (
        db.query(models.Dispute)
        .join(models.Invoice)
        .filter(models.Invoice.business_id == current_user.business_id)
    )
    if status:
        query = query.filter(models.Dispute.status == status)
    return query.order_by(models.Dispute.created_at.desc()).all()


def _resolve_dispute_internal(
    db: Session, dispute: models.Dispute, current_user: models.User, action: str, resolution_note: Optional[str]
) -> models.Dispute:
    """Shared resolution logic used by both the standalone dispute-resolve
    endpoint and the 'resolve while editing the bill' flow on invoices."""
    if dispute.status != models.DisputeStatus.open:
        raise HTTPException(status_code=400, detail="Dispute has already been resolved")
    if action not in ("resolve", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'resolve' or 'reject'")

    dispute.status = models.DisputeStatus.resolved if action == "resolve" else models.DisputeStatus.rejected
    dispute.resolution_note = resolution_note
    dispute.resolved_at = datetime.utcnow()

    invoice = dispute.invoice
    invoice.is_disputed = False

    db.commit()
    db.refresh(dispute)

    recalculate_credit_score(db, invoice.retailer_id)

    notify(
        db,
        recipient_type=models.RecipientType.retailer,
        recipient_id=invoice.retailer_id,
        type_=(
            models.NotificationType.dispute_resolved
            if action == "resolve"
            else models.NotificationType.dispute_rejected
        ),
        title=f"Dispute on invoice {invoice.invoice_number} {dispute.status.value}",
        message=(resolution_note or f"{current_user.business.name} marked this dispute as {dispute.status.value}."),
        invoice_id=invoice.id,
        dispute_id=dispute.id,
    )

    return dispute


@router.put("/{dispute_id}/resolve", response_model=schemas.DisputeOut)
def resolve_dispute(
    dispute_id: str,
    payload: schemas.DisputeResolve,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_owner_or_admin),
):
    """
    action='resolve' -> dispute was valid (e.g. wrong bill, or payment cleared
        but not marked). The wholesaler should also correct the underlying
        invoice/payment record via the normal invoice/payment endpoints — or
        use PUT /invoices/{id} with resolve_dispute_note set, which edits the
        bill and resolves the dispute in one call.
    action='reject' -> dispute was invalid, the original bill stands as-is,
        and it re-enters credit scoring unchanged.
    """
    dispute = (
        db.query(models.Dispute)
        .join(models.Invoice)
        .filter(models.Dispute.id == dispute_id, models.Invoice.business_id == current_user.business_id)
        .first()
    )
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")

    return _resolve_dispute_internal(db, dispute, current_user, payload.action, payload.resolution_note)
