import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas, auth

router = APIRouter(prefix="/retailer-auth", tags=["Retailer Portal — Auth"])


@router.post("/register", response_model=schemas.RetailerUserRegisterResponse)
def register_retailer_user(payload: schemas.RetailerUserRegister, db: Session = Depends(get_db)):
    """
    Lets a RETAILER (not a wholesaler) create their own login to the platform.

    This is the piece that lets a retailer independently check which
    wholesalers have billed them and whether their cleared payments were
    actually marked as such — instead of only trusting the wholesaler's data.

    If a Retailer record with matching GST/Drug License already exists
    (created earlier by a wholesaler adding them), the new portal login is
    linked to that existing record so the retailer sees their real history.
    Otherwise a fresh Retailer record is created.
    """
    if db.query(models.RetailerUser).filter(models.RetailerUser.mobile == payload.mobile).first():
        raise HTTPException(status_code=400, detail="A retailer account with this mobile already exists")

    retailer = None
    if payload.gstin:
        retailer = db.query(models.Retailer).filter(models.Retailer.gstin == payload.gstin).first()
    if not retailer and payload.drug_license:
        retailer = db.query(models.Retailer).filter(models.Retailer.drug_license == payload.drug_license).first()

    linked_to_existing = retailer is not None

    if not retailer:
        retailer = models.Retailer(
            name=payload.retailer_name,
            gstin=payload.gstin,
            drug_license=payload.drug_license,
            owner_name=payload.owner_name,
            mobile=payload.mobile,
            address_line=payload.address_line,
            city=payload.city,
            state=payload.state,
            pincode=payload.pincode,
        )
        db.add(retailer)
        db.flush()

    otp = f"{random.randint(100000, 999999)}"
    retailer_user = models.RetailerUser(
        retailer_id=retailer.id,
        name=payload.contact_name,
        mobile=payload.mobile,
        email=payload.email,
        hashed_password=auth.hash_password(payload.password),
        otp_code=otp,
        is_active=False,
    )
    db.add(retailer_user)
    db.commit()
    db.refresh(retailer_user)
    db.refresh(retailer)

    # NOTE: sent via SMS provider in production; printed here so the MVP can be tested without SMS.
    print(f"[DEV OTP] retailer mobile={payload.mobile} otp={otp}")

    return schemas.RetailerUserRegisterResponse(
        retailer_user=retailer_user,
        retailer=retailer,
        linked_to_existing_retailer=linked_to_existing,
    )


@router.post("/verify-otp")
def verify_retailer_otp(payload: schemas.OTPVerify, db: Session = Depends(get_db)):
    retailer_user = db.query(models.RetailerUser).filter(models.RetailerUser.mobile == payload.mobile).first()
    if not retailer_user:
        raise HTTPException(status_code=404, detail="Retailer account not found")
    if retailer_user.otp_code != payload.otp_code:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    retailer_user.is_active = True
    retailer_user.otp_code = None
    db.commit()
    return {"message": "Retailer account verified. You can now log in."}


@router.post("/login", response_model=schemas.Token)
def retailer_login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    retailer_user = db.query(models.RetailerUser).filter(models.RetailerUser.mobile == payload.mobile).first()
    if not retailer_user or not auth.verify_password(payload.password, retailer_user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid mobile or password")
    if not retailer_user.is_active:
        raise HTTPException(status_code=403, detail="Account not verified. Please complete OTP verification.")

    token = auth.create_access_token({"sub": retailer_user.id, "typ": "retailer"})
    return schemas.Token(access_token=token)


@router.get("/me", response_model=schemas.RetailerUserOut)
def get_retailer_me(current_retailer_user: models.RetailerUser = Depends(auth.get_current_retailer_user)):
    return current_retailer_user
