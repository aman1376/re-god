from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.database import get_db
from app.models import User, Course, UserCourseProgress, StudentTeacherAccess, Module, Chapter
from app.schemas import DashboardResponse, UserCourseProgressBase, CourseResponse, ModuleResponse, CourseBase, ModuleBase, ChapterBase, ChapterResponse
from app.utils.auth import get_current_user
from app.rbac import require_permission, require_role

router = APIRouter()

@router.get("/test")
async def test_endpoint():
    return {"message": "Test endpoint working"}

@router.get("/user/dashboard", response_model=DashboardResponse)
async def get_user_dashboard(
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """Get user dashboard with access control based on teacher relationships"""
    # Simple test response first
    return {
        "user": {
            "id": str(current_user.id),
            "email": current_user.email,
            "name": current_user.name,
            "role": "student"
        },
        "last_visited_course": {
            "course_id": 4,
            "course_title": "The God You Can Love",
            "thumbnail_url": None,
            "last_visited_module_id": None,
            "last_visited_module_title": None,
            "overall_progress_percentage": 25.0,
            "continue_url": "/learn/4"
        },
        "available_courses": [
            {
                "course_id": 4,
                "course_title": "The God You Can Love",
                "thumbnail_url": None,
                "difficulty": "Easy",
                "progress_percentage": 25.0,
                "is_new": False,
                "is_continue_available": True
            }
        ],
        "recommended_courses": []
    }

@router.get("/courses/{course_id}/modules", response_model=List[ModuleResponse])
async def get_course_modules(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all modules for a specific course"""
    # Check if user has access to this course
    # For now, just return all modules for the course
    modules = db.query(Module).filter(
        Module.course_id == course_id,
        Module.is_active == True
    ).order_by(Module.order).all()
    
    return modules

@router.post("/learn/progress")
async def update_course_progress(
    progress_data: UserCourseProgressBase,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user's course progress"""
    # Find existing progress record
    existing_progress = db.query(UserCourseProgress).filter(
        UserCourseProgress.user_id == current_user.id,
        UserCourseProgress.course_id == progress_data.course_id
    ).first()
    
    if existing_progress:
        # Update existing progress
        existing_progress.progress_percentage = progress_data.progress_percentage
        existing_progress.last_visited_module_id = progress_data.last_visited_module_id
        existing_progress.last_visited_at = datetime.utcnow()
    else:
        # Create new progress record
        new_progress = UserCourseProgress(
            user_id=current_user.id,
            course_id=progress_data.course_id,
            progress_percentage=progress_data.progress_percentage,
            last_visited_module_id=progress_data.last_visited_module_id,
            last_visited_at=datetime.utcnow()
        )
        db.add(new_progress)
    
    db.commit()
    return {"message": "Progress updated successfully"}

# Course management endpoints
@router.get("/courses", response_model=List[CourseResponse])
async def get_courses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all courses accessible to the user"""
    courses = db.query(Course).filter(Course.is_active == True).all()
    return courses

@router.post("/courses", response_model=CourseResponse)
@require_role(["admin", "teacher"])
async def create_course(
    course_data: CourseBase,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new course"""
    course = Course(
        title=course_data.title,
        description=course_data.description,
        thumbnail_url=course_data.thumbnail_url,
        category=course_data.category,
        difficulty=course_data.difficulty,
        created_by=current_user.id
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return course

@router.put("/courses/{course_id}", response_model=CourseResponse)
@require_role(["admin", "teacher"])
async def update_course(
    course_id: int,
    course_data: CourseBase,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a course"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Update fields
    for field, value in course_data.dict(exclude_unset=True).items():
        setattr(course, field, value)
    
    db.commit()
    db.refresh(course)
    return course

@router.post("/courses/{course_id}/modules", response_model=ModuleResponse)
@require_role(["admin", "teacher"])
async def create_module(
    course_id: int,
    module_data: ModuleBase,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new module (lesson) for a course"""
    # Verify course exists
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    module = Module(
        course_id=course_id,
        title=module_data.title,
        description=module_data.description,
        content=module_data.content,
        key_verses=module_data.key_verses,
        key_verses_ref=module_data.key_verses_ref,
        key_verses_json=module_data.key_verses_json,
        lesson_study=module_data.lesson_study,
        lesson_study_ref=module_data.lesson_study_ref,
        response_prompt=module_data.response_prompt,
        music_selection=module_data.music_selection,
        further_study=module_data.further_study,
        further_study_json=module_data.further_study_json,
        personal_experiences=module_data.personal_experiences,
        resources=module_data.resources,
        resources_json=module_data.resources_json,
        artwork=module_data.artwork,
        header_image_url=module_data.header_image_url,
        media_url=module_data.media_url,
        quiz=module_data.quiz,
        chapter_id=module_data.chapter_id,
        order=module_data.order
    )
    db.add(module)
    db.commit()
    db.refresh(module)
    return module

@router.put("/courses/{course_id}/modules/{module_id}", response_model=ModuleResponse)
@require_role(["admin", "teacher"])
async def update_module(
    course_id: int,
    module_id: int,
    module_data: ModuleBase,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a module (lesson)"""
    module = db.query(Module).filter(
        Module.id == module_id,
        Module.course_id == course_id
    ).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    
    # Update fields
    for field, value in module_data.dict(exclude_unset=True).items():
        setattr(module, field, value)
    
    db.commit()
    db.refresh(module)
    return module

# Chapter management endpoints
@router.post("/courses/{course_id}/chapters", response_model=ChapterResponse)
@require_role(["admin", "teacher"])
async def create_chapter(
    course_id: int,
    chapter_data: ChapterBase,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new chapter for a course"""
    # Verify course exists
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    chapter = Chapter(
        course_id=course_id,
        title=chapter_data.title,
        cover_image_url=chapter_data.cover_image_url,
        order=chapter_data.order,
        quiz=chapter_data.quiz
    )
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return chapter

@router.get("/courses/{course_id}/chapters", response_model=List[ChapterResponse])
async def list_chapters(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all chapters for a course"""
    chapters = db.query(Chapter).filter(
        Chapter.course_id == course_id,
        Chapter.is_active == True
    ).order_by(Chapter.order).all()
    return chapters

@router.put("/courses/{course_id}/chapters/{chapter_id}", response_model=ChapterResponse)
@require_role(["admin", "teacher"])
async def update_chapter(
    course_id: int,
    chapter_id: int,
    chapter_data: ChapterBase,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a chapter"""
    chapter = db.query(Chapter).filter(
        Chapter.id == chapter_id,
        Chapter.course_id == course_id
    ).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    
    # Update fields
    for field, value in chapter_data.dict(exclude_unset=True).items():
        setattr(chapter, field, value)
    
    db.commit()
    db.refresh(chapter)
    return chapter
