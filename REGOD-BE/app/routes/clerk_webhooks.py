from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
import json
from datetime import datetime

from app.database import get_db
from app.models import User, Role
from app.schemas import ClerkWebhookEvent, ClerkUserCreated
from app.clerk import clerk_client

router = APIRouter()

@router.post("/clerk-webhook")
async def clerk_webhook_handler(
    request: Request,
    db: Session = Depends(get_db)
):
    """Handle Clerk webhook events"""
    # Verify webhook signature
    signature = request.headers.get("svix-signature")
    timestamp = request.headers.get("svix-timestamp")
    
    if not signature or not timestamp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing webhook signature"
        )
    
    # Get raw body
    body = await request.body()
    
    # Verify signature (implementation depends on your verification method)
    # if not clerk_client.verify_webhook_signature(body, signature, timestamp):
    #     raise HTTPException(
    #         status_code=status.HTTP_401_UNAUTHORIZED,
    #         detail="Invalid webhook signature"
    #     )
    
    # Parse webhook event
    try:
        event_data = json.loads(body)
        event = ClerkWebhookEvent(**event_data)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid webhook payload: {str(e)}"
        )
    
    # Handle different event types
    if event.type == "user.created":
        await handle_user_created(event.data, db)
    elif event.type == "user.updated":
        await handle_user_updated(event.data, db)
    elif event.type == "user.deleted":
        await handle_user_deleted(event.data, db)
    
    return {"status": "success"}

async def handle_user_created(user_data: dict, db: Session):
    """Handle user.created webhook event"""
    try:
        clerk_user = ClerkUserCreated(**user_data)
        
        # Get user email
        email = clerk_user.email_addresses[0].get("email_address") if clerk_user.email_addresses else None
        if not email:
            return
        
        # Check if user already exists
        existing_user = db.query(User).filter(User.email == email).first()
        if existing_user:
            # Update Clerk user ID if missing
            if not existing_user.clerk_user_id:
                existing_user.clerk_user_id = clerk_user.id
                db.commit()
            return
        
        # Only create users if they're coming through teacher signup flow
        # Check if this user has a teacher code in their metadata or if they're being created
        # through the teacher signup process (this would be indicated by specific metadata)
        
        # For now, we'll only create users if they already exist in our database
        # or if they're coming through a specific teacher signup flow
        print(f"User created in Clerk but not in our database: {email}")
        print("This user will not be able to access the admin portal until they are added by an administrator")
        
        # Note: We don't create the user here anymore to prevent unauthorized access
        # Users must be created through the teacher signup flow or added by an administrator
        
    except Exception as e:
        # Log error but don't break the webhook
        print(f"Error handling user.created event: {str(e)}")

async def handle_user_updated(user_data: dict, db: Session):
    """Handle user.updated webhook event"""
    try:
        clerk_user = ClerkUserCreated(**user_data)
        
        # Find user by Clerk ID
        user = db.query(User).filter(User.clerk_user_id == clerk_user.id).first()
        if not user:
            return
        
        # Update user details
        email = clerk_user.email_addresses[0].get("email_address") if clerk_user.email_addresses else None
        if email:
            user.email = email
        
        name = f"{clerk_user.first_name or ''} {clerk_user.last_name or ''}".strip() or clerk_user.username
        if name:
            user.name = name
        
        db.commit()
        
    except Exception as e:
        # Log error but don't break the webhook
        print(f"Error handling user.updated event: {str(e)}")

async def handle_user_deleted(user_data: dict, db: Session):
    """Handle user.deleted webhook event"""
    try:
        clerk_user_id = user_data.get("id")
        if not clerk_user_id:
            return
        
        # Find user by Clerk ID
        user = db.query(User).filter(User.clerk_user_id == clerk_user_id).first()
        if not user:
            return
        
        # Deactivate user instead of deleting to preserve data
        user.is_active = False
        db.commit()
        
    except Exception as e:
        # Log error but don't break the webhook
        print(f"Error handling user.deleted event: {str(e)}")