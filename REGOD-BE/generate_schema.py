#!/usr/bin/env python3
"""
Generate clean SQL schema from SQLAlchemy models.
This ensures the SQL file matches the models exactly.
"""
import sys
from sqlalchemy import create_engine
from sqlalchemy.schema import CreateTable
from app.database import Base
from app import models  # This imports all models

def generate_sql_schema():
    """Generate SQL CREATE statements from SQLAlchemy models"""
    
    # Create a mock engine (won't connect to real DB)
    engine = create_engine("postgresql://", strategy='mock', executor=lambda sql, *_: None)
    
    sql_statements = []
    
    # Add header
    sql_statements.append("""-- ==============================================
-- RE-God Database Schema
-- Generated from SQLAlchemy models
-- ==============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgmq" CASCADE;

-- Create PGMQ queues for chat notifications
SELECT pgmq.create('chat_notifications');
SELECT pgmq.create('message_delivery');

""")
    
    # Generate CREATE TABLE statements for each table
    for table in Base.metadata.sorted_tables:
        create_stmt = str(CreateTable(table).compile(engine))
        sql_statements.append(f"-- Table: {table.name}\n{create_stmt};\n")
    
    # Add indexes
    sql_statements.append("""
-- ==============================================
-- Indexes
-- ==============================================

-- User indexes
CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Course indexes
CREATE INDEX IF NOT EXISTS idx_courses_created_by ON courses(created_by);
CREATE INDEX IF NOT EXISTS idx_chapters_course_id ON chapters(course_id);
CREATE INDEX IF NOT EXISTS idx_modules_chapter_id ON modules(chapter_id);

-- Progress indexes
CREATE INDEX IF NOT EXISTS idx_user_course_progress_user ON user_course_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_course_progress_course ON user_course_progress(course_id);
CREATE INDEX IF NOT EXISTS idx_user_module_progress_user ON user_module_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_module_progress_module ON user_module_progress(module_id);

-- Teacher indexes
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher ON teacher_assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_student ON teacher_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_teacher_codes_code ON teacher_codes(code);
CREATE INDEX IF NOT EXISTS idx_teacher_code_uses_code ON teacher_code_uses(teacher_code_id);

-- Chat indexes
CREATE INDEX IF NOT EXISTS idx_chat_threads_user ON chat_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_teacher ON chat_threads(assigned_teacher_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp);

-- Favorite indexes
CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_module ON user_favorites(module_id);
CREATE INDEX IF NOT EXISTS idx_user_chapter_favorites_user ON user_chapter_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_chapter_favorites_chapter ON user_chapter_favorites(chapter_id);

-- Notes indexes
CREATE INDEX IF NOT EXISTS idx_user_notes_user ON user_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notes_module ON user_notes(module_id);

-- Quiz indexes
CREATE INDEX IF NOT EXISTS idx_quiz_responses_user ON quiz_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_responses_module ON quiz_responses(module_id);

-- Refresh token indexes
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
""")
    
    # Add default roles and permissions
    sql_statements.append("""
-- ==============================================
-- Default Data
-- ==============================================

-- Insert default roles
INSERT INTO roles (id, name, description) VALUES
    (1, 'admin', 'Administrator with full access'),
    (2, 'teacher', 'Teacher with content management access'),
    (3, 'student', 'Student with learning access')
ON CONFLICT (id) DO NOTHING;

-- Insert default permissions
INSERT INTO permissions (id, name, description, resource, action) VALUES
    (1, 'manage_users', 'Manage user accounts', 'users', 'manage'),
    (2, 'manage_courses', 'Manage courses and content', 'courses', 'manage'),
    (3, 'view_courses', 'View and access courses', 'courses', 'view'),
    (4, 'manage_teachers', 'Manage teacher accounts', 'teachers', 'manage'),
    (5, 'view_students', 'View assigned students', 'students', 'view'),
    (6, 'manage_content', 'Create and edit content', 'content', 'manage'),
    (7, 'view_analytics', 'View analytics and reports', 'analytics', 'view')
ON CONFLICT (id) DO NOTHING;

-- Assign permissions to roles
INSERT INTO role_permissions (role_id, permission_id) VALUES
    -- Admin gets all permissions
    (1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7),
    -- Teacher permissions
    (2, 2), (2, 3), (2, 5), (2, 6), (2, 7),
    -- Student permissions
    (3, 3)
ON CONFLICT DO NOTHING;
""")
    
    return "\n".join(sql_statements)

if __name__ == "__main__":
    try:
        schema_sql = generate_sql_schema()
        
        # Write to file
        output_file = "init_fresh_db_generated.sql"
        with open(output_file, "w") as f:
            f.write(schema_sql)
        
        print(f"✅ Schema generated successfully: {output_file}")
        print(f"📊 Total tables: {len(Base.metadata.tables)}")
        print("\n📋 Tables:")
        for table in Base.metadata.sorted_tables:
            print(f"  - {table.name}")
        
    except Exception as e:
        print(f"❌ Error generating schema: {e}")
        sys.exit(1)




