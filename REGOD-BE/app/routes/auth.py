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
    current_user: User = Depends(get_current_user),
):
    """Get current user information (from Clerk JWT + synced DB record)."""
    return current_user

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
