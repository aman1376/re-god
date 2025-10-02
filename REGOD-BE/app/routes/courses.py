from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
import uuid

from app.database import get_db
from app.models import User, Course, UserCourseProgress, StudentTeacherAccess, Module, Chapter, UserModuleProgress
from app.schemas import DashboardResponse, UserCourseProgressBase, CourseResponse, ModuleResponse, CourseBase, ModuleBase, ChapterBase, ChapterResponse
from app.utils.auth import get_current_user
from app.rbac import require_permission, require_role

router = APIRouter()

@router.get("/user/dashboard", response_model=DashboardResponse)
async def get_user_dashboard(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user dashboard with access control based on teacher relationships"""
    
    # Convert user ID to UUID for database queries
    try:
        user_uuid = uuid.UUID(current_user["id"])
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    
    # For teachers, show all courses they created
    if current_user.get("role") == "teacher":
        # Get teacher's courses
        teacher_courses = db.query(Course).filter(
            Course.created_by == user_uuid
        ).all()

        # Get user's course progress
        user_courses = db.query(UserCourseProgress).filter(
            UserCourseProgress.user_id == user_uuid
        ).all()
        
        # Find last visited course
        last_visited_course = None
        if user_courses:
            user_courses.sort(key=lambda x: x.last_visited_at, reverse=True)
            last_visited = user_courses[0]
            
            last_visited_course = {
                "course_id": last_visited.course_id,
                "course_title": last_visited.course.title,
                "thumbnail_url": last_visited.course.thumbnail_url,
                "last_visited_module_id": last_visited.last_visited_module_id,
                "last_visited_module_title": last_visited.last_visited_module.title if last_visited.last_visited_module else None,
                "overall_progress_percentage": last_visited.progress_percentage,
                "continue_url": f"/learn/{last_visited.course_id}/{last_visited.last_visited_module_id}" if last_visited.last_visited_module_id else f"/learn/{last_visited.course_id}"
            }
        
        # Prepare available courses
        available_courses = []
        for course in teacher_courses:
            # Find progress if exists
            progress = next((uc for uc in user_courses if uc.course_id == course.id), None)
            
            available_courses.append({
                "course_id": course.id,
                "course_title": course.title,
                "description": course.description,
                "thumbnail_url": course.thumbnail_url,
                "category": course.category,
                "difficulty": course.difficulty,
                "progress_percentage": progress.progress_percentage if progress else 0,
                "overall_progress_percentage": progress.progress_percentage if progress else 0,
                "is_new": progress is None,
                "is_continue_available": progress is not None and progress.progress_percentage > 0
            })
    
    # For students, show only courses from teachers they have access to
    elif current_user.get("role") == "student":
        # Get teachers the student has access to
        access_records = db.query(StudentTeacherAccess).filter(
            StudentTeacherAccess.student_id == user_uuid,
            StudentTeacherAccess.is_active == True
        ).all()
        
        teacher_ids = [access.teacher_id for access in access_records]
        
        # Get courses from these teachers
        teacher_courses = db.query(Course).filter(
            Course.created_by.in_(teacher_ids)
        ).all() if teacher_ids else []
        
        # Also include any courses the user has progress in (even if no teacher assigned yet)
        progressed_course_ids = [uc.course_id for uc in db.query(UserCourseProgress).filter(
            UserCourseProgress.user_id == user_uuid
        ).all()]
        progressed_courses = db.query(Course).filter(Course.id.in_(progressed_course_ids)).all() if progressed_course_ids else []
        
        # Combine unique courses by id
        courses_by_id = {}
        for c in teacher_courses + progressed_courses:
            courses_by_id[c.id] = c
        teacher_courses = list(courses_by_id.values())
        
        # Get user's course progress
        user_courses = db.query(UserCourseProgress).filter(
            UserCourseProgress.user_id == user_uuid
        ).all()
        
        # Find last visited course
        last_visited_course = None
        if user_courses:
            user_courses.sort(key=lambda x: x.last_visited_at, reverse=True)
            last_visited = user_courses[0]
            
            last_visited_course = {
                "course_id": last_visited.course_id,
                "course_title": last_visited.course.title,
                "thumbnail_url": last_visited.course.thumbnail_url,
                "last_visited_module_id": last_visited.last_visited_module_id,
                "last_visited_module_title": last_visited.last_visited_module.title if last_visited.last_visited_module else None,
                "overall_progress_percentage": last_visited.progress_percentage,
                "continue_url": f"/learn/{last_visited.course_id}/{last_visited.last_visited_module_id}" if last_visited.last_visited_module_id else f"/learn/{last_visited.course_id}"
            }
        
        # Prepare available courses
        available_courses = []
        for course in teacher_courses:
            # Find progress if exists
            progress = next((uc for uc in user_courses if uc.course_id == course.id), None)
            
            available_courses.append({
                "course_id": course.id,
                "course_title": course.title,
                "description": course.description,
                "thumbnail_url": course.thumbnail_url,
                "category": course.category,
                "difficulty": course.difficulty,
                "progress_percentage": progress.progress_percentage if progress else 0,
                "overall_progress_percentage": progress.progress_percentage if progress else 0,
                "is_new": progress is None,
                "is_continue_available": progress is not None and progress.progress_percentage > 0
            })
    
    # For admins, show all courses
    else:
        # Get all courses
        all_courses = db.query(Course).filter(Course.is_active == True).all()
        
        # Get user's course progress
        user_courses = db.query(UserCourseProgress).filter(
            UserCourseProgress.user_id == user_uuid
        ).all()
        
        # Find last visited course
        last_visited_course = None
        if user_courses:
            user_courses.sort(key=lambda x: x.last_visited_at, reverse=True)
            last_visited = user_courses[0]
            
            last_visited_course = {
                "course_id": last_visited.course_id,
                "course_title": last_visited.course.title,
                "thumbnail_url": last_visited.course.thumbnail_url,
                "last_visited_module_id": last_visited.last_visited_module_id,
                "last_visited_module_title": last_visited.last_visited_module.title if last_visited.last_visited_module else None,
                "overall_progress_percentage": last_visited.progress_percentage,
                "continue_url": f"/learn/{last_visited.course_id}/{last_visited.last_visited_module_id}" if last_visited.last_visited_module_id else f"/learn/{last_visited.course_id}"
            }
        
        # Prepare available courses
        available_courses = []
        for course in all_courses:
            # Find progress if exists
            progress = next((uc for uc in user_courses if uc.course_id == course.id), None)
            
            available_courses.append({
                "course_id": course.id,
                "course_title": course.title,
                "description": course.description,
                "thumbnail_url": course.thumbnail_url,
                "category": course.category,
                "difficulty": course.difficulty,
                "progress_percentage": progress.progress_percentage if progress else 0,
                "overall_progress_percentage": progress.progress_percentage if progress else 0,
                "is_new": progress is None,
                "is_continue_available": progress is not None and progress.progress_percentage > 0
            })
    
    # Get the actual user from database for proper UserResponse
    db_user = db.query(User).filter(User.id == user_uuid).first()
    
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # No dummy/sample data. If no courses, return empty list.
    
    # Create proper UserResponse format with real user data
    user_response = {
        "id": str(db_user.id),
        "email": db_user.email,
        "name": db_user.name,
        "is_verified": bool(db_user.is_verified),
        "onboarding_completed": bool(db_user.onboarding_completed),
        "created_at": db_user.created_at or datetime.utcnow(),
        "roles": [current_user.get("role", "student")]
    }
    
    return DashboardResponse(
        user=user_response,
        last_visited_course=last_visited_course,
        available_courses=available_courses
    )

@router.post("/learn/progress")
async def update_course_progress(
    progress_data: UserCourseProgressBase,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update course progress with automatic calculation based on total modules"""
    try:
        # Check if user has access to this course
        course = db.query(Course).filter(Course.id == progress_data.course_id).first()
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )
        
        # For students, check if they have access to the teacher who created the course
        if current_user.get("role") == "student":
            user_uuid = uuid.UUID(current_user["id"])
            has_access = db.query(StudentTeacherAccess).filter(
                StudentTeacherAccess.student_id == user_uuid,
                StudentTeacherAccess.teacher_id == course.created_by,
                StudentTeacherAccess.is_active == True
            ).first()
            
            if not has_access:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have access to this course"
                )
        
        # Get total chapters in the course
        total_chapters = db.query(Chapter).filter(
            Chapter.course_id == progress_data.course_id,
            Chapter.is_active == True
        ).count()
        
        # Calculate progress based on request type
        if progress_data.progress_percentage is not None:
            # Use provided progress percentage
            new_progress = progress_data.progress_percentage
        else:
            # Calculate progress based on individual modules across all chapters
            user_uuid = uuid.UUID(current_user["id"])
            
            # Get all modules in the course
            total_modules = db.query(Module).filter(
                Module.course_id == progress_data.course_id,
                Module.is_active == True
            ).count()
            
            if total_modules > 0:
                # Get completed modules for this course
                completed_modules = db.query(UserModuleProgress).filter(
                    UserModuleProgress.user_id == user_uuid,
                    UserModuleProgress.course_id == progress_data.course_id,
                    UserModuleProgress.status == 'completed'
                ).count()
                
                # Calculate progress based on completed modules
                new_progress = (completed_modules / total_modules) * 100
            else:
                new_progress = 100  # If no modules, mark as complete
        
        # Find or create user course progress
        user_uuid = uuid.UUID(current_user["id"])
        user_progress = db.query(UserCourseProgress).filter(
            UserCourseProgress.user_id == user_uuid,
            UserCourseProgress.course_id == progress_data.course_id
        ).first()
        
        if not user_progress:
            user_progress = UserCourseProgress(
                user_id=user_uuid,
                course_id=progress_data.course_id,
                progress_percentage=new_progress,
                last_visited_module_id=progress_data.last_visited_module_id
            )
            db.add(user_progress)
        else:
            user_progress.progress_percentage = new_progress
            if progress_data.last_visited_module_id:
                user_progress.last_visited_module_id = progress_data.last_visited_module_id
        
        db.commit()
        db.refresh(user_progress)
        
        return {
            "success": True, 
            "updated_progress_percentage": user_progress.progress_percentage
        }
    except Exception as e:
        import traceback
        print(f"Error in update_course_progress: {e}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={"error": {"code": "INTERNAL_ERROR", "message": f"Internal server error: {str(e)}"}}
        )

