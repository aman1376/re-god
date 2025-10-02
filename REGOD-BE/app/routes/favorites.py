from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid

from app.database import get_db
from app.models import User, UserFavorite, UserChapterFavorite, Module, Chapter, UserModuleProgress
from app.schemas import FavoriteResponse, ChapterFavoriteResponse
from app.utils.auth import get_current_user
from app.rbac import require_permission

router = APIRouter()

@router.post("/favourites/{lesson_id}", response_model=dict)
async def toggle_favorite(
    lesson_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Toggle favorite status for a lesson"""
    # Check if lesson exists
    lesson = db.query(Module).filter(Module.id == lesson_id).first()
    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lesson not found"
        )
    
    # Check if user has access to the course
    from app.models import StudentTeacherAccess, Course
    if current_user.has_role("student"):
        course = db.query(Course).filter(Course.id == lesson.course_id).first()
        if course:
            has_access = db.query(StudentTeacherAccess).filter(
                StudentTeacherAccess.student_id == current_user.id,
                StudentTeacherAccess.teacher_id == course.created_by,
                StudentTeacherAccess.is_active == True
            ).first()
            
            if not has_access:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have access to this lesson"
                )
    
    # Check if already favorited
    existing_favorite = db.query(UserFavorite).filter(
        UserFavorite.user_id == current_user.id,
        UserFavorite.lesson_id == lesson_id
    ).first()
    
    if existing_favorite:
        # Remove from favorites
        db.delete(existing_favorite)
        db.commit()
        return {"action": "removed", "lesson_id": lesson_id}
    else:
        # Add to favorites
        new_favorite = UserFavorite(
            user_id=current_user.id,
            lesson_id=lesson_id
        )
        db.add(new_favorite)
        db.commit()
        db.refresh(new_favorite)
        return {"action": "added", "lesson_id": lesson_id}

@router.get("/favourites", response_model=List[FavoriteResponse])
async def get_favorites(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    page: int = 1,
    limit: int = 20
):
    """Get user's favorite lessons"""
    # Calculate offset
    offset = (page - 1) * limit
    
    # Get user's favorites
    favorites = db.query(UserFavorite).filter(
        UserFavorite.user_id == current_user.id
    ).offset(offset).limit(limit).all()
    
    # Prepare response
    response = []
    for fav in favorites:
        response.append(FavoriteResponse(
            id=fav.id,
            user_id=fav.user_id,
            lesson_id=fav.lesson_id,
            created_at=fav.created_at,
            lesson_title=fav.lesson.title,
            course_title=fav.lesson.course.title,
            thumbnail_url=fav.lesson.course.thumbnail_url
        ))
    
    return response

@router.delete("/favourites/{favorite_id}")
async def delete_favorite(
    favorite_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a favorite by ID"""
    favorite = db.query(UserFavorite).filter(
        UserFavorite.id == favorite_id,
        UserFavorite.user_id == current_user.id
    ).first()
    
    if not favorite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Favorite not found"
        )
    
    db.delete(favorite)
    db.commit()
    
    return {"message": "Favorite removed successfully"}


# Chapter Favorites Endpoints
@router.post("/chapter-favourites/{chapter_id}", response_model=dict)
async def toggle_chapter_favorite(
    chapter_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Toggle favorite status for a chapter"""
    # Check if chapter exists
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chapter not found"
        )
    
    # Check if user has access to the course
    from app.models import StudentTeacherAccess, Course
    user_uuid = uuid.UUID(current_user["id"])
    
    if current_user.get("role") == "student":
        course = db.query(Course).filter(Course.id == chapter.course_id).first()
        if course:
            has_access = db.query(StudentTeacherAccess).filter(
                StudentTeacherAccess.student_id == user_uuid,
                StudentTeacherAccess.teacher_id == course.created_by,
                StudentTeacherAccess.is_active == True
            ).first()
            
            if not has_access:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have access to this chapter"
                )
    
    # Check if already favorited
    existing_favorite = db.query(UserChapterFavorite).filter(
        UserChapterFavorite.user_id == user_uuid,
        UserChapterFavorite.chapter_id == chapter_id
    ).first()
    
    if existing_favorite:
        # Remove from favorites
        db.delete(existing_favorite)
        db.commit()
        return {"action": "removed", "chapter_id": chapter_id}
    else:
        # Add to favorites
        new_favorite = UserChapterFavorite(
            user_id=user_uuid,
            chapter_id=chapter_id
        )
        db.add(new_favorite)
        db.commit()
        db.refresh(new_favorite)
        return {"action": "added", "chapter_id": chapter_id}


@router.get("/chapter-favourites", response_model=List[ChapterFavoriteResponse])
async def get_chapter_favorites(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
    page: int = 1,
    limit: int = 20
):
    """Get user's favorite chapters with progress information"""
    import uuid
    from sqlalchemy import func
    
    # Calculate offset
    offset = (page - 1) * limit
    user_uuid = uuid.UUID(current_user["id"])
    
    # Get user's chapter favorites with progress data
    favorites = db.query(UserChapterFavorite).filter(
        UserChapterFavorite.user_id == user_uuid
    ).offset(offset).limit(limit).all()
    
    # Prepare response with progress information
    response = []
    for fav in favorites:
        chapter = fav.chapter
        course = chapter.course
        
        # Calculate progress for this chapter
        total_modules = db.query(Module).filter(
            Module.chapter_id == chapter.id,
            Module.is_active == True
        ).count()
        
        completed_modules = db.query(Module).join(
            UserModuleProgress, Module.id == UserModuleProgress.module_id
        ).filter(
            UserModuleProgress.user_id == user_uuid,
            UserModuleProgress.course_id == chapter.course_id,
            UserModuleProgress.status == 'completed',
            Module.chapter_id == chapter.id,
            Module.is_active == True
        ).count()
        
        progress_percentage = (completed_modules / total_modules * 100) if total_modules > 0 else 0
        
        response.append(ChapterFavoriteResponse(
            id=fav.id,
            user_id=str(fav.user_id),
            chapter_id=fav.chapter_id,
            course_id=chapter.course_id,
            created_at=fav.created_at,
            chapter_title=chapter.title,
            course_title=course.title,
            cover_image_url=chapter.cover_image_url,
            progress_percentage=progress_percentage,
            completed_modules=completed_modules,
            total_modules=total_modules
        ))
    
    return response


@router.delete("/chapter-favourites/{favorite_id}")
async def delete_chapter_favorite(
    favorite_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a chapter favorite by ID"""
    import uuid
    user_uuid = uuid.UUID(current_user["id"])
    
    favorite = db.query(UserChapterFavorite).filter(
        UserChapterFavorite.id == favorite_id,
        UserChapterFavorite.user_id == user_uuid
    ).first()
    
    if not favorite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chapter favorite not found"
        )
    
    db.delete(favorite)
    db.commit()
    
    return {"message": "Chapter favorite removed successfully"}