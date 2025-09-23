from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import User, UserNote, Course, Module, StudentTeacherAccess
from app.schemas import UserResponse, NoteBase, NoteResponse, ShareCourseResponse
from app.utils.auth import get_current_user
from app.rbac import require_permission

router = APIRouter()

@router.get("/profile", response_model=UserResponse)
async def get_user_profile(current_user: User = Depends(get_current_user)):
    """Get current user profile"""
    return current_user

@router.put("/profile", response_model=UserResponse)
async def update_user_profile(
    update_data: dict,  # Using dict for flexibility in fields to update
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user profile"""
    allowed_fields = ["name", "phone", "avatar_url"]
    
    for field, value in update_data.items():
        if field in allowed_fields and hasattr(current_user, field):
            setattr(current_user, field, value)
    
    db.commit()
    db.refresh(current_user)
    return current_user

@router.get("/notes", response_model=List[NoteResponse])
async def get_user_notes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all notes for the current user"""
    notes = db.query(UserNote).filter(
        UserNote.user_id == current_user.id
    ).all()
    
    response = []
    for note in notes:
        course = db.query(Course).filter(Course.id == note.course_id).first()
        lesson = db.query(Module).filter(Module.id == note.lesson_id).first()
        
        response.append(NoteResponse(
            id=note.id,
            user_id=note.user_id,
            course_id=note.course_id,
            lesson_id=note.lesson_id,
            note_content=note.note_content,
            created_at=note.created_at,
            updated_at=note.updated_at,
            course_title=course.title if course else "Unknown Course",
            lesson_title=lesson.title if lesson else "Unknown Lesson"
        ))
    
    return response

@router.post("/notes", response_model=NoteResponse)
async def create_note(
    note_data: NoteBase,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new note"""
    # Verify course and lesson exist
    course = db.query(Course).filter(Course.id == note_data.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    lesson = db.query(Module).filter(Module.id == note_data.lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    
    # Check access for students
    if current_user.has_role("student"):
        has_access = db.query(StudentTeacherAccess).filter(
            StudentTeacherAccess.student_id == current_user.id,
            StudentTeacherAccess.teacher_id == course.created_by,
            StudentTeacherAccess.is_active == True
        ).first()
        
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this course"
            )
    
    # Create new note
    new_note = UserNote(
        user_id=current_user.id,
        course_id=note_data.course_id,
        lesson_id=note_data.lesson_id,
        note_content=note_data.note_content
    )
    
    db.add(new_note)
    db.commit()
    db.refresh(new_note)
    
    return NoteResponse(
        id=new_note.id,
        user_id=new_note.user_id,
        course_id=new_note.course_id,
        lesson_id=new_note.lesson_id,
        note_content=new_note.note_content,
        created_at=new_note.created_at,
        updated_at=new_note.updated_at,
        course_title=course.title,
        lesson_title=lesson.title
    )

@router.put("/notes/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: int,
    note_data: NoteBase,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a note"""
    note = db.query(UserNote).filter(
        UserNote.id == note_id,
        UserNote.user_id == current_user.id
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a note"""
    note = db.query(UserNote).filter(
        UserNote.id == note_id,
        UserNote.user_id == current_user.id
    ).first()
    
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    db.delete(note)
    db.commit()
    
    return {"message": "Note deleted successfully"}

@router.post("/share/course/{course_id}", response_model=ShareCourseResponse)
async def share_course(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate a shareable link for a course"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check access for students
    if current_user.has_role("student"):
        has_access = db.query(StudentTeacherAccess).filter(
            StudentTeacherAccess.student_id == current_user.id,
            StudentTeacherAccess.teacher_id == course.created_by,
            StudentTeacherAccess.is_active == True
        ).first()
        
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this course"
            )
    
    # Generate a shareable link (in a real app, this might include referral tracking)
    shareable_link = f"https://regod.app/course/{course_id}?ref=user{current_user.id}"
    
    return ShareCourseResponse(shareable_link=shareable_link)