@router.get("/courses/{course_id}/module-progress")
async def get_module_progress(
    course_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get module completion status for a course"""
    try:
        user_uuid = uuid.UUID(current_user["id"])
        
        # Check if user has access to this course
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )
        
        # For students, check if they have access to the teacher who created the course
        if current_user.get("role") == "student":
            has_access = db.query(StudentTeacherAccess).filter(
                StudentTeacherAccess.student_id == user_uuid,
                StudentTeacherAccess.teacher_id == course.created_by,
                StudentTeacherAccess.is_active == True
            ).first()
            
            if not has_access:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have access to this course"
                )
        
        # Get all modules for the course
        modules = db.query(Module).filter(
            Module.course_id == course_id,
            Module.is_active == True
        ).order_by(Module.order).all()
        
        # Get completed modules for the user
        completed_modules = db.query(UserModuleProgress).filter(
            UserModuleProgress.user_id == user_uuid,
            UserModuleProgress.course_id == course_id,
            UserModuleProgress.status == 'completed'
        ).all()
        
        completed_module_ids = {m.module_id for m in completed_modules}
        
        # Return module progress
        modules_progress = []
        for module in modules:
            modules_progress.append({
                "moduleId": module.id,
                "completed": module.id in completed_module_ids
            })
        
        return {"modules": modules_progress}
        
    except Exception as e:
        import traceback
        print(f"Error in get_module_progress: {e}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={"error": {"code": "INTERNAL_ERROR", "message": f"Internal server error: {str(e)}"}}
        )

@router.get("/courses/{course_id}/detailed-progress")
async def get_detailed_progress(
    course_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed progress information including course and chapter progress"""
    try:
        user_uuid = uuid.UUID(current_user["id"])
        
        # Check if user has access to this course
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )
        
        # For students, check if they have access to the teacher who created the course
        if current_user.get("role") == "student":
            has_access = db.query(StudentTeacherAccess).filter(
                StudentTeacherAccess.student_id == user_uuid,
                StudentTeacherAccess.teacher_id == course.created_by,
                StudentTeacherAccess.is_active == True
            ).first()
            
            if not has_access:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have access to this course"
                )
        
        # Get all chapters in the course
        chapters = db.query(Chapter).filter(
            Chapter.course_id == course_id,
            Chapter.is_active == True
        ).order_by(Chapter.order).all()
        
        # Get all modules in the course
        all_modules = db.query(Module).filter(
            Module.course_id == course_id,
            Module.is_active == True
        ).all()
        
        # Get completed modules for this course
        completed_modules = db.query(UserModuleProgress).filter(
            UserModuleProgress.user_id == user_uuid,
            UserModuleProgress.course_id == course_id,
            UserModuleProgress.status == 'completed'
        ).all()
        
        completed_module_ids = {m.module_id for m in completed_modules}
        
        # Calculate course progress (total modules across all chapters)
        total_course_modules = len(all_modules)
        completed_course_modules = len(completed_module_ids)
        course_progress = (completed_course_modules / total_course_modules * 100) if total_course_modules > 0 else 0
        
        # Calculate chapter progress
        chapter_progress = []
        current_chapter = None
        next_chapter = None
        
        for i, chapter in enumerate(chapters):
            # Get modules in this chapter
            chapter_modules = [m for m in all_modules if m.chapter_id == chapter.id]
            total_chapter_modules = len(chapter_modules)
            
            # Count completed modules in this chapter
            completed_chapter_modules = sum(1 for m in chapter_modules if m.id in completed_module_ids)
            chapter_progress_percentage = (completed_chapter_modules / total_chapter_modules * 100) if total_chapter_modules > 0 else 0
            
            is_chapter_complete = chapter_progress_percentage >= 100
            
            chapter_progress.append({
                "chapter_id": chapter.id,
                "chapter_title": chapter.title,
                "cover_image_url": chapter.cover_image_url,
                "order": chapter.order,
                "total_modules": total_chapter_modules,
                "completed_modules": completed_chapter_modules,
                "progress_percentage": chapter_progress_percentage,
                "is_completed": is_chapter_complete
            })
            
            # Find current chapter (first chapter with modules that has progress < 100%)
            if not current_chapter and total_chapter_modules > 0 and not is_chapter_complete:
                current_chapter = {
                    "chapter_id": chapter.id,
                    "chapter_title": chapter.title,
                    "cover_image_url": chapter.cover_image_url,
                    "order": chapter.order,
                    "total_modules": total_chapter_modules,
                    "completed_modules": completed_chapter_modules,
                    "progress_percentage": chapter_progress_percentage,
                    "is_completed": is_chapter_complete
                }
            
            # Find next chapter (first chapter after current that has modules)
            if current_chapter and not next_chapter and i > current_chapter.get("order", 0) and total_chapter_modules > 0:
                next_chapter = {
                    "chapter_id": chapter.id,
                    "chapter_title": chapter.title,
                    "cover_image_url": chapter.cover_image_url,
                    "order": chapter.order,
                    "total_modules": total_chapter_modules,
                    "completed_modules": completed_chapter_modules,
                    "progress_percentage": chapter_progress_percentage,
                    "is_completed": is_chapter_complete
                }
        
        # If all chapters are complete, set next_chapter to None
        if all(ch["is_completed"] for ch in chapter_progress):
            next_chapter = None
        
        return {
            "course_id": course_id,
            "course_progress": {
                "total_modules": total_course_modules,
                "completed_modules": completed_course_modules,
                "progress_percentage": course_progress
            },
            "current_chapter": current_chapter,
            "next_chapter": next_chapter,
            "chapters": chapter_progress
        }
        
    except Exception as e:
        import traceback
        print(f"Error in get_detailed_progress: {e}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={"error": {"code": "INTERNAL_ERROR", "message": f"Internal server error: {str(e)}"}}
        )

