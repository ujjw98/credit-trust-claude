from sqlalchemy.orm import Session

from app import models


def notify(
    db: Session,
    recipient_type: models.RecipientType,
    recipient_id: str,
    type_: models.NotificationType,
    title: str,
    message: str,
    invoice_id: str = None,
    dispute_id: str = None,
) -> models.Notification:
    n = models.Notification(
        recipient_type=recipient_type,
        recipient_id=recipient_id,
        type=type_,
        title=title,
        message=message,
        related_invoice_id=invoice_id,
        related_dispute_id=dispute_id,
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return n
