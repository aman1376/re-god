from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid

from app.database import get_db
from app.models import User, UserNote, Course, Module, TeacherAssignment, Role
from app.schemas import UserResponse, UserProfileUpdate, NoteBase, NoteResponse, ShareCourseResponse
from app.utils.auth import get_current_user
from app.rbac import require_permission

router = APIRouter()

@router.get("/profile", response_model=UserResponse)
async def get_user_profile(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user profile"""
    print("[PROFILE] Profile endpoint called!")
    # Get the actual User model from database to include all fields like avatar_url
    user_id = current_user["id"]
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    print(f"[PROFILE] User data: id={user.id}, name={user.name}, email={user.email}, avatar_url={user.avatar_url}")
    
    # Convert to UserResponse format
    user_response = UserResponse(
        id=str(user.id),
        name=user.name,
        email=user.email,
        phone=user.phone,
        age=user.age,
        avatar_url=user.avatar_url,
        church_admin_name=user.church_admin_name,
        home_church=user.home_church,
        country=user.country,
        city=user.city,
        postal_code=user.postal_code,
        church_admin_cell_phone=user.church_admin_cell_phone,
        is_verified=user.is_verified,
        onboarding_completed=user.onboarding_completed,
        created_at=user.created_at,
        last_login=user.last_login,
        roles=[role.name for role in user.roles] if user.roles else []
    )
    
    print(f"[PROFILE] UserResponse: {user_response.dict()}")
    
    return user_response

@router.put("/profile", response_model=UserResponse)
async def update_user_profile(
    update_data: UserProfileUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user profile"""
    # Get the actual User model from database
    user_id = current_user["id"]
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update allowed fields
    update_dict = update_data.dict(exclude_unset=True)
    allowed_fields = [
        "name", "email", "phone", "age", "avatar_url",
        "church_admin_name", "home_church", "country", "city", "postal_code", 
        "church_admin_cell_phone"
    ]
    
    for field, value in update_dict.items():
        if field in allowed_fields and hasattr(user, field):
            setattr(user, field, value)
    
    db.commit()
    db.refresh(user)
    
    # Return updated user response
    return UserResponse(
        id=str(user.id),
        name=user.name,
        email=user.email,
        phone=user.phone,
        age=user.age,
        avatar_url=user.avatar_url,
        church_admin_name=user.church_admin_name,
        home_church=user.home_church,
        country=user.country,
        city=user.city,
        postal_code=user.postal_code,
        church_admin_cell_phone=user.church_admin_cell_phone,
        is_verified=user.is_verified,
        onboarding_completed=user.onboarding_completed,
        created_at=user.created_at,
        last_login=user.last_login,
        roles=[role.name for role in user.roles] if user.roles else []
    )

@router.get("/notes", response_model=List[NoteResponse])
async def get_user_notes(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all notes for the current user"""
    user_id = uuid.UUID(current_user["id"])
    notes = db.query(UserNote).filter(
        UserNote.user_id == user_id
    ).all()
    
    response = []
    for note in notes:
        course = db.query(Course).filter(Course.id == note.course_id).first()
        lesson = db.query(Module).filter(Module.id == note.lesson_id).first()
        
        response.append(NoteResponse(
            id=note.id,
            user_id=str(note.user_id),
            title=note.title,
            content=note.content,
            course_id=note.course_id,
            lesson_id=note.lesson_id,
            created_at=note.created_at,
            updated_at=note.updated_at or note.created_at
        ))
    
    return response

@router.post("/notes", response_model=NoteResponse)
async def create_note(
    note_data: NoteBase,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new note"""
    # Verify course and lesson exist (if provided)
    course = None
    lesson = None
    
    if note_data.course_id:
        course = db.query(Course).filter(Course.id == note_data.course_id).first()
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
    
    if note_data.lesson_id:
        lesson = db.query(Module).filter(Module.id == note_data.lesson_id).first()
        if not lesson:
            raise HTTPException(status_code=404, detail="Lesson not found")
    
    # Check access for students (if course is provided)
    user_id = uuid.UUID(current_user["id"])
    if current_user.get("role") == "student" and course:
        has_access = db.query(TeacherAssignment).filter(
            TeacherAssignment.student_id == user_id,
            TeacherAssignment.teacher_id == course.created_by,
            TeacherAssignment.active == True
        ).first()
        
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this course"
            )
    
    # Create new note
    new_note = UserNote(
        user_id=user_id,
        course_id=note_data.course_id,
        lesson_id=note_data.lesson_id,
        title=note_data.title,
        content=note_data.content
    )
    
    db.add(new_note)
    db.commit()
    db.refresh(new_note)
    
    return NoteResponse(
        id=new_note.id,
        user_id=str(new_note.user_id),
        title=new_note.title,
        content=new_note.content,
        course_id=new_note.course_id,
        lesson_id=new_note.lesson_id,
        created_at=new_note.created_at,
        updated_at=new_note.updated_at or new_note.created_at
    )

@router.put("/notes/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: int,
    note_data: NoteBase,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a note"""
    user_id = current_user["id"]
    note = db.query(UserNote).filter(
        UserNote.id == note_id,
        UserNote.user_id == user_id
    ).first()
    
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Update note content
    note.note_content = note_data.note_content
    db.commit()
    db.refresh(note)
    
    # Get course and lesson info
    course = db.query(Course).filter(Course.id == note.course_id).first()
    lesson = db.query(Module).filter(Module.id == note.lesson_id).first()
    
    return NoteResponse(
        id=note.id,
        user_id=note.user_id,
        course_id=note.course_id,
        lesson_id=note.lesson_id,
        note_content=note.note_content,
        created_at=note.created_at,
        updated_at=note.updated_at,
        course_title=course.title if course else "Unknown Course",
        lesson_title=lesson.title if lesson else "Unknown Lesson"
    )

@router.delete("/notes/{note_id}")
async def delete_note(
    note_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a note"""
    user_id = current_user["id"]
    note = db.query(UserNote).filter(
        UserNote.id == note_id,
        UserNote.user_id == user_id
    ).first()
    
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    db.delete(note)
    db.commit()
    
    return {"message": "Note deleted successfully"}

@router.delete("/account")
async def delete_account(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete user account (soft delete by deactivating)"""
    user_id = current_user["id"]
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user is a teacher
    user_roles = [role.name for role in user.roles] if user.roles else []
    is_teacher = "teacher" in user_roles or "admin" in user_roles
    
    if is_teacher:
        # If teacher/admin is deleting their account, reassign their students to a default admin
        # First, find the primary admin user (the one with admin role)
        admin_role = db.query(Role).filter(Role.name == "admin").first()
        if admin_role:
            # Get the first active admin user (preferably the system admin)
            default_admin = db.query(User).join(User.roles).filter(
                Role.name == "admin",
                User.is_active == True,
                User.id != user_id  # Don't assign to themselves
            ).first()
            
            if default_admin:
                # Find all active teacher assignments where this user is the teacher
                teacher_assignments = db.query(TeacherAssignment).filter(
                    TeacherAssignment.teacher_id == user_id,
                    TeacherAssignment.active == True
                ).all()
                
                # Reassign all students to the default admin
                reassigned_count = 0
                for assignment in teacher_assignments:
                    assignment.teacher_id = default_admin.id
                    assignment.assigned_by = default_admin.id
                    reassigned_count += 1
                
                if reassigned_count > 0:
                    print(f"Reassigned {reassigned_count} students from teacher {user.email} to admin {default_admin.email}")
                    db.commit()
            else:
                # No other admin found, just deactivate assignments
                db.query(TeacherAssignment).filter(
                    TeacherAssignment.teacher_id == user_id,
                    TeacherAssignment.active == True
                ).update({"active": False})
                db.commit()
    
    # Soft delete: deactivate user instead of deleting to preserve data integrity
    user.is_active = False
    user.email = f"deleted_{user_id}_{user.email}"  # Prevent email conflicts if user wants to re-register
    db.commit()
    
    return {"message": "Account deleted successfully"}

@router.post("/share/course/{course_id}", response_model=ShareCourseResponse)
async def share_course(
    course_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate a shareable link for a course"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check access for students
    user_id = current_user["id"]
    if current_user.get("role") == "student":
        has_access = db.query(TeacherAssignment).filter(
            TeacherAssignment.student_id == user_id,
            TeacherAssignment.teacher_id == course.created_by,
            TeacherAssignment.active == True
        ).first()
        
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this course"
            )
    
    # Generate a shareable link (in a real app, this might include referral tracking)
    shareable_link = f"https://regod.app/course/{course_id}?ref=user{user_id}"
    
    return ShareCourseResponse(shareable_link=shareable_link)