@router.get("/courses/{course_id}/chapter-progress")
async def get_chapter_progress(
    course_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed chapter progress with module completion counts"""
    try:
        user_uuid = uuid.UUID(current_user["id"])
        
        # Check if user has access to this course
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )
        
        # For students, check if they have access to the teacher who created the course
        if current_user.get("role") == "student":
            has_access = db.query(StudentTeacherAccess).filter(
                StudentTeacherAccess.student_id == user_uuid,
                StudentTeacherAccess.teacher_id == course.created_by,
                StudentTeacherAccess.is_active == True
            ).first()
            
            if not has_access:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have access to this course"
                )
        
        # Get all chapters in the course
        chapters = db.query(Chapter).filter(
            Chapter.course_id == course_id,
            Chapter.is_active == True
        ).order_by(Chapter.order).all()
        
        chapter_progress = []
        
        for chapter in chapters:
            # Get all modules in this chapter
            chapter_modules = db.query(Module).filter(
                Module.chapter_id == chapter.id,
                Module.is_active == True
            ).order_by(Module.order).all()
            
            # Get completed modules for this chapter
            completed_modules = db.query(UserModuleProgress).filter(
                UserModuleProgress.user_id == user_uuid,
                UserModuleProgress.course_id == course_id,
                UserModuleProgress.status == 'completed',
                UserModuleProgress.module_id.in_([m.id for m in chapter_modules])
            ).all()
            
            completed_module_ids = {m.module_id for m in completed_modules}
            
            # Calculate chapter progress
            total_modules = len(chapter_modules)
            completed_count = len(completed_modules)
            progress_percentage = (completed_count / total_modules * 100) if total_modules > 0 else 0
            
            # Find the next incomplete module in this chapter
            next_module = None
            for module in chapter_modules:
                if module.id not in completed_module_ids:
                    next_module = module
                    break
            
            chapter_progress.append({
                "chapter_id": chapter.id,
                "chapter_title": chapter.title,
                "cover_image_url": chapter.cover_image_url,
                "order": chapter.order,
                "total_modules": total_modules,
                "completed_modules": completed_count,
                "progress_percentage": progress_percentage,
                "is_completed": completed_count == total_modules and total_modules > 0,
                "next_module": {
                    "id": next_module.id,
                    "title": next_module.title,
                    "description": next_module.description,
                    "header_image_url": next_module.header_image_url
                } if next_module else None
            })
        
        return {
            "course_id": course_id,
            "chapters": chapter_progress
        }
        
    except Exception as e:
        import traceback
        print(f"Error in get_chapter_progress: {e}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={"error": {"code": "INTERNAL_ERROR", "message": f"Internal server error: {str(e)}"}}
        )

@router.get("/courses", response_model=List[CourseResponse])
async def get_courses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all courses with access control"""
    if current_user.get("role") == "admin":
        # Admins can see all courses
        courses = db.query(Course).filter(Course.is_active == True).all()
    elif current_user.get("role") == "teacher":
        # Teachers can see their own courses
        courses = db.query(Course).filter(
            Course.created_by == current_user["id"],
            Course.is_active == True
        ).all()
    else:
        # Students can only see courses from teachers they have access to
        access_records = db.query(StudentTeacherAccess).filter(
            StudentTeacherAccess.student_id == current_user["id"],
            StudentTeacherAccess.is_active == True
        ).all()
        
        teacher_ids = [access.teacher_id for access in access_records]
        
        if not teacher_ids:
            return []
            
        courses = db.query(Course).filter(
            Course.created_by.in_(teacher_ids),
            Course.is_active == True
        ).all()
    
    # Normalize response for FE/mobile
    return [
        CourseResponse.model_validate({
            "id": c.id,
            "title": c.title,
            "description": c.description,
            "thumbnail_url": c.thumbnail_url,
            "category": c.category,
            "difficulty": c.difficulty,
            "total_modules": c.total_modules,
            "created_by": str(c.created_by),
            "created_at": c.created_at,
        }) for c in courses
    ]

@router.get("/courses/{course_id}/modules", response_model=List[ModuleResponse])
async def get_course_modules(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get modules for a specific course with access control"""
    # Check if user has access to this course
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )
    
    # Check access for students
    if current_user.get("role") == "student":
        has_access = db.query(StudentTeacherAccess).filter(
            StudentTeacherAccess.student_id == current_user["id"],
            StudentTeacherAccess.teacher_id == course.created_by,
            StudentTeacherAccess.is_active == True
        ).first()
        
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this course"
            )
    
    # Get modules for the course
    modules = db.query(Module).filter(
        Module.course_id == course_id,
        Module.is_active == True
    ).order_by(Module.order).all()
    
    return [
        ModuleResponse.model_validate({
            "id": m.id,
            "course_id": m.course_id,
            "title": m.title,
            "description": m.description,
            "order": m.order,
            "chapter_id": m.chapter_id,
            "content": m.content,
            "key_verses": m.key_verses,
            "key_verses_ref": m.key_verses_ref,
            "key_verses_json": m.key_verses_json,
            "lesson_study": m.lesson_study,
            "lesson_study_ref": m.lesson_study_ref,
            "response_prompt": m.response_prompt,
            "music_selection": m.music_selection,
            "further_study": m.further_study,
            "further_study_json": m.further_study_json,
            "personal_experiences": m.personal_experiences,
            "resources": m.resources,
            "resources_json": m.resources_json,
            "artwork": m.artwork,
            "header_image_url": m.header_image_url,
            "media_url": m.media_url,
            "quiz": m.quiz,
        }) for m in modules
    ]


@router.post("/courses", response_model=CourseResponse)
@require_role(["admin", "teacher"])
async def create_course(
    payload: CourseBase,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    course = Course(
        title=payload.title,
        description=payload.description,
        thumbnail_url=payload.thumbnail_url,
        category=payload.category,
        difficulty=payload.difficulty,
        created_by=current_user["id"],
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return CourseResponse.model_validate({
        "id": course.id,
        "title": course.title,
        "description": course.description,
        "thumbnail_url": course.thumbnail_url,
        "category": course.category,
        "difficulty": course.difficulty,
        "total_modules": course.total_modules,
        "created_by": str(course.created_by),
        "created_at": course.created_at,
    })


@router.put("/courses/{course_id}", response_model=CourseResponse)
@require_role(["admin", "teacher"])
async def update_course(
    course_id: int,
    payload: CourseBase,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if not current_user.get("role") == "admin" and course.created_by != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not allowed")

    course.title = payload.title
    course.description = payload.description
    course.thumbnail_url = payload.thumbnail_url
    course.category = payload.category
    course.difficulty = payload.difficulty
    db.commit()
    db.refresh(course)
    return CourseResponse.model_validate({
        "id": course.id,
        "title": course.title,
        "description": course.description,
        "thumbnail_url": course.thumbnail_url,
        "category": course.category,
        "difficulty": course.difficulty,
        "total_modules": course.total_modules,
        "created_by": str(course.created_by),
        "created_at": course.created_at,
    })


@router.post("/courses/{course_id}/modules", response_model=ModuleResponse)
@require_role(["admin", "teacher"])
async def create_module(
    course_id: int,
    payload: ModuleBase,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Only admins or the teacher who owns the course can create modules
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if not current_user.get("role") == "admin" and course.created_by != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not allowed")

    module = Module(
        course_id=course_id,
        title=payload.title,
        description=payload.description,
        chapter_id=payload.chapter_id,
        content=payload.content,
        key_verses=payload.key_verses,
        key_verses_ref=payload.key_verses_ref,
        key_verses_json=payload.key_verses_json,
        lesson_study=payload.lesson_study,
        lesson_study_ref=payload.lesson_study_ref,
        response_prompt=payload.response_prompt,
        music_selection=payload.music_selection,
        further_study=payload.further_study,
        further_study_json=payload.further_study_json,
        personal_experiences=payload.personal_experiences,
        resources=payload.resources,
        resources_json=payload.resources_json,
        artwork=payload.artwork,
        header_image_url=payload.header_image_url,
        media_url=payload.media_url,
        quiz=payload.quiz,
        order=payload.order,
        is_active=True,
    )
    db.add(module)
    db.commit()
    db.refresh(module)
    return ModuleResponse.model_validate({
        "id": module.id,
        "course_id": module.course_id,
        "title": module.title,
        "description": module.description,
        "order": module.order,
        "chapter_id": module.chapter_id,
        "content": module.content,
            "key_verses": module.key_verses,
            "key_verses_ref": module.key_verses_ref,
            "key_verses_json": module.key_verses_json,
            "lesson_study": module.lesson_study,
            "lesson_study_ref": module.lesson_study_ref,
        "response_prompt": module.response_prompt,
        "music_selection": module.music_selection,
        "further_study": module.further_study,
        "further_study_json": module.further_study_json,
        "personal_experiences": module.personal_experiences,
        "resources": module.resources,
        "resources_json": module.resources_json,
        "artwork": module.artwork,
        "header_image_url": module.header_image_url,
        "media_url": module.media_url,
        "quiz": module.quiz,
    })


@router.put("/courses/{course_id}/modules/{module_id}", response_model=ModuleResponse)
@require_role(["admin", "teacher"])
async def update_module(
    course_id: int,
    module_id: int,
    payload: ModuleBase,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    module = db.query(Module).filter(Module.id == module_id, Module.course_id == course_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Lesson not found")
    if not current_user.get("role") == "admin" and course.created_by != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not allowed")

    module.title = payload.title
    module.description = payload.description
    module.order = payload.order
    module.chapter_id = payload.chapter_id
    module.content = payload.content
    module.key_verses = payload.key_verses
    module.key_verses_ref = payload.key_verses_ref
    module.key_verses_json = payload.key_verses_json
    module.lesson_study = payload.lesson_study
    module.lesson_study_ref = payload.lesson_study_ref
    module.response_prompt = payload.response_prompt
    module.music_selection = payload.music_selection
    module.further_study = payload.further_study
    module.further_study_json = payload.further_study_json
    module.personal_experiences = payload.personal_experiences
    module.resources = payload.resources
    module.resources_json = payload.resources_json
    module.artwork = payload.artwork
    module.header_image_url = payload.header_image_url
    module.media_url = payload.media_url
    module.quiz = payload.quiz

    db.commit()
    db.refresh(module)
    return ModuleResponse.model_validate({
        "id": module.id,
        "course_id": module.course_id,
        "title": module.title,
        "description": module.description,
        "order": module.order,
        "chapter_id": module.chapter_id,
        "content": module.content,
        "key_verses": module.key_verses,
        "key_verses_ref": module.key_verses_ref,
        "key_verses_json": module.key_verses_json,
        "lesson_study": module.lesson_study,
        "lesson_study_ref": module.lesson_study_ref,
        "response_prompt": module.response_prompt,
        "music_selection": module.music_selection,
        "further_study": module.further_study,
        "personal_experiences": module.personal_experiences,
            "resources": module.resources,
            "artwork": module.artwork,
            "header_image_url": module.header_image_url,
            "media_url": module.media_url,
            "quiz": module.quiz,
    })


@router.post("/courses/{course_id}/chapters", response_model=ChapterResponse)
@require_role(["admin", "teacher"])
async def create_chapter(
    course_id: int,
    payload: ChapterBase,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if not current_user.get("role") == "admin" and course.created_by != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not allowed")

    chapter = Chapter(
        course_id=course_id,
        title=payload.title,
        cover_image_url=payload.cover_image_url,
        order=payload.order,
        quiz=payload.quiz,
        is_active=True,
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
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    chapters = db.query(Chapter).filter(Chapter.course_id == course_id, Chapter.is_active == True).order_by(Chapter.order).all()
    return chapters


@router.put("/courses/{course_id}/chapters/{chapter_id}", response_model=ChapterResponse)
@require_role(["admin", "teacher"])
async def update_chapter(
    course_id: int,
    chapter_id: int,
    payload: ChapterBase,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id, Chapter.course_id == course_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course or (not current_user.get("role") == "admin" and course.created_by != current_user["id"]):
        raise HTTPException(status_code=403, detail="Not allowed")
    chapter.title = payload.title
    chapter.cover_image_url = payload.cover_image_url
    chapter.order = payload.order
    chapter.quiz = payload.quiz
    db.commit()
    db.refresh(chapter)
    return chapter