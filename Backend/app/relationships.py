from sqlalchemy.orm import Session

from app import models


def get_or_create_link(
    db: Session, business_id: str, retailer_id: str, source: models.LinkSource
) -> tuple[models.RetailerLink, bool]:
    """Returns (link, created). A link represents a real business relationship —
    it must never be created just because a retailer registered or exists in
    the system; only explicit actions (adding, viewing a profile, billing)
    establish it."""
    link = (
        db.query(models.RetailerLink)
        .filter(models.RetailerLink.business_id == business_id, models.RetailerLink.retailer_id == retailer_id)
        .first()
    )
    if link:
        return link, False

    link = models.RetailerLink(business_id=business_id, retailer_id=retailer_id, source=source)
    db.add(link)
    db.commit()
    db.refresh(link)
    return link, True
