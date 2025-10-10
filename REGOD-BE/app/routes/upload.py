from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import os
import uuid
from datetime import datetime
import httpx
from typing import Optional

from app.database import get_db
from app.utils.auth import get_current_user
from app.models import User, Course, Chapter, Module
from app.rbac import require_role

router = APIRouter()

# Supabase configuration
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Helper function for uploading to Supabase
async def upload_to_supabase(bucket: str, file_path: str, file_content: bytes, content_type: str) -> str:
    """Upload file to Supabase storage using service role key"""
    
    # Check if Supabase is configured
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(
            status_code=503, 
            detail="Supabase storage is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables."
        )
    
    if not SUPABASE_URL.startswith('http'):
        raise HTTPException(
            status_code=503,
            detail=f"Invalid SUPABASE_URL: {SUPABASE_URL}. Must start with http:// or https://"
        )
    
    upload_url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{file_path}"
    
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "apikey": SUPABASE_SERVICE_KEY,
        "Content-Type": content_type,
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            upload_url,
            headers=headers,
            content=file_content
        )
    
    if response.status_code not in [200, 201]:
        error_detail = response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
        raise HTTPException(status_code=response.status_code, detail=f"Upload failed: {error_detail}")
    
    # Generate public URL
    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{file_path}"
    return public_url

# Helper function to delete from Supabase
async def delete_from_supabase(bucket: str, file_path: str):
    """Delete file from Supabase storage using service role key"""
    delete_url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{file_path}"
    
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "apikey": SUPABASE_SERVICE_KEY,
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.delete(delete_url, headers=headers)
    
    if response.status_code not in [200, 204, 404]:
        error_detail = response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
        raise HTTPException(status_code=response.status_code, detail=f"Delete failed: {error_detail}")

@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload user avatar to Supabase storage"""
    
    # Validate file type
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Validate file size (5MB max)
    file_content = await file.read()
    if len(file_content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size must be less than 5MB")
    
    try:
        # Get user from database
        user = db.query(User).filter(User.id == current_user["id"]).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Generate unique filename
        file_extension = file.filename.split('.')[-1].lower() if '.' in file.filename else 'jpg'
        filename = f"user_{user.id}/avatar_{int(datetime.now().timestamp())}.{file_extension}"
        
        # Upload to Supabase using service role key
        public_url = await upload_to_supabase("avatars", filename, file_content, file.content_type)
        
        # Update user's avatar URL in database
        user.avatar_url = public_url
        db.commit()
        db.refresh(user)
        
        return JSONResponse(content={
            "success": True,
            "message": "Avatar uploaded successfully",
            "avatar_url": public_url,
            "filename": filename
        })
        
    except Exception as e:
        print(f"Avatar upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.delete("/avatar")
async def delete_avatar(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete user's current avatar"""
    
    try:
        # Get user from database
        user = db.query(User).filter(User.id == current_user["id"]).first()
        if not user or not user.avatar_url:
            raise HTTPException(status_code=404, detail="No avatar found")
        
        # Extract filename from avatar URL
        if "storage/v1/object/public/avatars/" in user.avatar_url:
            filename = user.avatar_url.split("storage/v1/object/public/avatars/")[1]
            
            # Delete from Supabase
            await delete_from_supabase("avatars", filename)
            
            # Clear avatar URL from database
            user.avatar_url = None
            db.commit()
            
            return JSONResponse(content={
                "success": True,
                "message": "Avatar deleted successfully"
            })
        else:
            raise HTTPException(status_code=400, detail="Invalid avatar URL format")
            
    except Exception as e:
        print(f"Avatar deletion error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Deletion failed: {str(e)}")

