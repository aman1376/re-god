from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import UserResponse
from app.utils.auth import get_current_user
from app.rbac import require_permission

router = APIRouter()

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user information (from Clerk JWT + synced DB record)."""
    # Get the actual User model from database to include all fields like avatar_url
    user_id = current_user["id"]
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Convert to UserResponse format
    user_response = UserResponse(
        id=str(user.id),
        name=user.name,
        email=user.email,
        phone=user.phone,
        avatar_url=user.avatar_url,
        is_verified=user.is_verified,
        onboarding_completed=user.onboarding_completed,
        created_at=user.created_at,
        last_login=user.last_login,
        roles=[role.name for role in user.roles] if user.roles else []
    )
    
    return user_response

@router.get("/admin-only", response_model=dict)
@require_permission("admin:access")
async def admin_only_endpoint(
    current_user: User = Depends(get_current_user),
):
    """Example of RBAC-protected route."""
    return {"message": f"Welcome, {current_user.name}! You have admin access."}

@router.get("/courses/manage", response_model=dict)
@require_permission("course:manage")
async def manage_courses(
    current_user: User = Depends(get_current_user),
):
    """Only users with course:manage permission can access."""
    return {"message": f"User {current_user.email} can manage courses."}
@router.get("/me-test")
async def me_test(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "name": current_user.name,
        "roles": [role.name for role in current_user.roles],
    }
