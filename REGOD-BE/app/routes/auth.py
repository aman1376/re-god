from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models import User
from app.schemas import UserResponse
from app.utils.auth import get_current_user, create_access_token, create_refresh_token
from app.rbac import require_permission
from app.clerk import clerk_client

router = APIRouter()

# Pydantic models for request/response
class ClerkExchangeRequest(BaseModel):
    identifier: str

class ClerkExchangeResponse(BaseModel):
    auth_token: Optional[str] = None
    refresh_token: Optional[str] = None
    user_data: dict
    user_id: str
    requires_teacher_code: Optional[bool] = None
    message: Optional[str] = None

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    teacher_code: Optional[str] = None

class RegisterResponse(BaseModel):
    auth_token: str
    refresh_token: str
    user_data: dict
    user_id: str

@router.post("/clerk-exchange", response_model=ClerkExchangeResponse)
async def clerk_exchange(
    request: ClerkExchangeRequest,
    db: Session = Depends(get_db)
):
    """Exchange Clerk token for backend JWT tokens."""
    try:
        from app.utils.auth import create_access_token, create_refresh_token
        
        identifier = request.identifier
        
        # Find user by email
        user = db.query(User).filter(User.email == identifier).first()
        
        if not user:
            # User doesn't exist - create a new student user
            user = User(
                email=identifier,
                name=identifier.split('@')[0],  # Use email prefix as default name
                is_verified=True,  # Clerk users are considered verified
                clerk_user_id=None  # Will be updated by webhook or later
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            
            # Assign default student role
            from app.models import Role
            student_role = db.query(Role).filter(Role.name == "student").first()
            if student_role:
                user.roles.append(student_role)
                db.commit()
        
        # Check if user has teacher or admin role
        user_roles = [role.name for role in user.roles] if user.roles else []
        has_teacher_admin_role = any(role in ["teacher", "admin"] for role in user_roles)
        
        if not has_teacher_admin_role:
            # User doesn't have teacher/admin role - check if they already have a teacher assigned
            from app.models import TeacherAssignment
            
            # Check if student already has a teacher assigned
            existing_assignment = db.query(TeacherAssignment).filter(
                TeacherAssignment.student_id == user.id,
                TeacherAssignment.active == True
            ).first()
            
            access_token = create_access_token(str(user.id), user.email, "student")
            refresh_token = create_refresh_token(str(user.id))
            
            if existing_assignment:
                # Student already has a teacher - no need for teacher code
                return ClerkExchangeResponse(
                    user_data={
                        "id": str(user.id),
                        "email": user.email,
                        "name": user.name,
                        "is_verified": user.is_verified,
                        "onboarding_completed": user.onboarding_completed,
                        "roles": [role.name for role in user.roles] if user.roles else []
                    },
                    user_id=str(user.id),
                    auth_token=access_token,
                    refresh_token=refresh_token,
                    requires_teacher_code=False,
                    message="Welcome back! You already have a teacher assigned."
                )
            else:
                # Student needs to enter a teacher code
                return ClerkExchangeResponse(
                    user_data={
                        "id": str(user.id),
                        "email": user.email,
                        "name": user.name,
                        "is_verified": user.is_verified,
                        "onboarding_completed": user.onboarding_completed,
                        "roles": [role.name for role in user.roles] if user.roles else []
                    },
                    user_id=str(user.id),
                    auth_token=access_token,
                    refresh_token=refresh_token,
                    requires_teacher_code=True,
                    message="Please enter a teacher code to access courses and chat."
                )
        
        # Update Clerk user ID if missing
        if not user.clerk_user_id:
            # Get Clerk user ID from the token (this would need to be extracted from the JWT)
            # For now, we'll leave it as None and let the webhook handle it
            pass
        
        # Generate JWT tokens
        # Prioritize admin role over teacher role
        user_role = "admin" if "admin" in [role.name for role in user.roles] else (user.roles[0].name if user.roles else "student")
        access_token = create_access_token(str(user.id), user.email, user_role)
        refresh_token = create_refresh_token(str(user.id))
        
        # Prepare user data response
        user_data = {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "is_verified": user.is_verified,
            "onboarding_completed": user.onboarding_completed,
            "roles": [role.name for role in user.roles] if user.roles else []
        }
        
        return ClerkExchangeResponse(
            auth_token=access_token,
            refresh_token=refresh_token,
            user_data=user_data,
            user_id=str(user.id)
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions (like 403 Forbidden)
        raise
    except Exception as e:
        print(f"Error in clerk_exchange: {e}")
        raise HTTPException(status_code=500, detail="Failed to exchange Clerk token")

@router.post("/register", response_model=RegisterResponse)
async def register_user(
    request: RegisterRequest,
    db: Session = Depends(get_db)
):
    """Register a new user with optional teacher code."""
    try:
        # Check if user already exists
        existing_user = db.query(User).filter(User.email == request.email).first()
        if existing_user:
            # If user exists but doesn't have a teacher assignment, allow registration with teacher code
            if request.teacher_code:
                from app.models import TeacherAssignment
                existing_assignment = db.query(TeacherAssignment).filter(
                    TeacherAssignment.student_id == existing_user.id
                ).first()
                
                if existing_assignment:
                    raise HTTPException(status_code=409, detail="User with this email already exists and has a teacher assignment")
                else:
                    # User exists but no teacher assignment, proceed with teacher code assignment
                    user = existing_user
            else:
                raise HTTPException(status_code=409, detail="User with this email already exists")
        
        # Validate teacher code if provided
        if request.teacher_code:
            from app.models import TeacherCode
            teacher_code = db.query(TeacherCode).filter(
                TeacherCode.code == request.teacher_code,
                TeacherCode.is_active == True
            ).first()
            
            if not teacher_code:
                raise HTTPException(status_code=400, detail="Invalid teacher code")
            
            # Check if teacher code has remaining uses
            if teacher_code.max_uses > 0:
                from app.models import TeacherCodeUse
                used_count = db.query(TeacherCodeUse).filter(
                    TeacherCodeUse.code_id == teacher_code.id
                ).count()
                
                if used_count >= teacher_code.max_uses:
                    raise HTTPException(status_code=400, detail="Teacher code has reached maximum uses")
        
        # Create new user or use existing user
        if not existing_user:
            user = User(
                email=request.email,
                name=request.name,
                is_verified=True,  # Users with teacher codes are considered verified
                clerk_user_id=None  # Will be updated later if using Clerk
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            
            # Assign default student role
            from app.models import Role
            student_role = db.query(Role).filter(Role.name == "student").first()
            if student_role:
                user.roles.append(student_role)
        else:
            # Update existing user's name if needed
            if request.name and user.name != request.name:
                user.name = request.name
                db.commit()
        
        # If teacher code was provided, record the usage and create teacher assignment
        if request.teacher_code:
            # Record teacher code usage
            from app.models import TeacherCodeUse
            code_use = TeacherCodeUse(
                code_id=teacher_code.id,
                student_id=user.id
            )
            db.add(code_use)
            
            # Create teacher assignment linking student to the teacher who created the code
            # This supports many-to-many: one student can have multiple teachers, one teacher can have multiple students
            from app.models import TeacherAssignment
            assignment = TeacherAssignment(
                student_id=user.id,
                teacher_id=teacher_code.teacher_id,  # Get teacher from the teacher code
                active=True
            )
            db.add(assignment)
        
        db.commit()
        
        # Generate JWT tokens
        user_role = user.roles[0].name if user.roles else "student"
        access_token = create_access_token(str(user.id), user.email, user_role)
        refresh_token = create_refresh_token(str(user.id))
        
        # Prepare user data response
        user_data = {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "is_verified": user.is_verified,
            "onboarding_completed": user.onboarding_completed,
            "roles": [role.name for role in user.roles] if user.roles else []
        }
        
        return RegisterResponse(
            auth_token=access_token,
            refresh_token=refresh_token,
            user_data=user_data,
            user_id=str(user.id)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in register_user: {e}")
        raise HTTPException(status_code=500, detail="Failed to register user")

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
    current_user: dict = Depends(get_current_user),
):
    """Example of RBAC-protected route."""
    return {"message": f"Welcome, {current_user.name}! You have admin access."}

@router.get("/courses/manage", response_model=dict)
@require_permission("course:manage")
async def manage_courses(
    current_user: dict = Depends(get_current_user),
):
    """Only users with course:manage permission can access."""
    return {"message": f"User {current_user.email} can manage courses."}
@router.get("/me-test")
async def me_test(current_user: dict = Depends(get_current_user)):
    return {
        "id": str(current_user["id"]),
        "email": current_user["email"],
        "name": current_user["name"],
        "roles": current_user["roles"],
    }

@router.post("/debug-token")
async def debug_token(
    request: dict,
    db: Session = Depends(get_db)
):
    """Debug endpoint to test token verification"""
    try:
        token = request.get("token")
        if not token:
            return {"error": "No token provided"}
        
        from app.utils.auth import get_current_user
        from fastapi import HTTPAuthorizationCredentials
        from fastapi.security import HTTPBearer
        
        # Create fake credentials for testing
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        
        # Try to get current user
        user = await get_current_user(credentials, db)
        
        return {
            "success": True,
            "user": {
                "id": user["id"],
                "email": user["email"],
                "name": user["name"],
                "roles": user["roles"]
            }
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__
        }

class RefreshTokenRequest(BaseModel):
    refresh_token: str

@router.post("/refresh")
async def refresh_token(
    request: RefreshTokenRequest,
    db: Session = Depends(get_db)
):
    """Refresh access token using refresh token"""
    try:
        if not request.refresh_token:
            raise HTTPException(status_code=400, detail="Refresh token required")
        
        refresh_token = request.refresh_token
        
        # Decode refresh token
        from app.utils.auth import decode_refresh_token
        user_id = decode_refresh_token(refresh_token)
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        
        # Get user from database
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Generate new access token
        user_role = user.roles[0].name if user.roles else "student"
        access_token = create_access_token(str(user.id), user.email, user_role)
        
        return {
            "auth_token": access_token,
            "refresh_token": refresh_token  # Return same refresh token
        }
        
    except Exception as e:
        print(f"Error in refresh_token: {e}")
        raise HTTPException(status_code=401, detail="Token refresh failed")
