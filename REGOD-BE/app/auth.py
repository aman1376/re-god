from fastapi import APIRouter, Request, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
import os
import hmac
import hashlib
import json

# Clerk webhook settings
CLERK_WEBHOOK_SECRET = os.getenv("CLERK_WEBHOOK_SECRET")

router = APIRouter()


def verify_webhook_signature(request: Request, body: bytes):
    """Verify Clerk webhook using secret."""
    signature = request.headers.get("svix-signature")
    if not signature:
        raise HTTPException(status_code=401, detail="Missing signature header")

    # Verify signature (Clerk uses Svix for webhooks)
    expected_signature = hmac.new(
        CLERK_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

@router.post("/webhooks/clerk")
async def clerk_webhook(request: Request, db: Session = Depends(get_db)):
    """Webhook endpoint for Clerk user events."""
    body = await request.body()
    
    try:
        verify_webhook_signature(request, body)
    except HTTPException as e:
        raise e
    
    event = json.loads(body)
    event_type = event.get("type")
    data = event.get("data", {})

    if event_type == "user.created":
        email = data["email_addresses"][0]["email_address"] if data.get("email_addresses") else None
        if email:
            user = db.query(User).filter(User.email == email).first()
            if not user:
                user = User(
                    email=email,
                    name=f"{data.get('first_name', '')} {data.get('last_name', '')}".strip() or "User",
                    clerk_user_id=data.get("id"),
                    is_verified=True,
                )
                db.add(user)
                db.commit()
                db.refresh(user)

    elif event_type == "user.updated":
        user = db.query(User).filter(User.clerk_user_id == data.get("id")).first()
        if user:
            user.name = f"{data.get('first_name', '')} {data.get('last_name', '')}".strip() or user.name
            db.commit()

    elif event_type == "user.deleted":
        user = db.query(User).filter(User.clerk_user_id == data.get("id")).first()
        if user:
            db.delete(user)
            db.commit()

    return {"status": "success"}
