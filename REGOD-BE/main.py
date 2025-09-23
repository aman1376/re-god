# REGOD FastAPI Backend Implementation
# Complete backend service based on the provided specification

from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import asyncpg
import redis.asyncio as redis
import bcrypt
import jwt
from datetime import datetime, timedelta
import uuid
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, EmailStr, validator
import json
import asyncio
from contextlib import asynccontextmanager
import logging
import os
from functools import wraps
import time

logger = logging.getLogger(__name__)

# Configuration
class Config:
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/regod")
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
    JWT_SECRET = os.getenv("JWT_SECRET", "your-super-secret-jwt-key-change-in-production")
    JWT_ACCESS_TTL = int(os.getenv("JWT_ACCESS_TTL", "900"))  # 15 minutes
    JWT_REFRESH_TTL = int(os.getenv("JWT_REFRESH_TTL", "30"))  # 30 days
    BCRYPT_ROUNDS = int(os.getenv("BCRYPT_ROUNDS", "12"))
    RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))
    RATE_LIMIT_MAX = int(os.getenv("RATE_LIMIT_MAX", "100"))
    NODE_ENV = os.getenv("NODE_ENV", "development")

config = Config()

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='{"timestamp":"%(asctime)s","level":"%(levelname)s","message":"%(message)s","module":"%(name)s"}'
)
logger = logging.getLogger(__name__)

# Global database and redis connections
db_pool = None
redis_client = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool, redis_client
    
    # Startup
    logger.info("Starting REGOD Backend...")
    
    # Initialize database pool
    db_pool = await asyncpg.create_pool(config.DATABASE_URL)
    logger.info("Database pool created")
    
    # Initialize Redis
    redis_client = redis.from_url(config.REDIS_URL)
    logger.info("Redis client initialized")
    
    # Run database migrations
    await run_migrations()
    
    yield
    
    # Shutdown
    logger.info("Shutting down...")
    await db_pool.close()
    await redis_client.close()

# FastAPI app initialization
app = FastAPI(
    title="REGOD API",
    version="1.0.0",
    description="Backend API for REGOD mobile app",
    lifespan=lifespan
)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://localhost:3000",
        "https://906670ce5cdf.ngrok-free.app",
        "*" if config.NODE_ENV == "development" else "https://regod.app"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Include routers
from app.routes import auth, courses, favorites, chat, profile, admin, teacher_codes, clerk_webhooks, uploads
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
# app.include_router(courses.router, prefix="/api", tags=["Courses"])  # Temporarily disabled due to auth compatibility
app.include_router(favorites.router, prefix="/api/user", tags=["Favorites"])
# app.include_router(chat.router, prefix="/api/connect", tags=["Connect"])  # Temporarily disabled due to auth compatibility
# app.include_router(profile.router, prefix="/api/user", tags=["Profile"])  # Temporarily disabled due to schema conflicts
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(teacher_codes.router, prefix="/api", tags=["Teacher Codes"])
app.include_router(clerk_webhooks.router, prefix="/api", tags=["Clerk Webhooks"])
app.include_router(uploads.router, prefix="/api", tags=["Uploads"])

# Serve local uploads (if used)
try:
    upload_dir = os.getenv("LOCAL_UPLOAD_DIR", os.path.join(os.getcwd(), "uploads"))
    os.makedirs(upload_dir, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")
except Exception:
    pass

if config.NODE_ENV == "production":
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["regod.app", "api.regod.app"]
    )

# Security
security = HTTPBearer()

# Pydantic Models
class ErrorResponse(BaseModel):
    error: Dict[str, str]

class CheckUserRequest(BaseModel):
    identifier: str

class CheckUserResponse(BaseModel):
    user_exists: bool
    auth_method: str

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        return v

class LoginRequest(BaseModel):
    identifier: str
    password: str

class SocialAuthRequest(BaseModel):
    provider: str
    access_token: str

class VerifyRequest(BaseModel):
    identifier: str
    verification_code: str

class ClerkExchangeRequest(BaseModel):
    identifier: str  # email or clerk_user_id

class ResetPasswordRequest(BaseModel):
    identifier: str

class ProgressRequest(BaseModel):
    course_id: str
    module_id: str
    status: str

class MessageRequest(BaseModel):
    thread_id: str
    content: str

class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None

class AuthResponse(BaseModel):
    user_id: str
    auth_token: str
    refresh_token: str
    user_data: Optional[Dict[str, Any]] = None
    requires_verification: Optional[bool] = None

