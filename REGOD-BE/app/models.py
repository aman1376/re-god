from sqlalchemy import (
    Boolean, Column, ForeignKey, String, DateTime,
    Float, Text, Table, Integer, UniqueConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid
from app.database import Base


# =========================
# Association Tables
# =========================
user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")),
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE")),
    Column("assigned_at", DateTime(timezone=True), server_default=func.now()),
    Column("assigned_by", UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
)

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE")),
    Column("permission_id", Integer, ForeignKey("permissions.id", ondelete="CASCADE")),
    Column("assigned_at", DateTime(timezone=True), server_default=func.now()),
    Column("assigned_by", UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
)


# =========================
# User & Auth Models
# =========================
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    age = Column(Integer, nullable=True)
    avatar_url = Column(String, nullable=True)
    clerk_user_id = Column(String, nullable=True, unique=True, index=True)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    onboarding_completed = Column(Boolean, default=False)
    expo_push_token = Column(String, nullable=True)
    # Church-related fields
    church_admin_name = Column(String, nullable=True)
    home_church = Column(String, nullable=True)
    country = Column(String, nullable=True)
    city = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    church_admin_cell_phone = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    courses = relationship("UserCourseProgress", back_populates="user")
    favorites = relationship("UserFavorite", back_populates="user")
    chapter_favorites = relationship("UserChapterFavorite", back_populates="user")
    notes = relationship("UserNote", back_populates="user")
    chat_threads = relationship("ChatThread", back_populates="user", foreign_keys="ChatThread.user_id")
    teacher_assignments = relationship("TeacherAssignment", back_populates="teacher", foreign_keys="TeacherAssignment.teacher_id")
    student_assignments = relationship("TeacherAssignment", back_populates="student", foreign_keys="TeacherAssignment.student_id")
    roles = relationship(
        "Role",
        secondary=user_roles,
        back_populates="users",
        primaryjoin="User.id==user_roles.c.user_id",
        secondaryjoin="Role.id==user_roles.c.role_id"
    )
    assigned_roles = relationship("UserRoleAssignment", back_populates="assigner", foreign_keys="UserRoleAssignment.assigned_by")
    refresh_tokens = relationship("RefreshToken", back_populates="user")

    def has_permission(self, permission_name: str) -> bool:
        # Check if user has the specific permission
        has_specific = any(
            permission.name == permission_name
            for role in self.roles
            for permission in role.permissions
        )
        
        # Check if user has admin:all permission (grants all permissions)
        has_admin_all = any(
            permission.name == "admin:all"
            for role in self.roles
            for permission in role.permissions
        )
        
        return has_specific or has_admin_all

    def has_role(self, role_name: str) -> bool:
        return any(role.name == role_name for role in self.roles)


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    users = relationship(
        "User",
        secondary=user_roles,
        back_populates="roles",
        primaryjoin="Role.id==user_roles.c.role_id",
        secondaryjoin="User.id==user_roles.c.user_id"
    )
    permissions = relationship("Permission", secondary=role_permissions, back_populates="roles")


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    roles = relationship("Role", secondary=role_permissions, back_populates="permissions")


class UserRoleAssignment(Base):
    __tablename__ = "user_role_assignments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    role_id = Column(Integer, ForeignKey("roles.id", ondelete="CASCADE"))
    assigned_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", foreign_keys=[user_id])
    role = relationship("Role", foreign_keys=[role_id])
    assigner = relationship("User", foreign_keys=[assigned_by], back_populates="assigned_roles")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    token_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True))
    revoked = Column(Boolean, default=False)
    replaced_by = Column(Integer, ForeignKey("refresh_tokens.id"), nullable=True)

    user = relationship("User", back_populates="refresh_tokens")


# =========================
# Teacher/Student Models
# =========================
class TeacherAssignment(Base):
    __tablename__ = "teacher_assignments"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    assigned_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())
    active = Column(Boolean, default=True)

    teacher = relationship("User", foreign_keys=[teacher_id], back_populates="teacher_assignments")
    student = relationship("User", foreign_keys=[student_id], back_populates="student_assignments")
    assigner = relationship("User", foreign_keys=[assigned_by])


class TeacherCode(Base):
    __tablename__ = "teacher_codes"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)
    max_uses = Column(Integer, default=1)
    use_count = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

    teacher = relationship("User", foreign_keys=[teacher_id])
    student_uses = relationship("TeacherCodeUse", back_populates="teacher_code", cascade="all, delete-orphan")


