from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import secrets
import string
from datetime import datetime, timedelta

from app.database import get_db
from app.models import User, TeacherCode, TeacherCodeUse, StudentTeacherAccess
from app.schemas import (
    TeacherCodeCreate, TeacherCodeResponse, TeacherCodeUseRequest, 
    TeacherCodeUseResponse, StudentAccessResponse
)
from app.utils.auth import get_current_user
from app.rbac import require_permission, require_role

router = APIRouter()

def generate_teacher_code(length=8):
    """Generate a random teacher code"""
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

@router.post("/teacher-codes", response_model=TeacherCodeResponse)
@require_role("teacher")
async def create_teacher_code(
    code_data: TeacherCodeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new teacher code (teachers only)"""
    # Verify the teacher exists and has teacher role
    teacher = db.query(User).filter(User.id == code_data.teacher_id).first()
    if not teacher or not teacher.has_role("teacher"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid teacher ID"
        )
    
    # Teachers can only create codes for themselves
    if code_data.teacher_id != current_user.id and not current_user.has_role("admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only create codes for yourself"
        )
    
    # Generate unique code
    code = generate_teacher_code()
    while db.query(TeacherCode).filter(TeacherCode.code == code).first():
        code = generate_teacher_code()
    
    # Create teacher code
    teacher_code = TeacherCode(
        code=code,
        teacher_id=code_data.teacher_id,
        max_uses=code_data.max_uses,
        expires_at=code_data.expires_at
    )
    
    db.add(teacher_code)
    db.commit()
    db.refresh(teacher_code)
    
    return TeacherCodeResponse(
        id=teacher_code.id,
        code=teacher_code.code,
        teacher_id=teacher_code.teacher_id,
        teacher_name=teacher.name,
        created_at=teacher_code.created_at,
        max_uses=teacher_code.max_uses,
        expires_at=teacher_code.expires_at,
        use_count=teacher_code.use_count,
        is_active=teacher_code.is_active
    )

@router.get("/teacher-codes", response_model=List[TeacherCodeResponse])
@require_role("teacher")
async def get_teacher_codes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all teacher codes for the current teacher"""
    teacher_codes = db.query(TeacherCode).filter(
        TeacherCode.teacher_id == current_user.id
    ).all()
    
    response = []
    for code in teacher_codes:
        response.append(TeacherCodeResponse(
            id=code.id,
            code=code.code,
            teacher_id=code.teacher_id,
            teacher_name=current_user.name,
            created_at=code.created_at,
            max_uses=code.max_uses,
            expires_at=code.expires_at,
            use_count=code.use_count,
            is_active=code.is_active
        ))
    
    return response

@router.post("/use-teacher-code", response_model=TeacherCodeUseResponse)
async def use_teacher_code(
    code_request: TeacherCodeUseRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Use a teacher code to gain access to content"""
    # Students only can use teacher codes
    if not current_user.has_role("student"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can use teacher codes"
        )
    
    # Find the teacher code
    teacher_code = db.query(TeacherCode).filter(
        TeacherCode.code == code_request.code,
        TeacherCode.is_active == True
    ).first()
    
    if not teacher_code:
        return TeacherCodeUseResponse(
            success=False,
            message="Invalid or expired code"
        )
    
    # Check if code has expired
    if teacher_code.expires_at and teacher_code.expires_at < datetime.utcnow():
        teacher_code.is_active = False
        db.commit()
        return TeacherCodeUseResponse(
            success=False,
            message="Code has expired"
        )
    
    # Check if code has reached max uses
    if teacher_code.max_uses != -1 and teacher_code.use_count >= teacher_code.max_uses:
        teacher_code.is_active = False
        db.commit()
        return TeacherCodeUseResponse(
            success=False,
            message="Code has reached maximum uses"
        )
    
    # Check if student already used this code
    existing_use = db.query(TeacherCodeUse).filter(
        TeacherCodeUse.code_id == teacher_code.id,
        TeacherCodeUse.student_id == current_user.id
    ).first()
    
    if existing_use:
        return TeacherCodeUseResponse(
            success=False,
            message="You have already used this code"
        )
    
    # Check if student already has access to this teacher
    existing_access = db.query(StudentTeacherAccess).filter(
        StudentTeacherAccess.student_id == current_user.id,
        StudentTeacherAccess.teacher_id == teacher_code.teacher_id
    ).first()
    
    if existing_access:
        return TeacherCodeUseResponse(
            success=False,
            message="You already have access to this teacher's content"
        )
    
    # Create teacher code use record
    code_use = TeacherCodeUse(
        code_id=teacher_code.id,
        student_id=current_user.id
    )
    db.add(code_use)
    
    # Create student-teacher access record
    student_access = StudentTeacherAccess(
        student_id=current_user.id,
        teacher_id=teacher_code.teacher_id,
        granted_via_code=True
    )
    db.add(student_access)
    
    # Update teacher code use count
    teacher_code.use_count += 1
    
    db.commit()
    
    # Get teacher name
    teacher = db.query(User).filter(User.id == teacher_code.teacher_id).first()
    
    return TeacherCodeUseResponse(
        success=True,
        message="Successfully activated teacher code",
        teacher_name=teacher.name if teacher else "Unknown Teacher"
    )

@router.get("/student-access", response_model=List[StudentAccessResponse])
async def get_student_access(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all teachers that the current student has access to"""
    access_records = db.query(StudentTeacherAccess).filter(
        StudentTeacherAccess.student_id == current_user.id,
        StudentTeacherAccess.is_active == True
    ).all()
    
    response = []
    for access in access_records:
        teacher = db.query(User).filter(User.id == access.teacher_id).first()
        response.append(StudentAccessResponse(
            student_id=access.student_id,
            student_name=current_user.name,
            teacher_id=access.teacher_id,
            teacher_name=teacher.name if teacher else "Unknown Teacher",
            granted_at=access.granted_at,
            is_active=access.is_active
        ))
    
    return response

@router.get("/check-teacher-assignment")
async def check_teacher_assignment(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check if the current user has a teacher assigned"""
    # Check if user has any active teacher assignments
    access_record = db.query(StudentTeacherAccess).filter(
        StudentTeacherAccess.student_id == current_user.id,
        StudentTeacherAccess.is_active == True
    ).first()
    
    if access_record:
        # Get teacher details
        teacher = db.query(User).filter(User.id == access_record.teacher_id).first()
        return {
            "has_teacher": True,
            "teacher_id": access_record.teacher_id,
            "teacher_name": teacher.name if teacher else "Unknown Teacher",
            "assigned_at": access_record.granted_at
        }
    else:
        return {
            "has_teacher": False,
            "teacher_id": None,
            "teacher_name": None,
            "assigned_at": None
        }

@router.delete("/teacher-codes/{code_id}")
@require_role("teacher")
async def delete_teacher_code(
    code_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a teacher code"""
    teacher_code = db.query(TeacherCode).filter(
        TeacherCode.id == code_id,
        TeacherCode.teacher_id == current_user.id
    ).first()
    
    if not teacher_code:
        raise HTTPException(status_code=404, detail="Teacher code not found")
    
    db.delete(teacher_code)
    db.commit()
    
    return {"message": "Teacher code deleted successfully"}