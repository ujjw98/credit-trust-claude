from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas, auth, scoring

router = APIRouter(prefix="/network-search", tags=["Industry-Wide Retailer Search"])


@router.get("", response_model=schemas.RetailerSearchResult)
def search_network(
    gstin: Optional[str] = None,
    drug_license: Optional[str] = None,
    name: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Search the shared industry network for a retailer's payment behaviour.
    Privacy rule (BRD): only payment behaviour (the RCS breakdown) is shared
    by default. Outstanding amounts are only shown for businesses on the
    premium plan. This lookup does NOT establish a relationship — it's an
    anonymized informational check, unlike viewing a full retailer profile.
    """
    query = db.query(models.Retailer)
    if gstin:
        query = query.filter(models.Retailer.gstin == gstin)
    elif drug_license:
        query = query.filter(models.Retailer.drug_license == drug_license)
    elif name:
        query = query.filter(models.Retailer.name.ilike(f"%{name}%"))
    else:
        raise HTTPException(status_code=400, detail="Provide gstin, drug_license, or name")

    retailer = query.first()
    if not retailer:
        raise HTTPException(status_code=404, detail="No matching retailer found in the network")

    cs = retailer.credit_score
    return schemas.RetailerSearchResult(
        business_name=retailer.name,
        rcs=schemas.RCSBreakdown(**scoring.to_breakdown(cs)) if cs else None,
    )
