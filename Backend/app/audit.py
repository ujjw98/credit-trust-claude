from sqlalchemy.orm import Session

from app import models

# Fields worth reporting in a human-readable diff when an invoice is edited.
# Amount is currency-formatted; dates and text fields are shown as-is.
_TRACKED_FIELDS = {
    "invoice_number": "Invoice number",
    "invoice_date": "Invoice date",
    "amount": "Amount",
    "credit_days": "Credit days",
    "due_date_override": "Due date override",
    "remarks": "Remarks",
}


def diff_summary(before: dict, after: dict) -> str:
    """Builds a human-readable 'field: old -> new' summary for the fields
    that actually changed. Used for the invoice's status history tracker."""
    lines = []
    for field, label in _TRACKED_FIELDS.items():
        if field not in after:
            continue
        old_val = before.get(field)
        new_val = after[field]
        if old_val != new_val:
            lines.append(f"{label}: {old_val} → {new_val}")
    return "; ".join(lines) if lines else "No field changes"


def log_invoice_action(
    db: Session,
    invoice: models.Invoice,
    action: models.AuditAction,
    business_user_id: str = None,
    field_changes: str = None,
    note: str = None,
) -> models.InvoiceAuditLog:
    entry = models.InvoiceAuditLog(
        invoice_id=invoice.id,
        business_user_id=business_user_id,
        action=action,
        field_changes=field_changes,
        note=note,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
