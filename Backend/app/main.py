from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.routers import (
    auth_router,
    retailer_router,
    invoice_router,
    payment_router,
    dashboard_router,
    search_router,
    reports_router,
    retailer_auth_router,
    retailer_portal_router,
    disputes_router,
    notifications_router,
    credit_notes_router,
)

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="CreditTrust API",
    description="Credit Intelligence Platform for Pharmaceutical Wholesalers — Phase 1 & 2 MVP",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(retailer_router.router)
app.include_router(invoice_router.router)
app.include_router(payment_router.router)
app.include_router(dashboard_router.router)
app.include_router(search_router.router)
app.include_router(reports_router.router)
app.include_router(retailer_auth_router.router)
app.include_router(retailer_portal_router.router)
app.include_router(disputes_router.router)
app.include_router(notifications_router.router)
app.include_router(credit_notes_router.router)


@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "service": "CreditTrust API", "docs": "/docs"}