# Database Migration
async def run_migrations():
    """Run database migrations"""
    migrations = """
    -- Create extensions
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text UNIQUE NOT NULL,
        password_hash text,
        name text,
        onboarding_completed boolean DEFAULT false,
        verified boolean DEFAULT false,
        created_at timestamptz DEFAULT now()
    );
    
    -- Roles table
    CREATE TABLE IF NOT EXISTS roles (
        id serial PRIMARY KEY,
        name text UNIQUE NOT NULL
    );
    
    -- User roles table
    CREATE TABLE IF NOT EXISTS user_roles (
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        role_id int REFERENCES roles(id) ON DELETE CASCADE,
        assigned_at timestamptz DEFAULT now(),
        assigned_by uuid,
        PRIMARY KEY (user_id, role_id)
    );
    
    -- Teacher assignments
    CREATE TABLE IF NOT EXISTS teacher_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        teacher_id uuid REFERENCES users(id),
        student_id uuid REFERENCES users(id),
        assigned_by uuid,
        assigned_at timestamptz DEFAULT now(),
        active boolean DEFAULT true
    );
    
    -- Courses
    CREATE TABLE IF NOT EXISTS courses (
        id text PRIMARY KEY,
        title text NOT NULL,
        thumbnail_url text,
        created_at timestamptz DEFAULT now()
    );
    
    -- Modules
    CREATE TABLE IF NOT EXISTS modules (
        id text PRIMARY KEY,
        course_id text REFERENCES courses(id) ON DELETE CASCADE,
        position int,
        title text
    );
    
    -- User course progress
    CREATE TABLE IF NOT EXISTS user_course_progress (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        course_id text REFERENCES courses(id) ON DELETE CASCADE,
        progress_percentage numeric DEFAULT 0,
        last_visited_module_id text,
        last_visited_at timestamptz,
        UNIQUE(user_id, course_id)
    );
    
    -- Favourites
    CREATE TABLE IF NOT EXISTS user_favourites (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        lesson_id text NOT NULL,
        created_at timestamptz DEFAULT now(),
        UNIQUE (user_id, lesson_id)
    );
    
    -- Chat threads
    CREATE TABLE IF NOT EXISTS chat_threads (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id uuid REFERENCES users(id),
        teacher_id uuid REFERENCES users(id),
        created_at timestamptz DEFAULT now(),
        UNIQUE(student_id, teacher_id)
    );
    
    -- Chat messages
    CREATE TABLE IF NOT EXISTS chat_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        thread_id uuid REFERENCES chat_threads(id) ON DELETE CASCADE,
        sender_id uuid REFERENCES users(id),
        sender_type text,
        content text NOT NULL,
        timestamp timestamptz DEFAULT now(),
        read_status boolean DEFAULT false
    );
    
    -- User notes
    CREATE TABLE IF NOT EXISTS user_notes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        course_id text,
        lesson_id text,
        note_content text,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
    );
    
    -- Refresh tokens
    CREATE TABLE IF NOT EXISTS refresh_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        token_hash text NOT NULL,
        created_at timestamptz DEFAULT now(),
        expires_at timestamptz,
        revoked boolean DEFAULT false,
        replaced_by uuid
    );
    
    -- Audit logs
    CREATE TABLE IF NOT EXISTS audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id uuid,
        action_type text NOT NULL,
        target text,
        meta jsonb,
        created_at timestamptz DEFAULT now()
    );
    
    -- Insert default roles
    INSERT INTO roles (name) VALUES ('student'), ('teacher'), ('admin') ON CONFLICT DO NOTHING;
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_user_course_progress_user_course ON user_course_progress(user_id, course_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_timestamp ON chat_messages(thread_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher_student ON teacher_assignments(teacher_id, student_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
    """
    
    async with db_pool.acquire() as conn:
        await conn.execute(migrations)
    
    logger.info("Database migrations completed")

# Utility functions
def hash_password(password: str) -> str:
    """Hash password using bcrypt"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(rounds=config.BCRYPT_ROUNDS)).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    """Verify password against hash"""
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_access_token(user_id: str, role: str, scopes: List[str] = None) -> str:
    """Create JWT access token"""
    if scopes is None:
        scopes = get_default_scopes_for_role(role)
    
    payload = {
        "sub": user_id,
        "role": role,
        "scopes": scopes,
        "iat": int(time.time()),
        "exp": int(time.time()) + config.JWT_ACCESS_TTL
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm="HS256")

def create_refresh_token() -> str:
    """Create refresh token"""
    return str(uuid.uuid4())

def get_default_scopes_for_role(role: str) -> List[str]:
    """Get default scopes for role"""
    role_scopes = {
        "student": ["dashboard:read", "progress:write", "chat:write", "favourites:write", "profile:write"],
        "teacher": ["dashboard:read", "progress:read", "chat:write", "students:read"],
        "admin": ["*"]
    }
    return role_scopes.get(role, ["dashboard:read"])

# get_current_user function moved to app.utils.auth to avoid circular imports
from app.utils.auth import get_current_user as get_current_user_obj
from app.database import get_db
from app.models import User
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.clerk_jwt import verify_clerk_jwt

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Get current authenticated user from JWT token - supports both custom and backend JWT"""
    try:
        token = credentials.credentials
        JWT_SECRET = config.JWT_SECRET
        
        # Decode the JWT token
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail={"error": {"code": "INVALID_TOKEN", "message": "Invalid token payload"}},
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Try to find user by ID (UUID format)
        try:
            user_uuid = uuid.UUID(user_id)
            user = db.query(User).filter(User.id == user_uuid).first()
        except ValueError:
            # If not a valid UUID, it might be a string ID, try direct lookup
            user = db.query(User).filter(User.id == user_id).first()
        
        if not user:
            raise HTTPException(
                status_code=401,
                detail={"error": {"code": "USER_NOT_FOUND", "message": "User not found"}},
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Check if user is active
        if not user.is_active:
            raise HTTPException(
                status_code=401,
                detail={"error": {"code": "USER_INACTIVE", "message": "User account is inactive"}},
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Get user roles
        roles = [role.name for role in user.roles]
        role = roles[0] if roles else "student"
        
        # Return dictionary format for main.py compatibility
        return {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "role": role,
            "verified": user.is_verified
        }
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "TOKEN_EXPIRED", "message": "Token has expired"}},
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        logger.error(f"Invalid JWT token: {e}")
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "INVALID_TOKEN", "message": "Invalid token"}},
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        logger.error(f"Authentication error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={"error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}},
        )

