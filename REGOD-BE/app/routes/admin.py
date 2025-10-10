from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import User, Role, Permission, TeacherAssignment, TeacherCode, user_roles, Course
from app.schemas import RoleResponse, PermissionResponse, TeacherAssignmentResponse, UserResponse, TeacherCodeResponse
from app.clerk import clerk_client
from datetime import datetime, timedelta, timezone
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
    current_user: dict = Depends(get_current_user),
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
    current_user: dict = Depends(get_current_user),
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

    # Ensure teacher role is assigned (replace any existing roles)
    teacher_role = db.query(Role).filter(Role.name == "teacher").first()
    if not teacher_role:
        raise HTTPException(status_code=500, detail="Teacher role not configured")
    
    # Clear existing roles and assign only teacher role
    teacher.roles.clear()
    teacher.roles.append(teacher_role)

    # Generate teacher code first
    code = _generate_teacher_code()
    while db.query(TeacherCode).filter(TeacherCode.code == code).first():
        code = _generate_teacher_code()

    expires_at = None
    if expires_in_days is not None:
        try:
            expires_at = datetime.now(timezone.utc) + timedelta(days=int(expires_in_days))
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

    # Create Clerk invitation with teacher code in redirect URL
    invitation_redirect_url = f"{redirect_url}?teacher_code={code}"
    invitation = None
    try:
        print(f"Creating Clerk invitation for {email} with redirect URL: {invitation_redirect_url}")
        invitation = clerk_client.create_invitation(
            email_address=email, 
            redirect_url=invitation_redirect_url
        )
        print(f"Clerk invitation created successfully: {invitation}")
    except Exception as e:
        print(f"Failed to create Clerk invitation: {e}")
        print(f"Exception type: {type(e)}")
        import traceback
        traceback.print_exc()
        invitation = None

    # Extract invitation URL from response
    invitation_url = None
    if invitation and isinstance(invitation, dict):
        invitation_url = invitation.get("url")
        print(f"Extracted invitation URL: {invitation_url}")
    else:
        print(f"Invalid invitation response: {invitation}")

    return {
        "teacher_user_id": str(teacher.id),
        "teacher_name": teacher.name,
        "teacher_email": teacher.email,
        "teacher_code": teacher_code.code,
        "invitation_link": invitation_url,
        "debug_info": {
            "invitation_redirect_url": invitation_redirect_url,
            "invitation_response": invitation,
            "extracted_url": invitation_url
        }
    }

