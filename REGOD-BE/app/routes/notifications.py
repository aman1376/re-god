from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models import User
from app.utils.auth import get_current_user

router = APIRouter()

class PushTokenRequest(BaseModel):
    expo_push_token: str

class PushTokenResponse(BaseModel):
    success: bool
    message: str

@router.post("/register-push-token", response_model=PushTokenResponse)
async def register_push_token(
    token_data: PushTokenRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Register user's Expo push token for notifications"""
    try:
        user_id = current_user["id"]
        
        # Update user's push token
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        user.expo_push_token = token_data.expo_push_token
        db.commit()
        db.refresh(user)
        
        return PushTokenResponse(
            success=True,
            message="Push token registered successfully"
        )
        
    except Exception as e:
        print(f"Error registering push token: {e}")
        raise HTTPException(status_code=500, detail="Failed to register push token")

@router.delete("/unregister-push-token", response_model=PushTokenResponse)
async def unregister_push_token(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unregister user's Expo push token"""
    try:
        user_id = current_user["id"]
        
        # Remove user's push token
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        user.expo_push_token = None
        db.commit()
        db.refresh(user)
        
        return PushTokenResponse(
            success=True,
            message="Push token unregistered successfully"
        )
        
    except Exception as e:
        print(f"Error unregistering push token: {e}")
        raise HTTPException(status_code=500, detail="Failed to unregister push token")

@router.get("/push-token-status", response_model=dict)
async def get_push_token_status(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check if user has a registered push token"""
    try:
        user_id = current_user["id"]
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {
            "has_token": bool(user.expo_push_token),
            "token_registered": bool(user.expo_push_token)
        }
        
    except Exception as e:
        print(f"Error checking push token status: {e}")
        raise HTTPException(status_code=500, detail="Failed to check push token status")



