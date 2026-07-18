from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas, auth

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=schemas.NotificationSummary)
def list_notifications(
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    query = db.query(models.Notification).filter(
        models.Notification.recipient_type == models.RecipientType.business,
        models.Notification.recipient_id == current_user.business_id,
    )
    if unread_only:
        query = query.filter(models.Notification.is_read.is_(False))

    notifications = query.order_by(models.Notification.created_at.desc()).limit(100).all()
    unread_count = (
        db.query(models.Notification)
        .filter(
            models.Notification.recipient_type == models.RecipientType.business,
            models.Notification.recipient_id == current_user.business_id,
            models.Notification.is_read.is_(False),
        )
        .count()
    )
    return schemas.NotificationSummary(unread_count=unread_count, notifications=notifications)


@router.put("/{notification_id}/read", response_model=schemas.NotificationOut)
def mark_read(
    notification_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    n = (
        db.query(models.Notification)
        .filter(
            models.Notification.id == notification_id,
            models.Notification.recipient_type == models.RecipientType.business,
            models.Notification.recipient_id == current_user.business_id,
        )
        .first()
    )
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    db.commit()
    db.refresh(n)
    return n


@router.put("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    db.query(models.Notification).filter(
        models.Notification.recipient_type == models.RecipientType.business,
        models.Notification.recipient_id == current_user.business_id,
        models.Notification.is_read.is_(False),
    ).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read"}