@router.get("/my-code", response_model=dict)
@require_role(["admin", "teacher"])  # Admins and Teachers can have/show a code
async def get_or_create_my_teacher_code(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return the current user's teacher code, creating one if missing.
    Admins get a code too so they can distribute to students for testing.
    """
    # Ensure the user has a TeacherCode
    code_obj = db.query(TeacherCode).filter(TeacherCode.teacher_id == current_user["id"]).first()
    if not code_obj:
        # Generate a unique code
        code = _generate_teacher_code()
        while db.query(TeacherCode).filter(TeacherCode.code == code).first():
            code = _generate_teacher_code()

        code_obj = TeacherCode(
            code=code,
            teacher_id=current_user["id"],
            max_uses=0,  # unlimited by default for owner; can be changed later
            expires_at=None,
        )
        db.add(code_obj)
        db.commit()
        db.refresh(code_obj)

    return {
        "teacher_user_id": str(current_user["id"]),
        "teacher_code": code_obj.code,
        "is_active": code_obj.is_active,
        "use_count": code_obj.use_count,
        "max_uses": code_obj.max_uses,
        "expires_at": code_obj.expires_at.isoformat() if code_obj.expires_at else None,
    }


@router.post("/teachers/validate-code-exists", response_model=dict)
async def validate_teacher_code_exists(
    payload: dict,
    db: Session = Depends(get_db)
):
    """Validate if a teacher code exists and is active (no authentication required).
    Body: { teacher_code }
    """
    teacher_code = payload.get("teacher_code")

    if not teacher_code:
        raise HTTPException(status_code=400, detail="Teacher code is required")

    # Find the teacher code
    code_rec = db.query(TeacherCode).filter(TeacherCode.code == teacher_code).first()
    if not code_rec:
        raise HTTPException(status_code=400, detail="Invalid teacher code")

    # Check if code is expired
    if code_rec.expires_at and code_rec.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Teacher code has expired")

    # Check if code has exceeded max uses
    if code_rec.max_uses > 0 and code_rec.use_count >= code_rec.max_uses:
        raise HTTPException(status_code=400, detail="Teacher code has exceeded maximum uses")

    # Check if code is active
    if not code_rec.is_active:
        raise HTTPException(status_code=400, detail="Teacher code is not active")

    return {
        "message": "Teacher code is valid",
        "teacher_code": teacher_code,
        "is_valid": True
    }

@router.post("/teachers/assign-teacher-code", response_model=dict)
async def assign_teacher_code(
    payload: dict,
    db: Session = Depends(get_db)
):
    """Assign teacher code to an existing user.
    Body: { teacher_code, user_id }
    """
    teacher_code = payload.get("teacher_code")
    user_id = payload.get("user_id")

    if not teacher_code or not user_id:
        raise HTTPException(status_code=400, detail="Missing teacher_code or user_id")

    # Find the user
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Find the teacher code
    code_rec = db.query(TeacherCode).filter(TeacherCode.code == teacher_code).first()
    if not code_rec:
        raise HTTPException(status_code=400, detail="Invalid teacher code")

    # Check if code is expired
    if code_rec.expires_at and code_rec.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Teacher code has expired")

    # Check if code has exceeded max uses
    if code_rec.max_uses > 0 and code_rec.use_count >= code_rec.max_uses:
        raise HTTPException(status_code=400, detail="Teacher code has exceeded maximum uses")

    # Check if code is active
    if not code_rec.is_active:
        raise HTTPException(status_code=400, detail="Teacher code is not active")

    # Check if user already has teacher role
    existing_teacher_role = db.query(Role).filter(Role.name == "teacher").first()
    if existing_teacher_role and existing_teacher_role in user.roles:
        raise HTTPException(status_code=400, detail="User already has teacher role")

    # Assign teacher role to user
    teacher_role = db.query(Role).filter(Role.name == "teacher").first()
    if teacher_role:
        # Clear existing roles and assign only teacher role
        user.roles.clear()
        user.roles.append(teacher_role)
        
        # Update user name from Clerk data if available
        try:
            # Get user data from Clerk
            clerk_user_data = clerk_client.get_user(user.clerk_user_id) if user.clerk_user_id else None
            if clerk_user_data:
                full_name = f"{clerk_user_data.get('first_name', '')} {clerk_user_data.get('last_name', '')}".strip()
                if full_name:
                    user.name = full_name
        except Exception as e:
            print(f"Could not update user name from Clerk: {e}")
        
        # Increment use count for the teacher code
        code_rec.use_count += 1
        
        db.commit()
        
        return {
            "success": True,
            "message": "Teacher code validated successfully. You now have access to the admin portal.",
            "user_data": {
                "id": str(user.id),
                "email": user.email,
                "name": user.name,
                "roles": [role.name for role in user.roles]
            }
        }
    else:
        raise HTTPException(status_code=500, detail="Teacher role not found in database")

@router.post("/teachers/validate-code", response_model=dict)
async def validate_teacher_code(
    payload: dict,
    db: Session = Depends(get_db)
):
    """Validate teacher code for Clerk-based signup.
    Body: { teacher_code, clerk_user_id }
    """
    teacher_code = payload.get("teacher_code")
    clerk_user_id = payload.get("clerk_user_id")

    if not teacher_code or not clerk_user_id:
        raise HTTPException(status_code=400, detail="Missing teacher_code or clerk_user_id")

    # Find the teacher code
    code_rec = db.query(TeacherCode).filter(TeacherCode.code == teacher_code).first()
    if not code_rec:
        raise HTTPException(status_code=400, detail="Invalid teacher code")

    # Check if code is expired
    if code_rec.expires_at and code_rec.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Teacher code has expired")

    # Check if code has exceeded max uses
    if code_rec.max_uses > 0 and code_rec.use_count >= code_rec.max_uses:
        raise HTTPException(status_code=400, detail="Teacher code has exceeded maximum uses")

    # Check if code is active
    if not code_rec.is_active:
        raise HTTPException(status_code=400, detail="Teacher code is not active")

    # Find user by Clerk ID
    user = db.query(User).filter(User.clerk_user_id == clerk_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Update user details from Clerk if needed
    try:
        # Get fresh user data from Clerk
        clerk_user_data = clerk_client.get_user(clerk_user_id)
        if clerk_user_data:
            # Update user name and email from Clerk
            first_name = clerk_user_data.get('first_name', '')
            last_name = clerk_user_data.get('last_name', '')
            full_name = f"{first_name} {last_name}".strip()
            
            # If no first/last name, use email prefix or a default
            if not full_name:
                email_addresses = clerk_user_data.get('email_addresses', [])
                if email_addresses and len(email_addresses) > 0:
                    email = email_addresses[0].get('email_address', '')
                    if email:
                        # Use email prefix as name
                        email_prefix = email.split('@')[0]
                        full_name = email_prefix.replace('.', ' ').replace('_', ' ').title()
                    else:
                        full_name = "Teacher User"
                else:
                    full_name = "Teacher User"
            
            # Update name from Clerk (prioritize Clerk data)
            if full_name:
                user.name = full_name
                print(f"Updated user name from Clerk: {full_name}")
            
            # Update email from Clerk
            email_addresses = clerk_user_data.get('email_addresses', [])
            if email_addresses and len(email_addresses) > 0:
                primary_email = email_addresses[0].get('email_address', '')
                if primary_email and user.email != primary_email:
                    user.email = primary_email
            
            # Set user as verified since they completed Clerk signup
            user.is_verified = True
            
    except Exception as e:
        print(f"Warning: Could not fetch Clerk user data: {e}")
        # Still proceed with role assignment

    # Check if user already has teacher role
    teacher_role = db.query(Role).filter(Role.name == "teacher").first()
    if not teacher_role:
        raise HTTPException(status_code=500, detail="Teacher role not configured")

    # For teacher signup, remove student role and assign only teacher role
    student_role = db.query(Role).filter(Role.name == "student").first()
    
    # Clear existing roles and assign only teacher role
    user.roles.clear()
    user.roles.append(teacher_role)
    
    # If there was a student role, make sure it's removed from the relationship
    if student_role and student_role in user.roles:
        user.roles.remove(student_role)

    # Assign code to user if not already assigned
    if not code_rec.teacher_id:
        code_rec.teacher_id = user.id

    # Increment use count
    code_rec.use_count += 1

    db.commit()

    return {
        "message": "Teacher code validated successfully",
        "user_id": str(user.id),
        "teacher_code": teacher_code,
        "role_assigned": True
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

    # Ensure teacher role (replace any existing roles)
    teacher_role = db.query(Role).filter(Role.name == "teacher").first()
    if not teacher_role:
        raise HTTPException(status_code=500, detail="Teacher role not configured")
    
    # Clear existing roles and assign only teacher role
    user.roles.clear()
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
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all roles (admin only)"""
    roles = db.query(Role).all()
    return roles

@router.get("/permissions", response_model=List[PermissionResponse])
@require_permission("admin:users:manage")
async def get_all_permissions(
    current_user: dict = Depends(get_current_user),
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
    current_user: dict = Depends(get_current_user),
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
    current_user: dict = Depends(get_current_user),
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

@router.delete("/users/{user_id}")
@require_permission("admin:users:manage")
async def delete_user_account(
    user_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a user account (admin only) - soft delete with student reassignment for teachers"""
    # Prevent admin from deleting themselves
    if str(current_user["id"]) == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user is a teacher
    user_roles = [role.name for role in user.roles] if user.roles else []
    is_teacher = "teacher" in user_roles or "admin" in user_roles
    
    if is_teacher:
        # If teacher/admin is being deleted, reassign their students to the current admin
        # Find all active teacher assignments where this user is the teacher
        teacher_assignments = db.query(TeacherAssignment).filter(
            TeacherAssignment.teacher_id == user_id,
            TeacherAssignment.active == True
        ).all()
        
        # Reassign all students to the current admin (the one performing the deletion)
        reassigned_count = 0
        for assignment in teacher_assignments:
            assignment.teacher_id = current_user["id"]
            assignment.assigned_by = current_user["id"]
            reassigned_count += 1
        
        if reassigned_count > 0:
            print(f"Admin {current_user['email']} reassigned {reassigned_count} students from deleted teacher {user.email}")
            db.commit()
    
    # Soft delete: deactivate user instead of deleting to preserve data integrity
    user.is_active = False
    user.email = f"deleted_{user_id}_{user.email}"  # Prevent email conflicts
    db.commit()
    
    return {
        "message": "Account deleted successfully",
        "user_id": user_id,
        "reassigned_students": reassigned_count if is_teacher else 0
    }

@router.get("/teacher-assignments", response_model=List[TeacherAssignmentResponse])
@require_permission("admin:users:manage")
async def get_all_teacher_assignments(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all teacher assignments (admin only)"""
    assignments = db.query(TeacherAssignment).all()
    return assignments

@router.post("/teacher-assignments")
@require_permission("admin:users:manage")
async def create_teacher_assignment(
    assignment_data: TeacherAssignmentResponse,
    current_user: dict = Depends(get_current_user),
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
            existing_assignment.assigned_by = current_user["id"]
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
        assigned_by=current_user["id"]
    )
    
    db.add(assignment)
    db.commit()
    
    return {"message": "Teacher assignment created successfully"}

@router.delete("/teacher-assignments/{assignment_id}")
@require_permission("admin:users:manage")
async def delete_teacher_assignment(
    assignment_id: int,
    current_user: dict = Depends(get_current_user),
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
    current_user: dict = Depends(get_current_user),
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
    current_user: dict = Depends(get_current_user),
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

@router.get("/teacher-stats")
@require_role(["teacher", "admin"])
async def get_teacher_stats(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get teacher-specific statistics"""
    # Count courses created by this teacher
    teacher_courses = db.query(Course).filter(Course.created_by == current_user["id"]).count()
    
    # Count students assigned to this teacher
    teacher_students = db.query(TeacherAssignment).filter(
        TeacherAssignment.teacher_id == current_user["id"],
        TeacherAssignment.active == True
    ).count()
    
    return {
        "my_courses": teacher_courses,
        "assigned_students": teacher_students
    }

@router.get("/my-students")
@require_role(["teacher", "admin"])
async def get_my_students(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get students assigned to this teacher"""
    assignments = db.query(TeacherAssignment).filter(
        TeacherAssignment.teacher_id == current_user["id"],
        TeacherAssignment.active == True
    ).all()
    
    students = []
    for assignment in assignments:
        student = db.query(User).filter(User.id == assignment.student_id).first()
        if student:
            students.append({
                "id": str(student.id),
                "name": student.name,
                "email": student.email,
                "assigned_at": assignment.assigned_at.isoformat()
            })
    
    return students

@router.get("/teachers")
@require_permission("admin:users:manage")
async def get_teachers_directory(
    current_user: dict = Depends(get_current_user),
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

@router.get("/students")
@require_role(["admin", "teacher"])
async def get_students_directory(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get students - admins see all students, teachers see only their assigned students"""
    from app.models import UserCourseProgress, TeacherAssignment
    
    # Check if current user is admin
    current_user_roles = current_user.get("roles", [])
    is_admin = "admin" in current_user_roles or current_user.get("role") == "admin"
    
    if is_admin:
        # Admin sees all students
        # Get all users who don't have admin or teacher roles (i.e., students)
        # First get teacher and admin role IDs
        teacher_role = db.query(Role).filter(Role.name == "teacher").first()
        admin_role = db.query(Role).filter(Role.name == "admin").first()
        
        role_ids_to_exclude = []
        if teacher_role:
            role_ids_to_exclude.append(teacher_role.id)
        if admin_role:
            role_ids_to_exclude.append(admin_role.id)
        
        # Get all users who don't have these roles
        if role_ids_to_exclude:
            students = db.query(User).filter(
                ~User.id.in_(
                    db.query(user_roles.c.user_id).filter(
                        user_roles.c.role_id.in_(role_ids_to_exclude)
                    )
                ),
                User.is_active == True
            ).all()
        else:
            students = db.query(User).filter(User.is_active == True).all()
    else:
        # Teacher sees only their assigned students
        assignments = db.query(TeacherAssignment).filter(
            TeacherAssignment.teacher_id == current_user["id"],
            TeacherAssignment.active == True
        ).all()
        
        student_ids = [assignment.student_id for assignment in assignments]
        students = db.query(User).filter(User.id.in_(student_ids)).all()
    
    result = []
    for student in students:
        # Get course progress count
        course_count = db.query(UserCourseProgress).filter(
            UserCourseProgress.user_id == student.id
        ).count()
        
        result.append({
            "id": str(student.id),
            "first_name": student.name.split()[0] if student.name else "",
            "last_name": " ".join(student.name.split()[1:]) if student.name and len(student.name.split()) > 1 else "",
            "name": student.name,
            "email": student.email,
            "phone": student.phone,
            "avatar_url": student.avatar_url,
            "created_at": student.created_at.isoformat() if student.created_at else None,
            "is_active": student.is_active,
            "enrolled_courses": course_count
        })
    
    return result

@router.get("/students/{student_id}/analytics")
@require_role(["admin", "teacher"])
async def get_student_analytics(
    student_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed analytics for a specific student - admins can access any student, teachers only their assigned students"""
    from app.models import UserCourseProgress, UserModuleProgress, QuizResponse, TeacherAssignment
    from sqlalchemy import func
    import uuid
    
    # Get student
    student = db.query(User).filter(User.id == uuid.UUID(student_id)).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Check if current user is admin
    current_user_roles = current_user.get("roles", [])
    is_admin = "admin" in current_user_roles or current_user.get("role") == "admin"
    
    # If not admin, check if teacher has access to this student
    if not is_admin:
        # Check if this teacher is assigned to this student
        assignment = db.query(TeacherAssignment).filter(
            TeacherAssignment.teacher_id == current_user["id"],
            TeacherAssignment.student_id == student_id,
            TeacherAssignment.active == True
        ).first()
        
        if not assignment:
            raise HTTPException(status_code=403, detail="You don't have permission to view this student's analytics")
    
    # Get course progress
    course_progress = db.query(UserCourseProgress).filter(
        UserCourseProgress.user_id == student.id
    ).all()
    
    # Calculate total courses enrolled and completed
    total_courses = len(course_progress)
    completed_courses = sum(1 for cp in course_progress if cp.progress_percentage >= 100)
    total_course_progress = sum(cp.progress_percentage for cp in course_progress) / total_courses if total_courses > 0 else 0
    
    # Get lesson/module progress
    module_progress = db.query(UserModuleProgress).filter(
        UserModuleProgress.user_id == student.id
    ).all()
    
    total_lessons = len(module_progress)
    completed_lessons = sum(1 for mp in module_progress if mp.status == "completed")
    total_lesson_progress = (completed_lessons / total_lessons * 100) if total_lessons > 0 else 0
    
    # Get quiz responses
    quiz_responses = db.query(QuizResponse).filter(
        QuizResponse.user_id == student.id
    ).all()
    
    total_quizzes = len(set((qr.course_id, qr.module_id) for qr in quiz_responses))
    
    # Get total time spent (approximate based on sessions)
    # For now, we'll estimate based on last_visited_at timestamps
    time_spent_hours = 0.0
    if course_progress:
        # Calculate approximate time based on activity
        for cp in course_progress:
            if cp.started_at and cp.last_visited_at:
                delta = cp.last_visited_at - cp.started_at
                time_spent_hours += delta.total_seconds() / 3600
    
    # Limit to reasonable value
    time_spent_hours = min(time_spent_hours, 1000)
    
    # Calculate average time per day (estimate)
    if student.created_at:
        from datetime import datetime, timezone as tz
        days_active = max(1, (datetime.now(tz.utc) - student.created_at).days)
        avg_time_per_day = time_spent_hours / days_active
    else:
        avg_time_per_day = 0
    
    # Get time spent data for chart (last 30 days)
    from datetime import datetime, timedelta, timezone as tz
    time_series = []
    now = datetime.now(tz.utc)
    
    for i in range(9):  # Last 9 data points
        date = now - timedelta(days=(8 - i) * 3)
        # Simulate activity data (random for now, would need real tracking)
        import random
        hours = random.uniform(20, 110) if course_progress else 0
        time_series.append({
            "date": date.strftime("%d/%m"),
            "hours": round(hours, 1)
        })
    
    return {
        "student": {
            "id": str(student.id),
            "name": student.name,
            "email": student.email,
            "phone": student.phone,
            "avatar_url": student.avatar_url,
            "created_at": student.created_at.isoformat() if student.created_at else None
        },
        "stats": {
            "time_spent_hours": round(time_spent_hours, 1),
            "avg_time_per_day_hours": round(avg_time_per_day, 1),
            "finished_courses": completed_courses,
            "total_courses": total_courses,
            "course_progress_percentage": round(total_course_progress, 1),
            "completed_lessons": completed_lessons,
            "total_lessons": total_lessons,
            "lesson_progress_percentage": round(total_lesson_progress, 1),
            "completed_quizzes": total_quizzes,
            "quiz_progress_percentage": round((total_quizzes / max(1, total_courses * 3)) * 100, 1)  # Assume ~3 quizzes per course
        },
        "time_series": time_series
    }