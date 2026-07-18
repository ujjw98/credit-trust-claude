import enum
import uuid
from datetime import datetime, date

from sqlalchemy import (
    Column, String, Integer, Float, Date, DateTime, ForeignKey, Enum, Boolean, Text, UniqueConstraint
)
from sqlalchemy.orm import relationship

from app.database import Base


def gen_id():
    return str(uuid.uuid4())


class RoleEnum(str, enum.Enum):
    admin = "admin"
    owner = "owner"
    staff = "staff"


class InvoiceStatus(str, enum.Enum):
    outstanding = "outstanding"
    paid = "paid"
    partial = "partial"
    overdue = "overdue"


class RiskLevel(str, enum.Enum):
    low = "low"        # displayed as "Excellent"
    medium = "medium"  # displayed as "Strained"
    high = "high"      # displayed as "Risk"


class LinkSource(str, enum.Enum):
    """How a wholesaler<->retailer relationship was established. Registration
    alone never creates a link — a relationship must be initiated."""
    explicit_add = "explicit_add"   # wholesaler manually added the retailer
    profile_view = "profile_view"   # wholesaler looked up the retailer's profile
    invoice = "invoice"             # wholesaler billed the retailer


class DisputeStatus(str, enum.Enum):
    open = "open"
    resolved = "resolved"      # dispute upheld -> bill/payment record was fixed
    rejected = "rejected"      # dispute rejected -> original bill stands


class AuditAction(str, enum.Enum):
    created = "created"
    modified = "modified"
    voided = "voided"
    dispute_resolved_via_edit = "dispute_resolved_via_edit"


class RecipientType(str, enum.Enum):
    business = "business"
    retailer = "retailer"


class NotificationType(str, enum.Enum):
    dispute_raised = "dispute_raised"
    dispute_resolved = "dispute_resolved"
    dispute_rejected = "dispute_rejected"
    invoice_due = "invoice_due"
    invoice_overdue = "invoice_overdue"
    payment_received = "payment_received"
    credit_note_issued = "credit_note_issued"


class Business(Base):
    __tablename__ = "businesses"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    gst_number = Column(String, unique=True, index=True, nullable=False)
    drug_license_number = Column(String, unique=True, index=True, nullable=False)
    owner_name = Column(String, nullable=False)
    mobile = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    address_line = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    pincode = Column(String, nullable=True)
    is_verified = Column(Boolean, default=False)
    sharing_plan = Column(String, default="default")  # 'default' (private) or 'premium'
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="business")
    invoices = relationship("Invoice", back_populates="business")


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_id)
    business_id = Column(String, ForeignKey("businesses.id"), nullable=False)
    name = Column(String, nullable=False)
    role = Column(Enum(RoleEnum), default=RoleEnum.owner)
    mobile = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String, nullable=False)
    otp_code = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    business = relationship("Business", back_populates="users")


class Retailer(Base):
    __tablename__ = "retailers"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    gstin = Column(String, unique=True, index=True, nullable=True)
    drug_license = Column(String, unique=True, index=True, nullable=True)
    owner_name = Column(String, nullable=True)
    mobile = Column(String, nullable=True)
    address_line = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    pincode = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    invoices = relationship("Invoice", back_populates="retailer")
    credit_score = relationship("CreditScore", back_populates="retailer", uselist=False)
    portal_users = relationship("RetailerUser", back_populates="retailer")


class RetailerUser(Base):
    """A retailer-side login account. Lets a retailer self-register and log in to
    check which wholesalers have issued bills against their name, and verify that
    cleared payments are actually marked as such — independent of any wholesaler."""

    __tablename__ = "retailer_users"

    id = Column(String, primary_key=True, default=gen_id)
    retailer_id = Column(String, ForeignKey("retailers.id"), nullable=False)
    name = Column(String, nullable=False)
    mobile = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String, nullable=False)
    otp_code = Column(String, nullable=True)
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    retailer = relationship("Retailer", back_populates="portal_users")