class TeacherCodeUse(Base):
    __tablename__ = "teacher_code_uses"

    id = Column(Integer, primary_key=True, index=True)
    code_id = Column(Integer, ForeignKey("teacher_codes.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    used_at = Column(DateTime(timezone=True), server_default=func.now())

    teacher_code = relationship("TeacherCode", back_populates="student_uses")
    student = relationship("User", foreign_keys=[student_id])


class StudentTeacherAccess(Base):
    __tablename__ = "student_teacher_access"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    granted_at = Column(DateTime(timezone=True), server_default=func.now())
    granted_via_code = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)

    student = relationship("User", foreign_keys=[student_id])
    teacher = relationship("User", foreign_keys=[teacher_id])


# =========================
# Course/Learning Models
# =========================
class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=True)
    thumbnail_url = Column(String, nullable=True)
    category = Column(String, nullable=True)
    difficulty = Column(String, nullable=True)
    total_modules = Column(Integer, default=0)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    chapters = relationship("Chapter", back_populates="course", cascade="all, delete-orphan")
    modules = relationship("Module", back_populates="course", cascade="all, delete-orphan")
    creator = relationship("User", foreign_keys=[created_by])


class Chapter(Base):
    __tablename__ = "chapters"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    cover_image_url = Column(String, nullable=True)
    order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    quiz = Column(JSONB, nullable=True)

    course = relationship("Course", back_populates="chapters")
    modules = relationship("Module", back_populates="chapter", cascade="all, delete-orphan")


class Module(Base):
    __tablename__ = "modules"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"))
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="CASCADE"), nullable=True)
    title = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=True)
    # Content fields to support mobile lesson page
    content = Column(Text, nullable=True)
    key_verses = Column(Text, nullable=True)
    key_verses_ref = Column(String, nullable=True)
    key_verses_json = Column(JSONB, nullable=True)
    lesson_study = Column(Text, nullable=True)
    lesson_study_ref = Column(String, nullable=True)
    response_prompt = Column(Text, nullable=True)
    music_selection = Column(Text, nullable=True)
    further_study = Column(Text, nullable=True)
    further_study_json = Column(JSONB, nullable=True)
    personal_experiences = Column(Text, nullable=True)
    resources = Column(Text, nullable=True)
    resources_json = Column(JSONB, nullable=True)
    artwork = Column(Text, nullable=True)
    header_image_url = Column(String, nullable=True)
    media_url = Column(String, nullable=True)  # consolidated audio/video URL
    quiz = Column(JSONB, nullable=True)  # structured quiz data
    order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

    course = relationship("Course", back_populates="modules")
    chapter = relationship("Chapter", back_populates="modules")


class UserCourseProgress(Base):
    __tablename__ = "user_course_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"))
    last_visited_module_id = Column(Integer, ForeignKey("modules.id", ondelete="SET NULL"), nullable=True)
    progress_percentage = Column(Float, default=0.0)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    last_visited_at = Column(DateTime(timezone=True), server_default=func.now())
    is_favorite = Column(Boolean, default=False)

    user = relationship("User", back_populates="courses")
    course = relationship("Course")
    last_visited_module = relationship("Module")


class UserModuleProgress(Base):
    __tablename__ = "user_module_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"))
    module_id = Column(Integer, ForeignKey("modules.id", ondelete="CASCADE"))
    status = Column(String, default="not_started")  # not_started, in_progress, completed
    completed_at = Column(DateTime(timezone=True), nullable=True)


class UserNote(Base):
    __tablename__ = "user_notes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=True)
    lesson_id = Column(Integer, ForeignKey("modules.id", ondelete="CASCADE"), nullable=True)
    title = Column(String(255), nullable=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="notes")


# =========================
# Chat Models
# =========================
class ChatThread(Base):
    __tablename__ = "chat_threads"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    assigned_teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="chat_threads", foreign_keys=[user_id])
    teacher = relationship("User", foreign_keys=[assigned_teacher_id])
    messages = relationship("ChatMessage", back_populates="thread", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    thread_id = Column(Integer, ForeignKey("chat_threads.id", ondelete="CASCADE"))
    sender_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    sender_type = Column(String, default="user")  # user or teacher
    content = Column(Text, nullable=False)
    message_type = Column(String, default="text")  # text, image, file
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    read_status = Column(Boolean, default=False)

    thread = relationship("ChatThread", back_populates="messages")
    sender = relationship("User")


# User Favorites for Lessons
class UserFavorite(Base):
    __tablename__ = "user_favorites"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    lesson_id = Column(Integer, ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="favorites")
    lesson = relationship("Module")

    __table_args__ = (
        UniqueConstraint('user_id', 'lesson_id', name='unique_user_lesson_favorite'),
    )


# User Favorites for Chapters
class UserChapterFavorite(Base):
    __tablename__ = "user_chapter_favorites"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="chapter_favorites")
    chapter = relationship("Chapter")

    __table_args__ = (
        UniqueConstraint('user_id', 'chapter_id', name='unique_user_chapter_favorite'),
    )

# Quiz Response Model
class QuizResponse(Base):
    __tablename__ = "quiz_responses"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    module_id = Column(Integer, ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    question_type = Column(String(50), nullable=False)  # 'multiple_choice', 'text', 'reflection'
    submitted_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    
    # Relationships
    user = relationship("User")
    course = relationship("Course")
    module = relationship("Module")
