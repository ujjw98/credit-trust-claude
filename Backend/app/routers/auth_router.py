import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas, auth

router = APIRouter(prefix="/auth", tags=["Auth & Business Registration"])


@router.post("/register", response_model=schemas.BusinessOut)
def register_business(payload: schemas.BusinessRegister, db: Session = Depends(get_db)):
    existing = (
        db.query(models.Business)
        .filter(
            (models.Business.gst_number == payload.gst_number)
            | (models.Business.drug_license_number == payload.drug_license_number)
            | (models.Business.mobile == payload.mobile)
            | (models.Business.email == payload.email)
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Business with this GST/Drug License/Mobile/Email already exists")

    business = models.Business(
        name=payload.business_name,
        gst_number=payload.gst_number,
        drug_license_number=payload.drug_license_number,
        owner_name=payload.owner_name,
        mobile=payload.mobile,
        email=payload.email,
        address_line=payload.address_line,
        city=payload.city,
        state=payload.state,
        pincode=payload.pincode,
        is_verified=False,
    )
    db.add(business)
    db.flush()

    otp = f"{random.randint(100000, 999999)}"
    owner_user = models.User(
        business_id=business.id,
        name=payload.owner_name,
        role=models.RoleEnum.owner,
        mobile=payload.mobile,
        email=payload.email,
        hashed_password=auth.hash_password(payload.password),
        otp_code=otp,
        is_active=False,
    )
    db.add(owner_user)
    db.commit()
    db.refresh(business)

    # NOTE: In production this OTP would be sent via SMS provider.
    # Returned here only so the MVP can be tested end-to-end without SMS integration.
    print(f"[DEV OTP] mobile={payload.mobile} otp={otp}")

    return business


@router.post("/verify-otp")
def verify_otp(payload: schemas.OTPVerify, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.mobile == payload.mobile).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.otp_code != payload.otp_code:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    user.is_active = True
    user.otp_code = None
    business = db.query(models.Business).filter(models.Business.id == user.business_id).first()
    business.is_verified = True
    db.commit()
    return {"message": "Business verified successfully. You can now log in."}


@router.post("/login", response_model=schemas.Token)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.mobile == payload.mobile).first()
    if not user or not auth.verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid mobile or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account not verified. Please complete OTP verification.")

    token = auth.create_access_token({"sub": user.id, "typ": "business"})
    return schemas.Token(access_token=token)


@router.post("/invite-staff", response_model=schemas.UserOut)
def invite_staff(
    payload: schemas.InviteStaff,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_owner_or_admin),
):
    existing = db.query(models.User).filter(models.User.mobile == payload.mobile).first()
    if existing:
        raise HTTPException(status_code=400, detail="A user with this mobile already exists")

    staff = models.User(
        business_id=current_user.business_id,
        name=payload.name,
        role=models.RoleEnum.staff,
        mobile=payload.mobile,
        email=payload.email,
        hashed_password=auth.hash_password(payload.password),
        is_active=True,  # staff invited by a verified owner don't need OTP
    )
    db.add(staff)
    db.commit()
    db.refresh(staff)
    return staff


@router.get("/me", response_model=schemas.UserOut)
def get_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user


@router.get("/business-profile", response_model=schemas.BusinessOut)
def get_business_profile(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """The wholesaler's own business profile — bug fix: this was previously
    unreachable from the UI (no route/nav item existed)."""
    business = db.query(models.Business).filter(models.Business.id == current_user.business_id).first()
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    return business


@router.put("/business-profile", response_model=schemas.BusinessOut)
def update_business_profile(
    payload: schemas.BusinessUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_owner_or_admin),
):
    business = db.query(models.Business).filter(models.Business.id == current_user.business_id).first()
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    if payload.email:
        conflict = (
            db.query(models.Business)
            .filter(models.Business.email == payload.email, models.Business.id != business.id)
            .first()
        )
        if conflict:
            raise HTTPException(status_code=400, detail="Another business already uses this email")

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(business, field, value)

    db.commit()
    db.refresh(business)
    return business