class RetailerLink(Base):
    """The actual business relationship between a wholesaler and a retailer.
    Registering a retailer (or a retailer self-registering) does NOT create
    this — a link is only created when a wholesaler explicitly adds the
    retailer, looks up their profile, or bills them. A wholesaler's retailer
    list is everyone THEY have a link with, not every retailer on the
    platform. credit_limit is set per-relationship, since each wholesaler
    extends its own credit line to a retailer."""

    __tablename__ = "retailer_links"

    id = Column(String, primary_key=True, default=gen_id)
    business_id = Column(String, ForeignKey("businesses.id"), nullable=False)
    retailer_id = Column(String, ForeignKey("retailers.id"), nullable=False)
    credit_limit = Column(Float, nullable=True)
    source = Column(Enum(LinkSource), default=LinkSource.explicit_add)
    created_at = Column(DateTime, default=datetime.utcnow)

    business = relationship("Business")
    retailer = relationship("Retailer")

    __table_args__ = (UniqueConstraint("business_id", "retailer_id", name="uq_business_retailer_link"),)


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(String, primary_key=True, default=gen_id)
    business_id = Column(String, ForeignKey("businesses.id"), nullable=False)
    retailer_id = Column(String, ForeignKey("retailers.id"), nullable=False)
    invoice_number = Column(String, nullable=False)
    invoice_date = Column(Date, nullable=False)
    amount = Column(Float, nullable=False)
    credit_days = Column(Integer, default=30)
    due_date_override = Column(Date, nullable=True)  # custom window, e.g. "due in May" instead of Net-30
    remarks = Column(Text, nullable=True)
    status = Column(Enum(InvoiceStatus), default=InvoiceStatus.outstanding)
    outstanding_amount = Column(Float, nullable=False)
    is_disputed = Column(Boolean, default=False)
    is_voided = Column(Boolean, default=False)
    void_reason = Column(Text, nullable=True)
    voided_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    business = relationship("Business", back_populates="invoices")
    retailer = relationship("Retailer", back_populates="invoices")
    payments = relationship("Payment", back_populates="invoice")
    disputes = relationship("Dispute", back_populates="invoice")
    installments = relationship(
        "Installment", back_populates="invoice", order_by="Installment.sequence", cascade="all, delete-orphan"
    )
    credit_notes = relationship("CreditNote", back_populates="invoice")
    audit_logs = relationship(
        "InvoiceAuditLog", back_populates="invoice", order_by="InvoiceAuditLog.created_at.desc()"
    )

    @property
    def due_date(self) -> date:
        """The date by which the FULL invoice must be settled. If installments
        are defined, this is the last installment's due date (the final
        deadline). due_date_override takes precedence for simple custom
        windows that don't need a full installment schedule."""
        if self.installments:
            return max(i.due_date for i in self.installments)
        if self.due_date_override:
            return self.due_date_override
        from datetime import timedelta
        return self.invoice_date + timedelta(days=self.credit_days)

    @property
    def next_installment_due(self):
        """The next unpaid installment, if this invoice uses a split schedule."""
        pending = [i for i in self.installments if i.paid_amount < i.amount]
        return min(pending, key=lambda i: i.due_date) if pending else None


class Installment(Base):
    """One slice of a flexible credit-term schedule — e.g. 'all January
    invoices settled in 2 installments: 50% by Feb 10, 50% by Feb 20' becomes
    two Installment rows on that invoice instead of one fixed Net-X date."""

    __tablename__ = "installments"

    id = Column(String, primary_key=True, default=gen_id)
    invoice_id = Column(String, ForeignKey("invoices.id"), nullable=False)
    sequence = Column(Integer, nullable=False)  # 1, 2, 3...
    due_date = Column(Date, nullable=False)
    amount = Column(Float, nullable=False)
    paid_amount = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    invoice = relationship("Invoice", back_populates="installments")

    @property
    def status(self) -> str:
        if self.paid_amount >= self.amount:
            return "paid"
        if date.today() > self.due_date:
            return "overdue"
        if self.paid_amount > 0:
            return "partial"
        return "pending"


class Payment(Base):
    __tablename__ = "payments"

    id = Column(String, primary_key=True, default=gen_id)
    invoice_id = Column(String, ForeignKey("invoices.id"), nullable=False)
    installment_id = Column(String, ForeignKey("installments.id"), nullable=True)
    settlement_id = Column(String, nullable=True, index=True)  # groups payments made in one bulk settlement
    amount = Column(Float, nullable=False)
    payment_date = Column(Date, nullable=False)
    reference_number = Column(String, nullable=True)
    delay_days = Column(Integer, default=0)
    bounced = Column(Boolean, default=False)  # payment failed/cheque bounced — counts against Payment History pillar
    created_at = Column(DateTime, default=datetime.utcnow)

    invoice = relationship("Invoice", back_populates="payments")
    installment = relationship("Installment")


