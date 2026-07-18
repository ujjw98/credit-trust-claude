from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, ConfigDict

from app.models import RoleEnum, InvoiceStatus, RiskLevel, DisputeStatus


# ---------- Auth / Business ----------
class BusinessRegister(BaseModel):
    business_name: str
    gst_number: str
    drug_license_number: str
    owner_name: str
    mobile: str
    email: EmailStr
    address_line: str
    city: str
    state: str
    pincode: str
    password: str


class OTPVerify(BaseModel):
    mobile: str
    otp_code: str


class LoginRequest(BaseModel):
    mobile: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    role: RoleEnum
    mobile: str
    email: Optional[str] = None
    is_active: bool


class InviteStaff(BaseModel):
    name: str
    mobile: str
    email: Optional[EmailStr] = None
    password: str


class BusinessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    gst_number: str
    drug_license_number: str
    owner_name: str
    mobile: str
    email: str
    address_line: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    is_verified: bool


class BusinessUpdate(BaseModel):
    name: Optional[str] = None
    owner_name: Optional[str] = None
    email: Optional[EmailStr] = None
    address_line: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None


# ---------- Retailer ----------
class RCSBreakdown(BaseModel):
    """Proprietary Retailer Credit Score (300-900 scale). See app/scoring.py
    for the full pillar weighting."""
    rcs_score: int
    tier: str  # 'excellent' | 'strained' | 'risk'
    payment_points: int    # /240
    utilization_points: int  # /180
    vintage_points: int    # /90
    returns_points: int    # /90
    utilization_pct: Optional[float] = None  # null = no credit limit set anywhere yet
    average_delay_days: float
    bounced_count_12m: int
    return_rate_pct: float
    reporting_businesses: int


TIER_LABEL = {"low": "excellent", "medium": "strained", "high": "risk"}


class RetailerCreate(BaseModel):
    name: str
    gstin: Optional[str] = None
    drug_license: Optional[str] = None
    owner_name: Optional[str] = None
    mobile: Optional[str] = None
    address_line: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None


class RetailerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    gstin: Optional[str] = None
    drug_license: Optional[str] = None
    owner_name: Optional[str] = None
    mobile: Optional[str] = None
    address_line: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None


class RetailerListItem(RetailerOut):
    """Retailer as shown in a wholesaler's own linked-retailers list."""
    credit_limit: Optional[float] = None
    rcs_score: Optional[int] = None
    tier: Optional[str] = None


class RetailerGlobalSearchResult(RetailerOut):
    """Retailer as shown in the platform-wide search — includes every
    registered retailer, not just ones this wholesaler already has a
    relationship with. is_linked tells the UI whether this is already in
    'my retailers' or a new discovery."""
    is_linked: bool
    rcs_score: Optional[int] = None
    tier: Optional[str] = None


class RetailerProfile(BaseModel):
    retailer: RetailerOut
    total_purchase: float
    outstanding: float
    average_delay: float
    paid_invoices: int
    overdue_invoices: int
    rcs: Optional[RCSBreakdown] = None
    total_suppliers: int          # distinct wholesalers this retailer currently buys from
    payment_default_count: int    # overdue invoices (ever) + bounced payments, across all wholesalers
    credit_limit: Optional[float] = None  # limit set by the CURRENT wholesaler for this retailer


class SetCreditLimit(BaseModel):
    credit_limit: float


# ---------- Installments / Flexible Credit Terms ----------
class InstallmentInput(BaseModel):
    due_date: date
    amount: float


class InstallmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    sequence: int
    due_date: date
    amount: float
    paid_amount: float
    status: str  # 'pending' | 'partial' | 'paid' | 'overdue'


# ---------- Invoice ----------
class InvoiceCreate(BaseModel):
    retailer_id: str
    invoice_number: str
    invoice_date: date
    amount: float
    credit_days: int = 30
    due_date_override: Optional[date] = None  # custom single due date, e.g. "due in May" instead of Net-30
    installments: Optional[List[InstallmentInput]] = None  # split schedule; overrides credit_days/due_date_override
    remarks: Optional[str] = None


class InvoiceUpdate(BaseModel):
    invoice_number: Optional[str] = None
    invoice_date: Optional[date] = None
    amount: Optional[float] = None
    credit_days: Optional[int] = None
    due_date_override: Optional[date] = None
    remarks: Optional[str] = None
    resolve_dispute_note: Optional[str] = None  # if set and the invoice has an open dispute, resolves it in the same call


class VoidInvoiceRequest(BaseModel):
    reason: str


class InvoiceAuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    action: str
    field_changes: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime
    actor_name: Optional[str] = None


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    retailer_id: str
    retailer_name: Optional[str] = None
    retailer_owner_name: Optional[str] = None
    retailer_gstin: Optional[str] = None
    invoice_number: str
    invoice_date: date
    amount: float
    credit_days: int
    due_date: date
    status: InvoiceStatus
    outstanding_amount: float
    is_disputed: bool = False
    is_voided: bool = False
    void_reason: Optional[str] = None
    installments: List[InstallmentOut] = []


# ---------- Payment ----------
class PaymentCreate(BaseModel):
    invoice_id: str
    amount: float
    payment_date: date
    reference_number: Optional[str] = None
    bounced: bool = False
    installment_id: Optional[str] = None  # apply to a specific installment; omit to auto-apply oldest-first


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    invoice_id: str
    installment_id: Optional[str] = None
    settlement_id: Optional[str] = None
    amount: float
    payment_date: date
    reference_number: Optional[str] = None
    delay_days: int
    bounced: bool
    retailer_name: Optional[str] = None


# ---------- Bulk Settlement ----------
class BulkAllocation(BaseModel):
    invoice_id: str
    amount: float


class BulkSettlementCreate(BaseModel):
    retailer_id: str
    payment_date: date
    reference_number: Optional[str] = None
    allocations: List[BulkAllocation]  # which invoices this single payment covers, and how much of each


class BulkSettlementResult(BaseModel):
    settlement_id: str
    total_amount: float
    payments: List[PaymentOut]


# ---------- Credit Notes (Returns) ----------
class CreditNoteCreate(BaseModel):
    invoice_id: str
    amount: float
    reason: str  # 'expired_stock' | 'damaged_goods' | 'wrong_item' | 'other'
    note: Optional[str] = None


class CreditNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    invoice_id: str
    invoice_number: Optional[str] = None
    retailer_name: Optional[str] = None
    amount: float
    reason: str
    note: Optional[str] = None
    created_at: datetime


# ---------- Dashboard ----------
class RecentActivityItem(BaseModel):
    type: str
    invoice_id: str
    retailer_id: str
    retailer_name: str
    amount: float
    date: str
    bounced: bool = False


class DashboardSummary(BaseModel):
    total_credit_outstanding: float
    invoices_due_today: int
    overdue_amount: float
    unique_retailers_billed: int   # distinct retailers with at least one invoice from you
    total_invoices: int             # total invoice count — separate from unique retailers, on purpose
    collection_rate: float
    recent_activity: List[RecentActivityItem]


# ---------- Search ----------
class RetailerSearchResult(BaseModel):
    business_name: str
    rcs: Optional[RCSBreakdown] = None


# ---------- Retailer self-registration / portal ----------
class RetailerUserRegister(BaseModel):
    retailer_name: str
    gstin: Optional[str] = None
    drug_license: Optional[str] = None
    owner_name: Optional[str] = None
    address_line: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    contact_name: str
    mobile: str
    email: Optional[EmailStr] = None
    password: str


class RetailerUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    retailer_id: str
    name: str
    mobile: str
    email: Optional[str] = None
    is_active: bool


class RetailerUserRegisterResponse(BaseModel):
    retailer_user: RetailerUserOut
    retailer: RetailerOut
    linked_to_existing_retailer: bool


class RetailerPortalInvoiceOut(BaseModel):
    id: str
    wholesaler_name: str
    invoice_number: str
    invoice_date: date
    amount: float
    outstanding_amount: float
    status: InvoiceStatus
    due_date: date
    is_disputed: bool
    is_voided: bool = False
    installments: List[InstallmentOut] = []


class RetailerPortalDashboard(BaseModel):
    retailer_name: str
    rcs: Optional[RCSBreakdown] = None
    reporting_wholesalers: int
    total_outstanding: float
    total_invoices: int
    open_disputes: int


# ---------- Disputes ----------
class DisputeCreate(BaseModel):
    reason: str  # 'wrong_bill' | 'payment_not_marked' | 'wrong_amount' | 'other'
    description: Optional[str] = None


class DisputeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    invoice_id: str
    reason: str
    description: Optional[str] = None
    status: DisputeStatus
    resolution_note: Optional[str] = None
    created_at: datetime


class DisputeResolve(BaseModel):
    action: str  # 'resolve' (dispute upheld, bill/payment was fixed) | 'reject' (bill stands)
    resolution_note: Optional[str] = None


# ---------- Notifications ----------
class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    type: str
    title: str
    message: str
    related_invoice_id: Optional[str] = None
    related_dispute_id: Optional[str] = None
    is_read: bool
    created_at: datetime


class NotificationSummary(BaseModel):
    unread_count: int
    notifications: List[NotificationOut]
