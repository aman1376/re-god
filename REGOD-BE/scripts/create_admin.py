#!/usr/bin/env python3
"""
Script to create an admin user for testing
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app.models import User, Role, Permission
from app.utils.security import get_password_hash
from datetime import datetime

def create_admin_user():
    """Create an admin user for testing"""
    
    # Create database session
    db = SessionLocal()
    
    try:
        # Check if admin role exists
        admin_role = db.query(Role).filter(Role.name == "admin").first()
        if not admin_role:
            print("❌ Admin role not found. Please run the reset_db.py script first to create roles and permissions.")
            return False
        
        # Check if admin user already exists
        existing_admin = db.query(User).filter(User.email == "admin@regod.com").first()
        if existing_admin:
            print(f"✅ Admin user already exists: {existing_admin.email}")
            return True
        
        # Create admin user
        admin_user = User(
            email="admin@regod.com",
            name="Admin User",
            hashed_password=get_password_hash("admin123"),  # Default password
            is_verified=True,
            is_active=True,
            onboarding_completed=True,
            clerk_user_id=None  # Will be set when using Clerk
        )
        
        db.add(admin_user)
        db.flush()  # Get the user ID
        
        # Assign admin role
        admin_user.roles.append(admin_role)
        
        # Commit changes
        db.commit()
        
        print("✅ Admin user created successfully!")
        print(f"   Email: admin@regod.com")
        print(f"   Password: admin123")
        print(f"   Role: admin")
        print(f"   User ID: {admin_user.id}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error creating admin user: {str(e)}")
        db.rollback()
        return False
    finally:
        db.close()

def create_test_teacher():
    """Create a test teacher user"""
    
    db = SessionLocal()
    
    try:
        # Check if teacher role exists
        teacher_role = db.query(Role).filter(Role.name == "teacher").first()
        if not teacher_role:
            print("❌ Teacher role not found.")
            return False
        
        # Check if test teacher already exists
        existing_teacher = db.query(User).filter(User.email == "teacher@regod.com").first()
        if existing_teacher:
            print(f"✅ Test teacher already exists: {existing_teacher.email}")
            return True
        
        # Create test teacher
        teacher_user = User(
            email="teacher@regod.com",
            name="Test Teacher",
            hashed_password=get_password_hash("teacher123"),
            is_verified=True,
            is_active=True,
            onboarding_completed=True,
            clerk_user_id=None
        )
        
        db.add(teacher_user)
        db.flush()
        
        # Assign teacher role
        teacher_user.roles.append(teacher_role)
        
        db.commit()
        
        print("✅ Test teacher created successfully!")
        print(f"   Email: teacher@regod.com")
        print(f"   Password: teacher123")
        print(f"   Role: teacher")
        
        return True
        
    except Exception as e:
        print(f"❌ Error creating test teacher: {str(e)}")
        db.rollback()
        return False
    finally:
        db.close()

def create_test_student():
    """Create a test student user"""
    
    db = SessionLocal()
    
    try:
        # Check if student role exists (it's called "user" in the system)
        student_role = db.query(Role).filter(Role.name == "user").first()
        if not student_role:
            print("❌ Student role not found.")
            return False
        
        # Check if test student already exists
        existing_student = db.query(User).filter(User.email == "student@regod.com").first()
        if existing_student:
            print(f"✅ Test student already exists: {existing_student.email}")
            return True
        
        # Create test student
        student_user = User(
            email="student@regod.com",
            name="Test Student",
            hashed_password=get_password_hash("student123"),
            is_verified=True,
            is_active=True,
            onboarding_completed=True,
            clerk_user_id=None
        )
        
        db.add(student_user)
        db.flush()
        
        # Assign student role
        student_user.roles.append(student_role)
        
        db.commit()
        
        print("✅ Test student created successfully!")
        print(f"   Email: student@regod.com")
        print(f"   Password: student123")
        print(f"   Role: user")
        
        return True
        
    except Exception as e:
        print(f"❌ Error creating test student: {str(e)}")
        db.rollback()
        return False
    finally:
        db.close()

def main():
    """Main function to create test users"""
    print("🚀 Creating test users for RE-God application...")
    print()
    
    # Create admin user
    print("Creating admin user...")
    admin_success = create_admin_user()
    print()
    
    # Create test teacher
    print("Creating test teacher...")
    teacher_success = create_test_teacher()
    print()
    
    # Create test student
    print("Creating test student...")
    student_success = create_test_student()
    print()
    
    if admin_success and teacher_success and student_success:
        print("🎉 All test users created successfully!")
        print()
        print("📋 Test Credentials:")
        print("   Admin:    admin@regod.com / admin123")
        print("   Teacher:  teacher@regod.com / teacher123")
        print("   Student:  student@regod.com / student123")
        print()
        print("🔗 You can now:")
        print("   1. Login to admin panel: http://localhost:3000/login")
        print("   2. Test teacher invitation flow")
        print("   3. Test student registration with teacher codes")
    else:
        print("❌ Some users failed to create. Check the errors above.")

if __name__ == "__main__":
    main()