class CreditScore(Base):
    """Proprietary Retailer Credit Score (RCS) — a CIBIL-style score on a
    300-900 scale, built from four weighted pillars: payment history (max
    240pts), credit utilization (max 180pts), relationship vintage (max
    90pts), and returns/credit-note trend (max 90pts). score = 300 + sum of
    pillar points. Legacy 0-100 `score`/`risk` fields are kept for the
    average_delay-based views that predate the RCS engine."""

    __tablename__ = "credit_scores"

    id = Column(String, primary_key=True, default=gen_id)
    retailer_id = Column(String, ForeignKey("retailers.id"), unique=True, nullable=False)

    average_delay = Column(Float, default=0.0)
    reporting_businesses = Column(Integer, default=0)

    # RCS (300-900 scale)
    rcs_score = Column(Integer, default=600)
    payment_points = Column(Integer, default=0)      # /240
    utilization_points = Column(Integer, default=0)  # /180
    vintage_points = Column(Integer, default=0)      # /90
    returns_points = Column(Integer, default=0)      # /90
    utilization_pct = Column(Float, nullable=True)   # null = insufficient data (no credit limit set anywhere)
    bounced_count_12m = Column(Integer, default=0)
    return_rate_pct = Column(Float, default=0.0)

    risk = Column(Enum(RiskLevel), default=RiskLevel.low)  # low/medium/high displayed as Excellent/Strained/Risk

    updated_at = Column(DateTime, default=datetime.utcnow)

    retailer = relationship("Retailer", back_populates="credit_score")


class Dispute(Base):
    """Raised by a retailer against a specific invoice — e.g. 'I never received
    this bill', 'amount is wrong', or 'I paid this and it's still shown as
    outstanding'. While a dispute is open, the invoice is excluded from credit
    score penalties so a wholesaler can't unfairly damage a retailer's score by
    failing to mark a payment or issuing an incorrect bill."""

    __tablename__ = "disputes"

    id = Column(String, primary_key=True, default=gen_id)
    invoice_id = Column(String, ForeignKey("invoices.id"), nullable=False)
    retailer_user_id = Column(String, ForeignKey("retailer_users.id"), nullable=False)
    reason = Column(String, nullable=False)  # e.g. 'wrong_bill', 'payment_not_marked', 'wrong_amount', 'other'
    description = Column(Text, nullable=True)
    status = Column(Enum(DisputeStatus), default=DisputeStatus.open)
    resolution_note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    invoice = relationship("Invoice", back_populates="disputes")
    retailer_user = relationship("RetailerUser")


class Notification(Base):
    """Generic notification, addressed either to a wholesaler (recipient_type
    'business', recipient_id = Business.id — visible to all users of that
    business) or to a retailer (recipient_type 'retailer', recipient_id =
    Retailer.id — visible to all portal logins for that retailer)."""

    __tablename__ = "notifications"

    id = Column(String, primary_key=True, default=gen_id)
    recipient_type = Column(Enum(RecipientType), nullable=False)
    recipient_id = Column(String, nullable=False, index=True)
    type = Column(Enum(NotificationType), nullable=False)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    related_invoice_id = Column(String, ForeignKey("invoices.id"), nullable=True)
    related_dispute_id = Column(String, ForeignKey("disputes.id"), nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class CreditNote(Base):
    """A returns/write-off credit issued by a wholesaler against a specific
    invoice — e.g. expired stock returned by the retailer. Deducts directly
    from that invoice's outstanding balance (like a payment, but backed by
    returned goods rather than cash) and feeds the Returns Trend pillar of
    the retailer's RCS score."""

    __tablename__ = "credit_notes"

    id = Column(String, primary_key=True, default=gen_id)
    business_id = Column(String, ForeignKey("businesses.id"), nullable=False)
    retailer_id = Column(String, ForeignKey("retailers.id"), nullable=False)
    invoice_id = Column(String, ForeignKey("invoices.id"), nullable=False)
    amount = Column(Float, nullable=False)
    reason = Column(String, nullable=False)  # 'expired_stock', 'damaged_goods', 'wrong_item', 'other'
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    business = relationship("Business")
    retailer = relationship("Retailer")
    invoice = relationship("Invoice", back_populates="credit_notes")


class InvoiceAuditLog(Base):
    """Status history tracker for an invoice — every edit, void, or
    dispute-driven correction is recorded here so a wholesaler (and, for
    disputed bills, an auditor) can see exactly what changed and when."""

    __tablename__ = "invoice_audit_logs"

    id = Column(String, primary_key=True, default=gen_id)
    invoice_id = Column(String, ForeignKey("invoices.id"), nullable=False)
    business_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    action = Column(Enum(AuditAction), nullable=False)
    field_changes = Column(Text, nullable=True)  # human-readable summary, e.g. "amount: 5000 -> 4500"
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    invoice = relationship("Invoice", back_populates="audit_logs")
    business_user = relationship("User")
