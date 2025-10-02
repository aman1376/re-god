#!/usr/bin/env python3
"""
Data seeding script for REGOD Backend
Creates sample courses, users, and teacher-student relationships
"""
import asyncio
import uuid
from datetime import datetime
from sqlalchemy.orm import Session
from app.database import get_db, engine
from app.models import User, Course, Module, Chapter, Role, UserRoleAssignment, StudentTeacherAccess, UserCourseProgress
from app.utils.security import get_password_hash

def create_sample_data():
    """Create sample data for testing"""
    db = next(get_db())
    
    try:
        # Create roles if they don't exist
        student_role = db.query(Role).filter(Role.name == "student").first()
        if not student_role:
            student_role = Role(name="student", description="Student role")
            db.add(student_role)
        
        teacher_role = db.query(Role).filter(Role.name == "teacher").first()
        if not teacher_role:
            teacher_role = Role(name="teacher", description="Teacher role")
            db.add(teacher_role)
        
        admin_role = db.query(Role).filter(Role.name == "admin").first()
        if not admin_role:
            admin_role = Role(name="admin", description="Admin role")
            db.add(admin_role)
        
        db.commit()
        
        # Create sample teacher
        teacher = db.query(User).filter(User.email == "teacher@example.com").first()
        if not teacher:
            teacher = User(
                id=uuid.uuid4(),
                email="teacher@example.com",
                name="Sample Teacher",
                is_verified=True,
                is_active=True
            )
            db.add(teacher)
            db.commit()
            db.refresh(teacher)
            
            # Assign teacher role
            teacher_role_assignment = UserRoleAssignment(user_id=teacher.id, role_id=teacher_role.id)
            db.add(teacher_role_assignment)
            db.commit()
        
        # Create sample student
        student = db.query(User).filter(User.email == "student@example.com").first()
        if not student:
            student = User(
                id=uuid.uuid4(),
                email="student@example.com",
                name="Sample Student",
                is_verified=True,
                is_active=True
            )
            db.add(student)
            db.commit()
            db.refresh(student)
            
            # Assign student role
            student_role_assignment = UserRoleAssignment(user_id=student.id, role_id=student_role.id)
            db.add(student_role_assignment)
            db.commit()
        
        # Create teacher-student relationship
        existing_access = db.query(StudentTeacherAccess).filter(
            StudentTeacherAccess.student_id == student.id,
            StudentTeacherAccess.teacher_id == teacher.id
        ).first()
        
        if not existing_access:
            access = StudentTeacherAccess(
                student_id=student.id,
                teacher_id=teacher.id,
                is_active=True
            )
            db.add(access)
            db.commit()
        
        # Create sample course
        course = db.query(Course).filter(Course.title == "Introduction to Learning").first()
        if not course:
            course = Course(
                title="Introduction to Learning",
                description="A comprehensive course covering the basics of effective learning techniques and strategies.",
                thumbnail_url="/uploads/intro-course.jpg",
                category="Education",
                difficulty="Beginner",
                created_by=teacher.id,
                is_active=True
            )
            db.add(course)
            db.commit()
            db.refresh(course)
        
        # Create sample chapter
        chapter = db.query(Chapter).filter(Chapter.title == "Getting Started").first()
        if not chapter:
            chapter = Chapter(
                title="Getting Started",
                description="Introduction to the course and learning objectives",
                cover_image_url="/uploads/chapter1.jpg",
                course_id=course.id,
                order=1
            )
            db.add(chapter)
            db.commit()
            db.refresh(chapter)
        
        # Create sample modules
        modules_data = [
            {
                "title": "Welcome to the Course",
                "description": "Introduction and overview of what you'll learn",
                "content": "Welcome to this comprehensive learning course. In this module, we'll cover the fundamentals of effective learning.",
                "order": 1
            },
            {
                "title": "Learning Fundamentals",
                "description": "Understanding how we learn and retain information",
                "content": "This module covers the basic principles of learning and memory retention.",
                "order": 2
            },
            {
                "title": "Practical Application",
                "description": "Applying what you've learned in real-world scenarios",
                "content": "Now that you understand the fundamentals, let's apply them in practical situations.",
                "order": 3
            }
        ]
        
        for module_data in modules_data:
            existing_module = db.query(Module).filter(
                Module.title == module_data["title"],
                Module.course_id == course.id
            ).first()
            
            if not existing_module:
                module = Module(
                    title=module_data["title"],
                    description=module_data["description"],
                    content=module_data["content"],
                    course_id=course.id,
                    chapter_id=chapter.id,
                    order=module_data["order"],
                    is_active=True
                )
                db.add(module)
        
        db.commit()
        
        # Create sample progress for student
        existing_progress = db.query(UserCourseProgress).filter(
            UserCourseProgress.user_id == student.id,
            UserCourseProgress.course_id == course.id
        ).first()
        
        if not existing_progress:
            progress = UserCourseProgress(
                user_id=student.id,
                course_id=course.id,
                progress_percentage=25,  # 25% completed
                last_visited_at=datetime.utcnow()
            )
            db.add(progress)
            db.commit()
        
        print("✅ Sample data created successfully!")
        print(f"Teacher: {teacher.email} (ID: {teacher.id})")
        print(f"Student: {student.email} (ID: {student.id})")
        print(f"Course: {course.title} (ID: {course.id})")
        print(f"Chapters: 1")
        print(f"Modules: {len(modules_data)}")
        
    except Exception as e:
        print(f"❌ Error creating sample data: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_sample_data()








