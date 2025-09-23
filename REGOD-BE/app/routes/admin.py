from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import User, Role, Permission, TeacherAssignment, TeacherCode, StudentTeacherAccess, user_roles, Course
from app.schemas import RoleResponse, PermissionResponse, TeacherAssignmentResponse, UserResponse, TeacherCodeResponse
from app.clerk import clerk_client
from datetime import datetime, timedelta
import secrets, string
from app.utils.auth import get_current_user
from app.rbac import require_permission, require_role
from app.utils.security import get_password_hash

router = APIRouter()

@router.get("/users", response_model=List[UserResponse])
@require_permission("admin:users:manage")
async def get_all_users(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all users (admin only)"""
    users = db.query(User).offset(skip).limit(limit).all()
    return users

def _generate_teacher_code(length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

@router.post("/teachers/invite", response_model=dict)
@require_permission("admin:users:manage")
async def invite_teacher(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Invite a teacher by name+email via Clerk and prepare a teacher code.
       Body: { name: str, email: str, max_uses?: int, expires_in_days?: int, redirect_url?: str }
    """
    name = payload.get("name")
    email = payload.get("email")
    max_uses = payload.get("max_uses", 1)
    expires_in_days = payload.get("expires_in_days")
    redirect_url = payload.get("redirect_url")

    if not name or not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing name or email")

    # Ensure user exists or create locally.
    teacher = db.query(User).filter(User.email == email).first()
    if not teacher:
        teacher = User(email=email, name=name, is_verified=False)
        db.add(teacher)
        db.flush()

    # Ensure teacher role is assigned
    teacher_role = db.query(Role).filter(Role.name == "teacher").first()
    if not teacher_role:
        raise HTTPException(status_code=500, detail="Teacher role not configured")
    if teacher_role not in teacher.roles:
        teacher.roles.append(teacher_role)

    # Create Clerk invitation (sends email)
    invitation = clerk_client.create_invitation(email_address=email, redirect_url=redirect_url)

    # Generate teacher code and persist
    code = _generate_teacher_code()
    while db.query(TeacherCode).filter(TeacherCode.code == code).first():
        code = _generate_teacher_code()

    expires_at = None
    if expires_in_days is not None:
        try:
            expires_at = datetime.utcnow() + timedelta(days=int(expires_in_days))
        except Exception:
            pass

    teacher_code = TeacherCode(
        code=code,
        teacher_id=teacher.id,
        max_uses=max_uses,
        expires_at=expires_at,
    )
    db.add(teacher_code)
    db.commit()
    db.refresh(teacher_code)

    return {
        "teacher_user_id": str(teacher.id),
        "teacher_name": teacher.name,
        "teacher_email": teacher.email,
        "teacher_code": teacher_code.code,
        # Prefer Clerk invitation URL as shareable link
        "invitation_link": (invitation or {}).get("url") if isinstance(invitation, dict) else None,
    }

@router.get("/my-code", response_model=dict)
@require_role(["admin", "teacher"])  # Admins and Teachers can have/show a code
async def get_or_create_my_teacher_code(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return the current user's teacher code, creating one if missing.
    Admins get a code too so they can distribute to students for testing.
    """
    # Ensure the user has a TeacherCode
    code_obj = db.query(TeacherCode).filter(TeacherCode.teacher_id == current_user.id).first()
    if not code_obj:
        # Generate a unique code
        code = _generate_teacher_code()
        while db.query(TeacherCode).filter(TeacherCode.code == code).first():
            code = _generate_teacher_code()

        code_obj = TeacherCode(
            code=code,
            teacher_id=current_user.id,
            max_uses=0,  # unlimited by default for owner; can be changed later
            expires_at=None,
        )
        db.add(code_obj)
        db.commit()
        db.refresh(code_obj)

    return {
        "teacher_user_id": str(current_user.id),
        "teacher_code": code_obj.code,
        "is_active": code_obj.is_active,
        "use_count": code_obj.use_count,
        "max_uses": code_obj.max_uses,
        "expires_at": code_obj.expires_at.isoformat() if code_obj.expires_at else None,
    }


@router.post("/teachers/signup", response_model=dict)
async def complete_teacher_signup(
    payload: dict,
    db: Session = Depends(get_db)
):
    """Complete teacher signup using email, password and teacher_code.
    Body: { name, email, password, teacher_code }
    Creates password for existing invited teacher and verifies account.
    """
    name = payload.get("name")
    email = payload.get("email")
    password = payload.get("password")
    teacher_code = payload.get("teacher_code")

    if not email or not password or not teacher_code:
        raise HTTPException(status_code=400, detail="Missing required fields")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        # Create if absent
        user = User(email=email, name=name or email.split('@')[0])
        db.add(user)
        db.flush()

    # Validate teacher code belongs to this user (or is unclaimed)
    code_rec = db.query(TeacherCode).filter(TeacherCode.code == teacher_code).first()
    if not code_rec or (code_rec.teacher_id and code_rec.teacher_id != user.id):
        raise HTTPException(status_code=400, detail="Invalid teacher code")

    # Ensure teacher role
    teacher_role = db.query(Role).filter(Role.name == "teacher").first()
    if not teacher_role:
        raise HTTPException(status_code=500, detail="Teacher role not configured")
    if teacher_role not in user.roles:
        user.roles.append(teacher_role)

    # Assign code to user if not already
    if not code_rec.teacher_id:
        code_rec.teacher_id = user.id

    # Set password and verify
    user.hashed_password = get_password_hash(password)
    user.is_verified = True
    if name:
        user.name = name

    db.commit()

    return {"message": "Teacher signup completed. You can now log in.", "user_id": str(user.id)}

@router.get("/roles", response_model=List[RoleResponse])
@require_permission("admin:users:manage")
async def get_all_roles(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all roles (admin only)"""
    roles = db.query(Role).all()
    return roles

@router.get("/permissions", response_model=List[PermissionResponse])
@require_permission("admin:users:manage")
async def get_all_permissions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all permissions (admin only)"""
    permissions = db.query(Permission).all()
    return permissions

@router.post("/users/{user_id}/roles/{role_id}")
@require_permission("admin:users:manage")
async def assign_role_to_user(
    user_id: int,
    role_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Assign a role to a user (admin only)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    if role not in user.roles:
        user.roles.append(role)
        db.commit()
    
    return {"message": f"Role '{role.name}' assigned to user '{user.name}'"}

@router.delete("/users/{user_id}/roles/{role_id}")
@require_permission("admin:users:manage")
async def remove_role_from_user(
    user_id: int,
    role_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove a role from a user (admin only)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    if role in user.roles:
        user.roles.remove(role)
        db.commit()
    
    return {"message": f"Role '{role.name}' removed from user '{user.name}'"}

@router.get("/teacher-assignments", response_model=List[TeacherAssignmentResponse])
@require_permission("admin:users:manage")
async def get_all_teacher_assignments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all teacher assignments (admin only)"""
    assignments = db.query(TeacherAssignment).all()
    return assignments

@router.post("/teacher-assignments")
@require_permission("admin:users:manage")
async def create_teacher_assignment(
    assignment_data: TeacherAssignmentResponse,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a teacher assignment (admin only)"""
    # Check if teacher exists and has teacher role
    teacher = db.query(User).filter(User.id == assignment_data.teacher_id).first()
    if not teacher or not teacher.has_role("teacher"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid teacher ID"
        )
    
    # Check if student exists
    student = db.query(User).filter(User.id == assignment_data.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Check if assignment already exists
    existing_assignment = db.query(TeacherAssignment).filter(
        TeacherAssignment.teacher_id == assignment_data.teacher_id,
        TeacherAssignment.student_id == assignment_data.student_id
    ).first()
    
    if existing_assignment:
        if not existing_assignment.active:
            existing_assignment.active = True
            existing_assignment.assigned_by = current_user.id
            db.commit()
            return {"message": "Teacher assignment reactivated"}
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Teacher assignment already exists"
            )
    
    # Create new assignment
    assignment = TeacherAssignment(
        teacher_id=assignment_data.teacher_id,
        student_id=assignment_data.student_id,
        assigned_by=current_user.id
    )
    
    db.add(assignment)
    db.commit()
    
    return {"message": "Teacher assignment created successfully"}

@router.delete("/teacher-assignments/{assignment_id}")
@require_permission("admin:users:manage")
async def delete_teacher_assignment(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a teacher assignment (admin only)"""
    assignment = db.query(TeacherAssignment).filter(TeacherAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    db.delete(assignment)
    db.commit()
    
    return {"message": "Teacher assignment deleted successfully"}

@router.get("/teacher-codes", response_model=List[TeacherCodeResponse])
@require_permission("admin:users:manage")
async def get_all_teacher_codes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all teacher codes (admin only)"""
    teacher_codes = db.query(TeacherCode).all()
    
    response = []
    for code in teacher_codes:
        teacher = db.query(User).filter(User.id == code.teacher_id).first()
        response.append(TeacherCodeResponse(
            id=code.id,
            code=code.code,
            teacher_id=code.teacher_id,
            teacher_name=teacher.name if teacher else "Unknown Teacher",
            created_at=code.created_at,
            max_uses=code.max_uses,
            expires_at=code.expires_at,
            use_count=code.use_count,
            is_active=code.is_active
        ))
    
    return response

@router.get("/stats")
@require_permission("admin:users:manage")
async def get_admin_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get admin statistics"""
    # Count total users
    total_users = db.query(User).count()
    
    # Count teachers
    teacher_role = db.query(Role).filter(Role.name == "teacher").first()
    total_teachers = db.query(User).join(user_roles, User.id == user_roles.c.user_id).filter(user_roles.c.role_id == teacher_role.id).count() if teacher_role else 0
    
    # Count students (users with 'user' role)
    user_role = db.query(Role).filter(Role.name == "user").first()
    total_students = db.query(User).join(user_roles, User.id == user_roles.c.user_id).filter(user_roles.c.role_id == user_role.id).count() if user_role else 0
    
    # Count courses
    total_courses = db.query(Course).count()
    
    return {
        "total_users": total_users,
        "total_teachers": total_teachers,
        "total_students": total_students,
        "total_courses": total_courses
    }

@router.get("/teachers")
@require_permission("admin:users:manage")
async def get_teachers_directory(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all teachers"""
    teacher_role = db.query(Role).filter(Role.name == "teacher").first()
    if not teacher_role:
        return []
    
    teachers = db.query(User).join(user_roles, User.id == user_roles.c.user_id).filter(user_roles.c.role_id == teacher_role.id).all()
    
    return [
        {
            "id": str(teacher.id),
            "name": teacher.name,
            "email": teacher.email,
            "avatar_url": teacher.avatar_url,
            "created_at": teacher.created_at.isoformat() if teacher.created_at else None,
            "is_active": teacher.is_active
        }
        for teacher in teachers
    ]