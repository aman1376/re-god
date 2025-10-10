#!/usr/bin/env python3
"""
Script to create an admin user for testing
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app.models import User, Role, Permission, TeacherCode
from app.utils.security import get_password_hash
from datetime import datetime
import random
import string

def generate_teacher_code():
    """Generate a unique teacher code"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))

def create_admin_user():
    """Create an admin user for testing"""
    
    # Create database session
    db = SessionLocal()
    
    try:
        # Test database connection first
        db.execute("SELECT 1")
        print("✅ Database connection successful")
    except Exception as e:
        print(f"❌ Database connection failed: {str(e)}")
        db.close()
        return False
    
    try:
        # Check if admin and teacher roles exist
        admin_role = db.query(Role).filter(Role.name == "admin").first()
        teacher_role = db.query(Role).filter(Role.name == "teacher").first()
        
        if not admin_role or not teacher_role:
            print("❌ Admin or teacher role not found. Please run the reset_db.py script first to create roles and permissions.")
            return False
        
        # Check if admin user already exists
        existing_admin = db.query(User).filter(User.email == "regod.backendstuff1@gmail.com").first()
        if existing_admin:
            print(f"✅ Admin user already exists: {existing_admin.email}")
            # Check if teacher code exists for this admin
            existing_code = db.query(TeacherCode).filter(TeacherCode.teacher_id == existing_admin.id).first()
            if existing_code:
                print(f"✅ Teacher code already exists: {existing_code.code}")
            else:
                # Generate teacher code for existing admin
                teacher_code = TeacherCode(
                    code=generate_teacher_code(),
                    teacher_id=existing_admin.id,
                    max_uses=-1,  # Unlimited uses
                    is_active=True
                )
                db.add(teacher_code)
                db.commit()
                print(f"✅ Teacher code created for existing admin: {teacher_code.code}")
            return True
        
        # Create admin user
        admin_user = User(
            email="regod.backendstuff1@gmail.com",
            name="Toni ",
            hashed_password=get_password_hash("admin@regod2025"),  # Default password
            is_verified=True,
            is_active=True,
            onboarding_completed=True,
            clerk_user_id=None  # Will be set when using Clerk
        )
        
        db.add(admin_user)
        db.flush()  # Get the user ID
        
        # Assign both admin and teacher roles
        admin_user.roles.append(admin_role)
        admin_user.roles.append(teacher_role)
        
        # Generate and create teacher code for the admin
        teacher_code = TeacherCode(
            code=generate_teacher_code(),
            teacher_id=admin_user.id,
            max_uses=-1,  # Unlimited uses for admin
            is_active=True
        )
        db.add(teacher_code)
        
        # Commit changes
        db.commit()
        
        print("✅ Admin user created successfully!")
        print(f"   Email: {admin_user.email}")
        print(f"   Password: admin@regod2025")
        print(f"   Roles: admin, teacher")
        print(f"   User ID: {admin_user.id}")
        print(f"   Teacher Code: {teacher_code.code}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error creating admin user: {str(e)}")
        db.rollback()
        return False
    finally:
        db.close()

# def create_test_teacher():
#     """Create a test teacher user"""
    
#     db = SessionLocal()
    
#     try:
#         # Check if teacher role exists
#         teacher_role = db.query(Role).filter(Role.name == "teacher").first()
#         if not teacher_role:
#             print("❌ Teacher role not found.")
#             return False
        
#         # Check if test teacher already exists
#         existing_teacher = db.query(User).filter(User.email == "teacher@regod.com").first()
#         if existing_teacher:
#             print(f"✅ Test teacher already exists: {existing_teacher.email}")
#             return True
        
#         # Create test teacher
#         teacher_user = User(
#             email="teacher@regod.com",
#             name="Test Teacher",
#             hashed_password=get_password_hash("teacher123"),
#             is_verified=True,
#             is_active=True,
#             onboarding_completed=True,
#             clerk_user_id=None
#         )
        
#         db.add(teacher_user)
#         db.flush()
        
#         # Assign teacher role
#         teacher_user.roles.append(teacher_role)
        
#         db.commit()
        
#         print("✅ Test teacher created successfully!")
#         print(f"   Email: teacher@regod.com")
#         print(f"   Password: teacher123")
#         print(f"   Role: teacher")
        
#         return True
        
#     except Exception as e:
#         print(f"❌ Error creating test teacher: {str(e)}")
#         db.rollback()
#         return False
#     finally:
#         db.close()

# def create_test_student():
#     """Create a test student user"""
    
#     db = SessionLocal()
    
#     try:
#         # Check if student role exists (it's called "user" in the system)
#         student_role = db.query(Role).filter(Role.name == "user").first()
#         if not student_role:
#             print("❌ Student role not found.")
#             return False
        
#         # Check if test student already exists
#         existing_student = db.query(User).filter(User.email == "student@regod.com").first()
#         if existing_student:
#             print(f"✅ Test student already exists: {existing_student.email}")
#             return True
        
#         # Create test student
#         student_user = User(
#             email="student@regod.com",
#             name="Test Student",
#             hashed_password=get_password_hash("student123"),
#             is_verified=True,
#             is_active=True,
#             onboarding_completed=True,
#             clerk_user_id=None
#         )
        
#         db.add(student_user)
#         db.flush()
        
#         # Assign student role
#         student_user.roles.append(student_role)
        
#         db.commit()
        
#         print("✅ Test student created successfully!")
#         print(f"   Email: student@regod.com")
#         print(f"   Password: student123")
#         print(f"   Role: user")
        
#         return True
        
#     except Exception as e:
#         print(f"❌ Error creating test student: {str(e)}")
#         db.rollback()
#         return False
#     finally:
#         db.close()

def main():
    """Main function to create test users"""
    print("🚀 Creating test users for RE-God application...")
    print(f"🐳 Running in Docker: {'Yes' if os.path.exists('/.dockerenv') else 'No'}")
    print()
    
    # Retry mechanism for database connection
    max_retries = 5
    retry_delay = 5  # seconds
    
    for attempt in range(max_retries):
        print(f"Attempt {attempt + 1}/{max_retries}: Creating admin user...")
        admin_success = create_admin_user()
        
        if admin_success:
            break
        else:
            if attempt < max_retries - 1:
                print(f"⏳ Waiting {retry_delay} seconds before retry...")
                import time
                time.sleep(retry_delay)
            else:
                print("❌ Failed to create admin user after all retries")
    
    print()
    
    # # Create test teacher
    # print("Creating test teacher...")
    # teacher_success = create_test_teacher()
    # print()
    
    # # Create test student
    # print("Creating test student...")
    # student_success = create_test_student()
    # print()
    
    if admin_success:
        print("🎉 All test users created successfully!")
        print()
        print("📋 Admin Credentials:")
        print("   Email:    regod.backendstuff1@gmail.com")
        print("   Password: admin@regod2025")
        print("   Roles:    admin, teacher")
        print("   Teacher Code: (generated and stored in database)")
        print()
        print("🔗 You can now:")
        print("   1. Login to admin panel: http://localhost:3000/login")
        print("   2. Test teacher invitation flow")
        print("   3. Test student registration with teacher codes")
    else:
        print("❌ Some users failed to create. Check the errors above.")

if __name__ == "__main__":
    main()