@router.post("/course-cover")
async def upload_course_cover(
    file: UploadFile = File(...),
    course_id: int = Form(...),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload course cover image"""
    
    # Check permissions
    current_user_roles = current_user.get("roles", [])
    if "admin" not in current_user_roles and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can upload course covers")
    
    # Validate file type
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Validate file size (5MB max)
    file_content = await file.read()
    if len(file_content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size must be less than 5MB")
    
    try:
        # Verify course exists
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        
        # Generate filename
        file_extension = file.filename.split('.')[-1].lower() if '.' in file.filename else 'jpg'
        filename = f"course_{course_id}/course_cover.{file_extension}"
        
        # Upload to Supabase
        public_url = await upload_to_supabase("courses", filename, file_content, file.content_type)
        
        # Update course cover URL in database
        course.cover_image_url = public_url
        db.commit()
        db.refresh(course)
        
        return JSONResponse(content={
            "success": True,
            "message": "Course cover uploaded successfully",
            "cover_url": public_url,
            "filename": filename
        })
        
    except Exception as e:
        print(f"Course cover upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.post("/chapter-thumbnail")
async def upload_chapter_thumbnail(
    file: UploadFile = File(...),
    course_id: int = Form(...),
    chapter_id: int = Form(...),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload chapter thumbnail image"""
    
    # Check permissions
    current_user_roles = current_user.get("roles", [])
    if "admin" not in current_user_roles and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can upload chapter thumbnails")
    
    # Validate file type
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Validate file size (5MB max)
    file_content = await file.read()
    if len(file_content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size must be less than 5MB")
    
    try:
        # Verify course and chapter exist
        course = db.query(Course).filter(Course.id == course_id).first()
        chapter = db.query(Chapter).filter(Chapter.id == chapter_id, Chapter.course_id == course_id).first()
        
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        if not chapter:
            raise HTTPException(status_code=404, detail="Chapter not found")
        
        # Generate filename
        file_extension = file.filename.split('.')[-1].lower() if '.' in file.filename else 'jpg'
        filename = f"course_{course_id}/chapters/chapter_{chapter_id}/thumbnail.{file_extension}"
        
        # Upload to Supabase
        public_url = await upload_to_supabase("courses", filename, file_content, file.content_type)
        
        # Update chapter thumbnail URL in database
        chapter.thumbnail_url = public_url
        db.commit()
        db.refresh(chapter)
        
        return JSONResponse(content={
            "success": True,
            "message": "Chapter thumbnail uploaded successfully",
            "thumbnail_url": public_url,
            "filename": filename
        })
        
    except Exception as e:
        print(f"Chapter thumbnail upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.post("/lesson-image")
async def upload_lesson_image(
    file: UploadFile = File(...),
    course_id: int = Form(...),
    chapter_id: int = Form(...),
    lesson_id: int = Form(...),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload lesson image"""
    
    # Check permissions
    current_user_roles = current_user.get("roles", [])
    if "admin" not in current_user_roles and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can upload lesson images")
    
    # Validate file type
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Validate file size (5MB max)
    file_content = await file.read()
    if len(file_content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size must be less than 5MB")
    
    try:
        # Verify course, chapter, and lesson exist
        course = db.query(Course).filter(Course.id == course_id).first()
        chapter = db.query(Chapter).filter(Chapter.id == chapter_id, Chapter.course_id == course_id).first()
        lesson = db.query(Module).filter(Module.id == lesson_id, Module.chapter_id == chapter_id).first()
        
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        if not chapter:
            raise HTTPException(status_code=404, detail="Chapter not found")
        if not lesson:
            raise HTTPException(status_code=404, detail="Lesson not found")
        
        # Generate filename
        file_extension = file.filename.split('.')[-1].lower() if '.' in file.filename else 'jpg'
        filename = f"course_{course_id}/chapters/chapter_{chapter_id}/lessons/lesson_{lesson_id}/image.{file_extension}"
        
        # Upload to Supabase
        public_url = await upload_to_supabase("courses", filename, file_content, file.content_type)
        
        # Update lesson image URL in database
        lesson.image_url = public_url
        db.commit()
        db.refresh(lesson)
        
        return JSONResponse(content={
            "success": True,
            "message": "Lesson image uploaded successfully",
            "image_url": public_url,
            "filename": filename
        })
        
    except Exception as e:
        print(f"Lesson image upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.delete("/course-cover/{course_id}")
async def delete_course_cover(
    course_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete course cover image"""
    
    # Check permissions
    current_user_roles = current_user.get("roles", [])
    if "admin" not in current_user_roles and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete course covers")
    
    try:
        # Get course
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course or not course.cover_image_url:
            raise HTTPException(status_code=404, detail="Course cover not found")
        
        # Extract filename from URL
        if "storage/v1/object/public/courses/" in course.cover_image_url:
            filename = course.cover_image_url.split("storage/v1/object/public/courses/")[1]
            
            # Delete from Supabase
            await delete_from_supabase("courses", filename)
            
            # Clear cover URL from database
            course.cover_image_url = None
            db.commit()
            
            return JSONResponse(content={
                "success": True,
                "message": "Course cover deleted successfully"
            })
        else:
            raise HTTPException(status_code=400, detail="Invalid cover URL format")
            
    except Exception as e:
        print(f"Course cover deletion error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Deletion failed: {str(e)}")

@router.delete("/chapter-thumbnail/{course_id}/{chapter_id}")
async def delete_chapter_thumbnail(
    course_id: int,
    chapter_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete chapter thumbnail image"""
    
    # Check permissions
    current_user_roles = current_user.get("roles", [])
    if "admin" not in current_user_roles and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete chapter thumbnails")
    
    try:
        # Get chapter
        chapter = db.query(Chapter).filter(Chapter.id == chapter_id, Chapter.course_id == course_id).first()
        if not chapter or not chapter.thumbnail_url:
            raise HTTPException(status_code=404, detail="Chapter thumbnail not found")
        
        # Extract filename from URL
        if "storage/v1/object/public/courses/" in chapter.thumbnail_url:
            filename = chapter.thumbnail_url.split("storage/v1/object/public/courses/")[1]
            
            # Delete from Supabase
            await delete_from_supabase("courses", filename)
            
            # Clear thumbnail URL from database
            chapter.thumbnail_url = None
            db.commit()
            
            return JSONResponse(content={
                "success": True,
                "message": "Chapter thumbnail deleted successfully"
            })
        else:
            raise HTTPException(status_code=400, detail="Invalid thumbnail URL format")
            
    except Exception as e:
        print(f"Chapter thumbnail deletion error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Deletion failed: {str(e)}")

@router.delete("/lesson-image/{course_id}/{chapter_id}/{lesson_id}")
async def delete_lesson_image(
    course_id: int,
    chapter_id: int,
    lesson_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete lesson image"""
    
    # Check permissions
    current_user_roles = current_user.get("roles", [])
    if "admin" not in current_user_roles and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete lesson images")
    
    try:
        # Get lesson
        lesson = db.query(Module).filter(
            Module.id == lesson_id, 
            Module.chapter_id == chapter_id,
            Module.chapter.has(course_id=course_id)
        ).first()
        
        if not lesson or not lesson.image_url:
            raise HTTPException(status_code=404, detail="Lesson image not found")
        
        # Extract filename from URL
        if "storage/v1/object/public/courses/" in lesson.image_url:
            filename = lesson.image_url.split("storage/v1/object/public/courses/")[1]
            
            # Delete from Supabase
            await delete_from_supabase("courses", filename)
            
            # Clear image URL from database
            lesson.image_url = None
            db.commit()
            
            return JSONResponse(content={
                "success": True,
                "message": "Lesson image deleted successfully"
            })
        else:
            raise HTTPException(status_code=400, detail="Invalid image URL format")
            
    except Exception as e:
        print(f"Lesson image deletion error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Deletion failed: {str(e)}")