def require_role(*allowed_roles):
    """Decorator to require specific roles"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Get current_user from kwargs or dependency injection
            current_user = kwargs.get('current_user') or kwargs.get('user')
            if not current_user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail={"error": {"code": "UNAUTHENTICATED", "message": "Authentication required"}}
                )
            
            if current_user["role"] not in allowed_roles and "admin" not in allowed_roles:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={"error": {"code": "FORBIDDEN", "message": "Insufficient permissions"}}
                )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator

# Rate limiting
async def rate_limit_check(key: str, window: int = config.RATE_LIMIT_WINDOW, max_requests: int = config.RATE_LIMIT_MAX):
    """Check rate limit using Redis"""
    current_time = int(time.time())
    window_start = current_time - window
    
    pipe = redis_client.pipeline()
    pipe.zremrangebyscore(key, 0, window_start)
    pipe.zcard(key)
    pipe.zadd(key, {str(uuid.uuid4()): current_time})
    pipe.expire(key, window)
    
    results = await pipe.execute()
    request_count = results[1]
    
    if request_count >= max_requests:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"error": {"code": "RATE_LIMIT_EXCEEDED", "message": "Too many requests"}}
        )

# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logger.info(f"User {user_id} connected via WebSocket")
    
    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.info(f"User {user_id} disconnected from WebSocket")
    
    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except:
                    # Remove stale connections
                    self.active_connections[user_id].remove(connection)

manager = ConnectionManager()

# API Routes

# Health check
@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# Authentication endpoints
@app.post("/api/auth/check-user", response_model=CheckUserResponse)
async def check_user(request: CheckUserRequest):
    await rate_limit_check(f"auth_check:{request.identifier}", max_requests=20)
    
    async with db_pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id FROM users WHERE email = $1", request.identifier)
    
    return CheckUserResponse(
        user_exists=user is not None,
        auth_method="email"
    )

@app.post("/api/auth/register", response_model=AuthResponse)
async def register(request: RegisterRequest):
    await rate_limit_check(f"auth_register:{request.email}", max_requests=5)
    
    # Check if user already exists
    async with db_pool.acquire() as conn:
        existing_user = await conn.fetchrow("SELECT id FROM users WHERE email = $1", request.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"error": {"code": "USER_EXISTS", "message": "User already exists"}}
            )
        
        # Create user (use correct column name 'hashed_password')
        password_hash = hash_password(request.password)
        user_id = await conn.fetchval(
            "INSERT INTO users (email, hashed_password, name) VALUES ($1, $2, $3) RETURNING id",
            request.email, password_hash, request.name
        )

        # Assign default role (prefer 'student' if present otherwise fallback to 'user')
        await conn.execute(
            """
            INSERT INTO user_roles (user_id, role_id)
            VALUES (
                $1,
                COALESCE(
                    (SELECT id FROM roles WHERE name = 'student'),
                    (SELECT id FROM roles WHERE name = 'user')
                )
            )
            """,
            user_id
        )
    
    # Create tokens
    access_token = create_access_token(str(user_id), "student")
    refresh_token = create_refresh_token()
    
    # Store refresh token
    async with db_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
            user_id, hash_password(refresh_token), datetime.utcnow() + timedelta(days=config.JWT_REFRESH_TTL)
        )
    
    return AuthResponse(
        user_id=str(user_id),
        auth_token=access_token,
        refresh_token=refresh_token,
        requires_verification=True
    )

@app.post("/api/auth/login", response_model=AuthResponse)
async def login(request: LoginRequest):
    await rate_limit_check(f"auth_login:{request.identifier}", max_requests=10)
    
    async with db_pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT u.*, r.name as role FROM users u "
            "LEFT JOIN user_roles ur ON u.id = ur.user_id "
            "LEFT JOIN roles r ON ur.role_id = r.id "
            "WHERE u.email = $1",
            request.identifier
        )
        
        if not user or not verify_password(request.password, user["hashed_password"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": {"code": "INVALID_CREDENTIALS", "message": "Invalid credentials"}}
            )
    
    # Create tokens
    role = user["role"] or "student"
    access_token = create_access_token(str(user["id"]), role)
    refresh_token = create_refresh_token()
    
    # Store refresh token
    async with db_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
            user["id"], hash_password(refresh_token), datetime.utcnow() + timedelta(days=config.JWT_REFRESH_TTL)
        )
    
    user_data = {
        "id": str(user["id"]),
        "email": user["email"],
        "name": user["name"],
        "role": role,
        "verified": user["is_verified"]
    }
    
    return AuthResponse(
        user_id=str(user["id"]),
        auth_token=access_token,
        refresh_token=refresh_token,
        user_data=user_data
    )

@app.post("/api/auth/verify")
async def verify_user(request: VerifyRequest):
    await rate_limit_check(f"auth_verify:{request.identifier}", max_requests=10)
    
    # In a real implementation, you would verify the code against stored verification codes
    # For now, we'll just mark the user as verified if code is "123456"
    if request.verification_code != "123456":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "INVALID_CODE", "message": "Invalid verification code"}}
        )
    
    async with db_pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM users WHERE email = $1", request.identifier)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": {"code": "USER_NOT_FOUND", "message": "User not found"}}
            )
        
        await conn.execute("UPDATE users SET verified = true WHERE id = $1", user["id"])
    
    # Create new access token
    access_token = create_access_token(str(user["id"]), "student")
    
    return {"verified": True, "auth_token": access_token}

@app.post("/api/auth/clerk-exchange", response_model=AuthResponse)
async def clerk_exchange(request: ClerkExchangeRequest):
    """Exchange a Clerk user (by clerk_user_id or email) for backend JWT."""
    identifier = request.identifier
    if not identifier:
        raise HTTPException(status_code=400, detail={"error": {"code": "BAD_REQUEST", "message": "Missing identifier"}})

    async with db_pool.acquire() as conn:
        user = await conn.fetchrow(
            """
            SELECT u.*, r.name as role
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            WHERE u.clerk_user_id = $1 OR u.email = $1
            """,
            identifier
        )

        if not user:
            # If user doesn't exist, create them using SQLAlchemy
            try:
                # Use SQLAlchemy to create the user
                from app.database import get_db
                from app.models import User as UserModel, Role
                
                # Get a database session
                db_gen = get_db()
                db = next(db_gen)
                
                try:
                    # Create new user
                    new_user = UserModel(
                        email=identifier,
                        name="User",  # Default name
                        is_verified=True,
                        is_active=True
                    )
                    db.add(new_user)
                    db.flush()  # Flush to get the ID
                    
                    # Explicitly ensure user is active (workaround for database issue)
                    new_user.is_active = True
                    
                    # Assign default role (student)
                    student_role = db.query(Role).filter(Role.name == "student").first()
                    if student_role:
                        new_user.roles.append(student_role)
                    
                    db.commit()
                    
                    # Now fetch the user using asyncpg
                    user = await conn.fetchrow(
                        """
                        SELECT u.*, r.name as role
                        FROM users u
                        LEFT JOIN user_roles ur ON u.id = ur.user_id
                        LEFT JOIN roles r ON ur.role_id = r.id
                        WHERE u.id = $1
                        """,
                        new_user.id
                    )
                    
                finally:
                    db.close()
                    
                if not user:
                    raise HTTPException(status_code=500, detail={"error": {"code": "USER_CREATION_FAILED", "message": "Failed to create user"}})
                    
            except Exception as e:
                print(f"Error creating user: {str(e)}")
                raise HTTPException(status_code=500, detail={"error": {"code": "USER_CREATION_FAILED", "message": "Failed to create user"}})

    role = user["role"] or "student"
    access_token = create_access_token(str(user["id"]), role)
    refresh_token = create_refresh_token()

    async with db_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
            user["id"], hash_password(refresh_token), datetime.utcnow() + timedelta(days=config.JWT_REFRESH_TTL)
        )

    user_data = {
        "id": str(user["id"]),
        "email": user["email"],
        "name": user["name"],
        "role": role,
        "verified": user["is_verified"]
    }

    return AuthResponse(
        user_id=str(user["id"]),
        auth_token=access_token,
        refresh_token=refresh_token,
        user_data=user_data
    )

@app.post("/api/auth/reset-password")
async def reset_password(request: ResetPasswordRequest):
    await rate_limit_check(f"auth_reset:{request.identifier}", max_requests=3)
    
    async with db_pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id FROM users WHERE email = $1", request.identifier)
        if not user:
            # Don't reveal if user exists or not for security
            return {"reset_token_sent": True}
    
    # In a real implementation, you would send a reset email
    # For now, we'll just log it
    logger.info(f"Password reset requested for {request.identifier}")
    
    return {"reset_token_sent": True}

# Dashboard endpoints
@app.get("/api/user/dashboard")
async def get_dashboard(current_user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        # Get user's last visited course
        last_course = await conn.fetchrow(
            """
            SELECT c.id as course_id, c.title as course_title, 
                   ucp.progress_percentage, ucp.last_visited_module_id
            FROM user_course_progress ucp
            JOIN courses c ON ucp.course_id = c.id
            WHERE ucp.user_id = $1
            ORDER BY ucp.last_visited_at DESC
            LIMIT 1
            """,
            uuid.UUID(current_user["id"])
        )
        
        # Get available courses
        courses = await conn.fetch(
            """
            SELECT c.id as course_id, c.title, c.thumbnail_url,
                   COALESCE(ucp.progress_percentage, 0) as progress_percentage,
                   (ucp.id IS NULL) as is_new
            FROM courses c
            LEFT JOIN user_course_progress ucp ON c.id = ucp.course_id AND ucp.user_id = $1
            """,
            uuid.UUID(current_user["id"])
        )
    
    dashboard_data = {
        "user": {
            "name": current_user["name"],
            "email": current_user["email"]
        },
        "available_courses": [
            {
                "course_id": course["course_id"],
                "title": course["title"],
                "progress_percentage": int(course["progress_percentage"]),
                "thumbnail_url": course["thumbnail_url"],
                "is_new": course["is_new"]
            }
            for course in courses
        ]
    }
    
    if last_course:
        dashboard_data["last_visited_course"] = {
            "course_id": last_course["course_id"],
            "course_title": last_course["course_title"],
            "progress_percentage": int(last_course["progress_percentage"]),
            "continue_url": f"/learn/{last_course['course_id']}/{last_course['last_visited_module_id']}"
        }
    
    return dashboard_data

# Course modules endpoint
@app.get("/api/courses/{course_id}/modules")
async def get_course_modules(course_id: int, current_user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        modules = await conn.fetch(
            """
            SELECT m.id, m.title, m.description, m.order, m.chapter_id,
                   m.content, m.key_verses, m.key_verses_ref, m.key_verses_json,
                   m.lesson_study, m.lesson_study_ref, m.response_prompt,
                   m.music_selection, m.further_study, m.further_study_json,
                   m.personal_experiences, m.resources, m.resources_json,
                   m.artwork, m.header_image_url, m.media_url, m.quiz,
                   m.course_id
            FROM modules m
            WHERE m.course_id = $1
            ORDER BY m.order
            """,
            course_id
        )
        
        return [dict(module) for module in modules]

# Progress endpoints
@app.post("/api/learn/progress")
async def update_progress(request: ProgressRequest, current_user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        # Calculate real progress based on modules completed
        course_id = int(request.course_id)
        module_id = int(request.module_id)
        
        # Get total modules in the course
        total_modules = await conn.fetchval(
            "SELECT COUNT(*) FROM modules WHERE course_id = $1",
            course_id
        )
        
        # Get current progress
        current_progress = await conn.fetchrow(
            "SELECT progress_percentage FROM user_course_progress WHERE user_id = $1 AND course_id = $2",
            uuid.UUID(current_user["id"]), course_id
        )
        
        # Calculate progress: each module completion is worth (100 / total_modules)%
        if total_modules > 0:
            module_progress = int(100 / total_modules)
            new_progress = (current_progress["progress_percentage"] if current_progress else 0) + module_progress
            new_progress = min(new_progress, 100)  # Cap at 100%
        else:
            new_progress = 100  # If no modules, mark as complete
        
        # Check if progress record exists
        existing_progress = await conn.fetchrow(
            "SELECT id FROM user_course_progress WHERE user_id = $1 AND course_id = $2",
            uuid.UUID(current_user["id"]), course_id
        )
        
        if existing_progress:
            # Update existing progress
            await conn.execute(
                """
                UPDATE user_course_progress 
                SET last_visited_module_id = $3, last_visited_at = $4, progress_percentage = $5
                WHERE user_id = $1 AND course_id = $2
                """,
                uuid.UUID(current_user["id"]), course_id, module_id,
                datetime.utcnow(), new_progress
            )
        else:
            # Insert new progress
            await conn.execute(
                """
                INSERT INTO user_course_progress (user_id, course_id, last_visited_module_id, last_visited_at, progress_percentage)
                VALUES ($1, $2, $3, $4, $5)
                """,
                uuid.UUID(current_user["id"]), course_id, module_id,
                datetime.utcnow(), new_progress
            )
    
    return {"success": True, "updated_progress_percentage": new_progress}

# Favourites endpoints
@app.post("/api/user/favourites/{lesson_id}")
async def toggle_favourite(lesson_id: str, current_user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM user_favourites WHERE user_id = $1 AND lesson_id = $2",
            uuid.UUID(current_user["id"]), lesson_id
        )
        
        if existing:
            await conn.execute(
                "DELETE FROM user_favourites WHERE id = $1",
                existing["id"]
            )
            action = "removed"
        else:
            await conn.execute(
                "INSERT INTO user_favourites (user_id, lesson_id) VALUES ($1, $2)",
                uuid.UUID(current_user["id"]), lesson_id
            )
            action = "added"
    
    return {"action": action, "lesson_id": lesson_id}

@app.get("/api/user/favourites")
async def get_favourites(current_user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        favourites = await conn.fetch(
            "SELECT lesson_id, created_at FROM user_favourites WHERE user_id = $1 ORDER BY created_at DESC",
            uuid.UUID(current_user["id"])
        )
    
    return {
        "favourites": [
            {
                "lesson_id": fav["lesson_id"],
                "lesson_title": f"Lesson {fav['lesson_id']}",  # Mock data
                "course_title": "Sample Course",  # Mock data
                "added_on": fav["created_at"].isoformat()
            }
            for fav in favourites
        ]
    }

# Connect (Chat) endpoints
@app.get("/api/connect/thread")
async def get_or_create_thread(current_user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        if current_user["role"] == "student":
            # Get assigned teacher
            teacher = await conn.fetchrow(
                """
                SELECT u.id, u.name FROM teacher_assignments ta
                JOIN users u ON ta.teacher_id = u.id
                WHERE ta.student_id = $1 AND ta.active = true
                LIMIT 1
                """,
                uuid.UUID(current_user["id"])
            )
            
            if not teacher:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"error": {"code": "NO_TEACHER_ASSIGNED", "message": "No teacher assigned"}}
                )
            
            # Get or create thread
            thread = await conn.fetchrow(
                "SELECT id FROM chat_threads WHERE student_id = $1 AND teacher_id = $2",
                uuid.UUID(current_user["id"]), teacher["id"]
            )
            
            if not thread:
                thread_id = await conn.fetchval(
                    "INSERT INTO chat_threads (student_id, teacher_id) VALUES ($1, $2) RETURNING id",
                    uuid.UUID(current_user["id"]), teacher["id"]
                )
            else:
                thread_id = thread["id"]
            
            # Get unread count
            unread_count = await conn.fetchval(
                "SELECT COUNT(*) FROM chat_messages WHERE thread_id = $1 AND sender_id != $2 AND read_status = false",
                thread_id, uuid.UUID(current_user["id"])
            )
            
            return {
                "thread_id": str(thread_id),
                "recipient_name": teacher["name"],
                "unread_count": unread_count
            }
        
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"error": {"code": "FORBIDDEN", "message": "Only students can access this endpoint"}}
            )

@app.get("/api/connect/thread/messages")
async def get_thread_messages(thread_id: str, current_user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        # Verify access to thread
        thread = await conn.fetchrow(
            "SELECT student_id, teacher_id FROM chat_threads WHERE id = $1",
            uuid.UUID(thread_id)
        )
        
        if not thread:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": {"code": "THREAD_NOT_FOUND", "message": "Thread not found"}}
            )
        
        user_id = uuid.UUID(current_user["id"])
        if user_id not in [thread["student_id"], thread["teacher_id"]] and current_user["role"] != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"error": {"code": "FORBIDDEN", "message": "Access denied to this thread"}}
            )
        
        # Get messages
        messages = await conn.fetch(
            """
            SELECT cm.*, u.name as sender_name 
            FROM chat_messages cm
            JOIN users u ON cm.sender_id = u.id
            WHERE cm.thread_id = $1
            ORDER BY cm.timestamp ASC
            """,
            uuid.UUID(thread_id)
        )
        
        # Mark messages as read for current user
        await conn.execute(
            "UPDATE chat_messages SET read_status = true WHERE thread_id = $1 AND sender_id != $2",
            uuid.UUID(thread_id), user_id
        )
    
    return {
        "messages": [
            {
                "sender_name": "You" if str(msg["sender_id"]) == current_user["id"] else msg["sender_name"],
                "content": msg["content"],
                "timestamp": msg["timestamp"].isoformat()
            }
            for msg in messages
        ]
    }

@app.post("/api/connect/thread/messages")
async def send_message(request: MessageRequest, current_user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        # Verify access to thread
        thread = await conn.fetchrow(
            "SELECT student_id, teacher_id FROM chat_threads WHERE id = $1",
            uuid.UUID(request.thread_id)
        )
        
        if not thread:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": {"code": "THREAD_NOT_FOUND", "message": "Thread not found"}}
            )
        
        user_id = uuid.UUID(current_user["id"])
        if user_id not in [thread["student_id"], thread["teacher_id"]]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"error": {"code": "FORBIDDEN", "message": "Access denied to this thread"}}
            )
        
        # Insert message
        message_id = await conn.fetchval(
            """
            INSERT INTO chat_messages (thread_id, sender_id, sender_type, content)
            VALUES ($1, $2, $3, $4) RETURNING id
            """,
            uuid.UUID(request.thread_id), user_id, current_user["role"], request.content
        )
    
    # Send real-time notification to other participant
    recipient_id = str(thread["teacher_id"]) if user_id == thread["student_id"] else str(thread["student_id"])
    await manager.send_personal_message({
        "event": "message:receive",
        "data": {
            "message_id": str(message_id),
            "thread_id": request.thread_id,
            "sender_id": current_user["id"],
            "content": request.content,
            "server_ts": datetime.utcnow().isoformat()
        }
    }, recipient_id)
    
    return {"message_id": str(message_id), "status": "sent"}

# Profile endpoints
@app.get("/api/user/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "name": current_user["name"],
        "email": current_user["email"],
        "role": current_user["role"],
        "verified": current_user["verified"]
    }

# Chat endpoints (simplified for compatibility)
@app.get("/api/connect/history")
async def get_chat_history(current_user: dict = Depends(get_current_user)):
    # Return empty chat history for now
    return []

# Notes endpoints
@app.get("/api/user/notes")
async def get_notes(current_user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        notes = await conn.fetch(
            """
            SELECT un.note_content, un.created_at, c.title as course_title
            FROM user_notes un
            LEFT JOIN courses c ON un.course_id = c.id
            WHERE un.user_id = $1
            ORDER BY un.created_at DESC
            """,
            uuid.UUID(current_user["id"])
        )
    
    return {
        "notes": [
            {
                "note_content": note["note_content"],
                "course_title": note["course_title"] or "General",
                "created_at": note["created_at"].isoformat()
            }
            for note in notes
        ]
    }

# Sharing endpoints
@app.post("/api/share/course/{course_id}")
async def share_course(course_id: str, current_user: dict = Depends(get_current_user)):
    # Create a signed URL with referral tracking
    # In a real implementation, you would create a proper signed URL
    shareable_link = f"https://regod.app/course/{course_id}?ref={current_user['id']}"
    
    return {"shareable_link": shareable_link}

# WebSocket endpoint
@app.websocket("/api/connect/socket")
async def websocket_endpoint(websocket: WebSocket):
    # Get token from query params or headers
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008, reason="Missing authentication token")
        return
    
    try:
        # Verify JWT token
        payload = jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("sub")
        
        if not user_id:
            await websocket.close(code=1008, reason="Invalid token")
            return
        
        # Connect user
        await manager.connect(websocket, user_id)
        
        try:
            while True:
                # Receive messages from client
                data = await websocket.receive_text()
                message = json.loads(data)
                
                # Handle different message types
                if message.get("event") == "message:send":
                    # Validate and process message
                    thread_id = message.get("thread_id")
                    content = message.get("content")
                    
                    if not thread_id or not content:
                        await websocket.send_text(json.dumps({
                            "event": "error",
                            "data": {"code": "INVALID_MESSAGE", "message": "Missing required fields"}
                        }))
                        continue
                    
                    # Process message (similar to REST endpoint)
                    async with db_pool.acquire() as conn:
                        # Verify access to thread
                        thread = await conn.fetchrow(
                            "SELECT student_id, teacher_id FROM chat_threads WHERE id = $1",
                            uuid.UUID(thread_id)
                        )
                        
                        if not thread:
                            await websocket.send_text(json.dumps({
                                "event": "error",
                                "data": {"code": "THREAD_NOT_FOUND", "message": "Thread not found"}
                            }))
                            continue
                        
                        user_uuid = uuid.UUID(user_id)
                        if user_uuid not in [thread["student_id"], thread["teacher_id"]]:
                            await websocket.send_text(json.dumps({
                                "event": "error",
                                "data": {"code": "FORBIDDEN", "message": "Access denied"}
                            }))
                            continue
                        
                        # Insert message
                        message_id = await conn.fetchval(
                            """
                            INSERT INTO chat_messages (thread_id, sender_id, sender_type, content)
                            VALUES ($1, $2, $3, $4) RETURNING id
                            """,
                            uuid.UUID(thread_id), user_uuid, "student", content  # You'd get role from token
                        )
                    
                    # Send confirmation to sender
                    await websocket.send_text(json.dumps({
                        "event": "message:ack",
                        "data": {"message_id": str(message_id)}
                    }))
                    
                    # Send to recipient
                    recipient_id = str(thread["teacher_id"]) if user_uuid == thread["student_id"] else str(thread["student_id"])
                    await manager.send_personal_message({
                        "event": "message:receive",
                        "data": {
                            "message_id": str(message_id),
                            "thread_id": thread_id,
                            "sender_id": user_id,
                            "content": content,
                            "server_ts": datetime.utcnow().isoformat()
                        }
                    }, recipient_id)
                
                elif message.get("event") == "typing":
                    # Handle typing indicator
                    thread_id = message.get("thread_id")
                    if thread_id:
                        # Broadcast typing to other participants
                        # Implementation would be similar to message sending
                        pass
                
        except WebSocketDisconnect:
            manager.disconnect(websocket, user_id)
        except Exception as e:
            logger.error(f"WebSocket error for user {user_id}: {e}")
            await websocket.close(code=1011, reason="Internal server error")
            manager.disconnect(websocket, user_id)
    
    except jwt.InvalidTokenError:
        await websocket.close(code=1008, reason="Invalid token")

# Admin endpoints (examples)
@app.post("/api/admin/users/{user_id}/assign-teacher")
@require_role("admin")
async def assign_teacher(
    user_id: str, 
    teacher_id: str, 
    current_user: dict = Depends(get_current_user)
):
    async with db_pool.acquire() as conn:
        # Verify both users exist and have correct roles
        student = await conn.fetchrow(
            """
            SELECT u.id FROM users u
            JOIN user_roles ur ON u.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE u.id = $1 AND r.name = 'student'
            """,
            uuid.UUID(user_id)
        )
        
        teacher = await conn.fetchrow(
            """
            SELECT u.id FROM users u
            JOIN user_roles ur ON u.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE u.id = $1 AND r.name = 'teacher'
            """,
            uuid.UUID(teacher_id)
        )
        
        if not student or not teacher:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": {"code": "INVALID_USERS", "message": "Invalid student or teacher"}}
            )
        
        # Create assignment
        await conn.execute(
            """
            INSERT INTO teacher_assignments (teacher_id, student_id, assigned_by)
            VALUES ($1, $2, $3)
            ON CONFLICT (teacher_id, student_id) DO UPDATE SET
                active = true, assigned_at = now(), assigned_by = EXCLUDED.assigned_by
            """,
            uuid.UUID(teacher_id), uuid.UUID(user_id), uuid.UUID(current_user["id"])
        )
        
        # Log audit event
        await conn.execute(
            """
            INSERT INTO audit_logs (actor_user_id, action_type, target, meta)
            VALUES ($1, $2, $3, $4)
            """,
            uuid.UUID(current_user["id"]), "ASSIGN_TEACHER", 
            f"student:{user_id}", {"teacher_id": teacher_id}
        )
    
    return {"success": True, "message": "Teacher assigned successfully"}

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.detail
    )

@app.exception_handler(500)
async def internal_server_error_handler(request, exc):
    logger.error(f"Internal server error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}}
    )

# Startup seed data
@app.on_event("startup")
async def seed_database():
    """Seed database with sample data for development"""
    if config.NODE_ENV == "development":
        try:
            async with db_pool.acquire() as conn:
                # Create sample courses
                await conn.execute(
                    """
                    INSERT INTO courses (id, title, thumbnail_url) VALUES
                    ('course_123', 'Introduction to Finance', 'https://example.com/thumb1.jpg'),
                    ('course_456', 'Advanced Mathematics', 'https://example.com/thumb2.jpg')
                    ON CONFLICT (id) DO NOTHING
                    """
                )
                
                # Create sample modules
                await conn.execute(
                    """
                    INSERT INTO modules (id, course_id, position, title) VALUES
                    ('module_1', 'course_123', 1, 'Getting Started'),
                    ('module_2', 'course_123', 2, 'Basic Concepts'),
                    ('module_3', 'course_456', 1, 'Algebra Fundamentals')
                    ON CONFLICT (id) DO NOTHING
                    """
                )
                
                logger.info("Sample data seeded successfully")
        except Exception as e:
            logger.error(f"Failed to seed database: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=4000,
        reload=config.NODE_ENV == "development",
        log_config={
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "default": {
                    "format": '{"timestamp":"%(asctime)s","level":"%(levelname)s","message":"%(message)s","module":"%(name)s"}',
                },
            },
            "handlers": {
                "default": {
                    "formatter": "default",
                    "class": "logging.StreamHandler",
                    "stream": "ext://sys.stdout",
                },
            },
            "root": {
                "level": "INFO",
                "handlers": ["default"],
            },
        }
    )

# Additional utility files that should be created:

# requirements.txt content:
"""
fastapi==0.104.1
uvicorn[standard]==0.24.0
asyncpg==0.29.0
redis==5.0.1
bcrypt==4.1.1
PyJWT==2.8.0
pydantic[email]==2.5.0
python-multipart==0.0.6
"""

# docker-compose.yml content:
"""
version: '3.8'

services:
  api:
    build: .
    ports:
      - "4000:4000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/regod
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=your-super-secret-jwt-key-change-in-production
      - NODE_ENV=development
    depends_on:
      - db
      - redis
    volumes:
      - .:/app
    command: uvicorn main:app --host 0.0.0.0 --port 4000 --reload

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=regod
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
"""

# Dockerfile content:
"""
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 4000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4000"]
"""