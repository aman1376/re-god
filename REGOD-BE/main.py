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
from app.utils.auth import create_access_token, create_refresh_token, verify_token

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
if config.NODE_ENV == "development":
    # Allow all origins in development
    cors_origins = ["*"]
else:
    # Specific origins in production
    cors_origins = [
        "https://regod.app",
        "https://www.regod.app"
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True if config.NODE_ENV != "development" else False,  # Disable credentials with wildcard
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
# Enable the courses router since it has the proper dashboard implementation
app.include_router(courses.router, prefix="/api", tags=["Courses"])
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
    teacher_code: Optional[str] = None
    
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
    progress_percentage: Optional[float] = None

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

    -- Fix existing user_course_progress table if it has wrong user_id type
    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'user_course_progress'
                   AND column_name = 'user_id'
                   AND data_type != 'uuid') THEN
            ALTER TABLE user_course_progress DROP CONSTRAINT IF EXISTS user_course_progress_user_id_fkey;
            ALTER TABLE user_course_progress ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
            ALTER TABLE user_course_progress ADD CONSTRAINT user_course_progress_user_id_fkey
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
    END $$;
    
    -- Favourites
    CREATE TABLE IF NOT EXISTS user_favourites (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        lesson_id text NOT NULL,
        created_at timestamptz DEFAULT now(),
        UNIQUE (user_id, lesson_id)
    );

    -- Fix existing user_favourites table if it has wrong user_id type
    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'user_favourites'
                   AND column_name = 'user_id'
                   AND data_type != 'uuid') THEN
            ALTER TABLE user_favourites DROP CONSTRAINT IF EXISTS user_favourites_user_id_fkey;
            ALTER TABLE user_favourites ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
            ALTER TABLE user_favourites ADD CONSTRAINT user_favourites_user_id_fkey
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
    END $$;
    
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

    -- Fix existing user_notes table if it has wrong user_id type
    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'user_notes'
                   AND column_name = 'user_id'
                   AND data_type != 'uuid') THEN
            ALTER TABLE user_notes DROP CONSTRAINT IF EXISTS user_notes_user_id_fkey;
            ALTER TABLE user_notes ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
            ALTER TABLE user_notes ADD CONSTRAINT user_notes_user_id_fkey
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
    END $$;
    
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

    -- Lesson completions
    CREATE TABLE IF NOT EXISTS lesson_completions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        course_id text,
        module_id text,
        responses jsonb,
        completed_at timestamptz DEFAULT now(),
        UNIQUE(user_id, course_id, module_id)
    );
    
    -- User module progress
    CREATE TABLE IF NOT EXISTS user_module_progress (
        id serial PRIMARY KEY,
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        course_id integer,
        module_id integer,
        status text DEFAULT 'not_started',
        completed_at timestamptz,
        UNIQUE(user_id, course_id, module_id)
    );

    -- Add columns to existing lesson_completions table if they don't exist
    ALTER TABLE lesson_completions ADD COLUMN IF NOT EXISTS responses jsonb;
    ALTER TABLE lesson_completions ADD COLUMN IF NOT EXISTS completed_at timestamptz DEFAULT now();
    
    -- Ensure user_module_progress has the unique constraint
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'user_module_progress_user_course_module_unique'
        ) THEN
            ALTER TABLE user_module_progress 
            ADD CONSTRAINT user_module_progress_user_course_module_unique 
            UNIQUE (user_id, course_id, module_id);
        END IF;
    END $$;

    -- Teacher codes
    CREATE TABLE IF NOT EXISTS teacher_codes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        teacher_id uuid REFERENCES users(id) ON DELETE CASCADE,
        code text UNIQUE NOT NULL,
        student_id uuid REFERENCES users(id) ON DELETE SET NULL,
        used boolean DEFAULT false,
        created_at timestamptz DEFAULT now(),
        expires_at timestamptz DEFAULT (now() + interval '1 year'),
        max_uses integer DEFAULT -1,
        use_count integer DEFAULT 0,
        is_active boolean DEFAULT true
    );

    -- Add missing columns to existing teacher_codes table if they don't exist
    ALTER TABLE teacher_codes ADD COLUMN IF NOT EXISTS used boolean DEFAULT false;
    ALTER TABLE teacher_codes ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    ALTER TABLE teacher_codes ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT (now() + interval '1 year');
    ALTER TABLE teacher_codes ADD COLUMN IF NOT EXISTS max_uses integer DEFAULT -1;
    ALTER TABLE teacher_codes ADD COLUMN IF NOT EXISTS use_count integer DEFAULT 0;
    ALTER TABLE teacher_codes ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

    -- Insert default roles
    INSERT INTO roles (name) VALUES ('student'), ('teacher'), ('admin') ON CONFLICT DO NOTHING;
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_user_course_progress_user_course ON user_course_progress(user_id, course_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_timestamp ON chat_messages(thread_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher_student ON teacher_assignments(teacher_id, student_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_lesson_completions_user_course_module ON lesson_completions(user_id, course_id, module_id);
    CREATE INDEX IF NOT EXISTS idx_user_module_progress_user_course_module ON user_module_progress(user_id, course_id, module_id);
    CREATE INDEX IF NOT EXISTS idx_teacher_codes_code ON teacher_codes(code);
    CREATE INDEX IF NOT EXISTS idx_teacher_codes_teacher_used ON teacher_codes(teacher_id, used);
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

# create_refresh_token function is now imported from app.utils.auth

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
from app.clerk_jwt import verify_clerk_jwt, verify_clerk_session

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Get current authenticated user from Clerk JWT token or session token"""
    try:
        token = credentials.credentials
        logger.info(f"Received token (first 50 chars): {token[:50]}...")

        # Try to verify as Clerk JWT token first
        try:
            payload = verify_clerk_jwt(token)
            logger.info(f"Successfully verified Clerk JWT token with payload: {payload}")
        except HTTPException as e:
            logger.warning(f"Clerk JWT verification failed: {e.detail}")
            # If Clerk JWT verification fails, try as regular JWT token
            logger.warning(f"Clerk JWT verification failed: {e.detail}, trying regular JWT")
            try:
                JWT_SECRET = config.JWT_SECRET
                payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
                logger.info(f"Successfully verified regular JWT token with payload: {payload}")
            except jwt.InvalidTokenError as jwt_error:
                # If both JWT methods fail, try to validate as Clerk session token
                logger.warning(f"Regular JWT verification also failed: {jwt_error}, trying Clerk session validation")
                try:
                    # For Clerk session tokens, we'll extract user info from the token structure
                    # This is a fallback until JWT template is configured
                    payload = await verify_clerk_session(token)
                    logger.info(f"Successfully verified Clerk session token with payload: {payload}")
                except Exception as session_error:
                    logger.error(f"Session validation also failed: {session_error}")
                    # Re-raise the original Clerk error
                    raise e
        
        # Extract user ID from Clerk JWT payload
        # Try multiple possible field names since JWT template configuration varies
        user_id = (
            payload.get("sub") or
            payload.get("user_id") or
            payload.get("id") or
            payload.get("user")
        )
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail={"error": {"code": "INVALID_TOKEN", "message": "Invalid token payload - missing user ID"}},
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Try to find user by ID
        user = None

        # First try to find by database ID (UUID)
        try:
            user_uuid = uuid.UUID(user_id)
            user = db.query(User).filter(User.id == user_uuid).first()
        except ValueError:
            pass

        # If not found by UUID, try to find by Clerk user ID
        if not user:
            user = db.query(User).filter(User.clerk_user_id == user_id).first()

        # If still not found, try by email
        if not user:
            email = payload.get("email") or payload.get("email_address")
            if email:
                user = db.query(User).filter(User.email == email).first()
        
        # If user doesn't exist in our database, create them from Clerk data
        if not user:
            # Extract user data from Clerk payload with multiple possible field names
            email = (
                payload.get("email") or
                payload.get("email_address") or
                payload.get("primary_email") or
                ""
            )
            name = (
                payload.get("name") or
                payload.get("full_name") or
                payload.get("display_name") or
                ""
            )
            if not name:
                # Try to construct name from first/last names
                first_name = payload.get("first_name") or payload.get("given_name") or ""
                last_name = payload.get("last_name") or payload.get("family_name") or ""
                name = f"{first_name} {last_name}".strip()

            # Handle different user ID formats
            try:
                if user_id.startswith(('user_', 'usr_')):
                    # This is likely from our mock session verification, create proper UUID
                    actual_user_id = str(uuid.uuid4())
                else:
                    user_uuid = uuid.UUID(user_id)
                    actual_user_id = str(user_uuid)
            except ValueError:
                # Create a proper UUID for any other format
                actual_user_id = str(uuid.uuid4())

            # Handle email verification field names
            email_verified = (
                payload.get("email_verified") or
                payload.get("verified") or
                payload.get("email_verification") or
                False
            )

            # Create new user
            user = User(
                id=actual_user_id,
                email=email,
                name=name.strip() or email.split('@')[0] if email else "User",
                clerk_user_id=user_id,  # Store the original Clerk user ID
                is_verified=email_verified,
                is_active=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            logger.info(f"Created new user from Clerk: {user_id} -> {actual_user_id}")
        
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
        # Ensure we always return the database UUID, not the Clerk user ID
        return {
            "id": str(user.id),  # This is the database UUID
            "email": user.email,
            "name": user.name,
            "role": role,
            "verified": user.is_verified,
            "clerk_user_id": user.clerk_user_id  # Store Clerk ID for reference
        }
        
    except HTTPException:
        # Re-raise HTTP exceptions from verify_clerk_jwt
        raise
    except Exception as e:
        logger.error(f"Authentication error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={"error": {"code": "AUTH_ERROR", "message": "Authentication error"}},
            headers={"WWW-Authenticate": "Bearer"},
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

@app.get("/api/auth/test")
async def test_auth_status():
    """Test endpoint to verify authentication system status"""
    return {
        "status": "authentication_system_active",
        "endpoints": {
            "profile": "/api/user/profile",
            "dashboard": "/api/user/dashboard", 
            "admin": "/api/admin/users"
        },
        "note": "All endpoints require valid JWT Bearer tokens",
        "debug": "/api/auth/debug-jwt (POST with {'token': 'your_token'})"
    }

# Debug JWT endpoint (development only)
@app.post("/api/auth/debug-jwt")
async def debug_jwt(request: dict):
    """Debug JWT token endpoint - only for development"""
    try:
        token = request.get("token")
        if not token:
            return {"error": "No token provided"}

        logger.info(f"Debug JWT token (first 50 chars): {token[:50]}...")

        # Try to verify as Clerk JWT token first
        try:
            payload = verify_clerk_jwt(token)
            return {"type": "clerk_jwt", "payload": payload, "success": True}
        except Exception as e:
            logger.warning(f"Clerk JWT failed: {e}")

        # Try as regular JWT
        try:
            JWT_SECRET = config.JWT_SECRET
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            return {"type": "regular_jwt", "payload": payload, "success": True}
        except Exception as e:
            logger.warning(f"Regular JWT failed: {e}")

        # Try as session token
        try:
            payload = verify_clerk_session(token)
            return {"type": "session_token", "payload": payload, "success": True}
        except Exception as e:
            logger.warning(f"Session token failed: {e}")

        return {"error": "All verification methods failed", "success": False}
    except Exception as e:
        logger.error(f"Debug JWT error: {e}")
        return {"error": str(e), "success": False}

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
            "INSERT INTO users (id, email, hashed_password, name) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id",
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
        
        # Handle teacher code if provided
        if request.teacher_code:
            try:
                # Find the teacher code
                teacher_code_record = await conn.fetchrow(
                    "SELECT * FROM teacher_codes WHERE code = $1 AND is_active = true",
                    request.teacher_code
                )
                
                if teacher_code_record:
                    # Check if code has expired
                    if teacher_code_record["expires_at"] and teacher_code_record["expires_at"] < datetime.utcnow():
                        # Code expired, but don't fail registration
                        logger.warning(f"Teacher code {request.teacher_code} has expired")
                    else:
                        # Check if code has reached max uses
                        if teacher_code_record["max_uses"] != -1 and teacher_code_record["use_count"] >= teacher_code_record["max_uses"]:
                            # Code reached max uses, but don't fail registration
                            logger.warning(f"Teacher code {request.teacher_code} has reached maximum uses")
                        else:
                            # Check if student already has access to this teacher
                            existing_access = await conn.fetchrow(
                                "SELECT id FROM student_teacher_access WHERE student_id = $1 AND teacher_id = $2",
                                user_id, teacher_code_record["teacher_id"]
                            )
                            
                            if not existing_access:
                                # Create student-teacher access record
                                await conn.execute(
                                    "INSERT INTO student_teacher_access (student_id, teacher_id, granted_via_code, is_active) VALUES ($1, $2, true, true)",
                                    user_id, teacher_code_record["teacher_id"]
                                )
                                
                                # Update teacher code use count
                                await conn.execute(
                                    "UPDATE teacher_codes SET use_count = use_count + 1 WHERE id = $1",
                                    teacher_code_record["id"]
                                )
                                
                                logger.info(f"Teacher code {request.teacher_code} successfully applied for user {user_id}")
                            else:
                                logger.info(f"User {user_id} already has access to teacher {teacher_code_record['teacher_id']}")
                else:
                    logger.warning(f"Invalid teacher code: {request.teacher_code}")
            except Exception as e:
                logger.error(f"Error processing teacher code {request.teacher_code}: {e}")
                # Don't fail registration if teacher code processing fails
    
    # Create tokens
    access_token = create_access_token(str(user_id), request.email, "student")
    refresh_token = create_refresh_token(str(user_id))
    
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
        
        if not user or not user["hashed_password"] or not verify_password(request.password, user["hashed_password"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": {"code": "INVALID_CREDENTIALS", "message": "Invalid credentials"}}
            )
    
    # Create tokens
    role = user["role"] or "student"
    access_token = create_access_token(str(user["id"]), user["email"], role)
    refresh_token = create_refresh_token(str(user["id"]))
    
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
    access_token = create_access_token(str(user["id"]), user["email"], "student")
    
    return {"verified": True, "auth_token": access_token}

@app.post("/api/auth/debug-jwt")
async def debug_jwt_token(request: dict):
    """Debug endpoint to inspect JWT token contents"""
    try:
        token = request.get("token")
        if not token:
            return {"error": "No token provided", "success": False}
        
        # Try to decode without verification first to see the payload
        try:
            unverified_payload = jwt.decode(token, options={"verify_signature": False})
            logger.info(f"Unverified JWT payload: {unverified_payload}")
        except Exception as e:
            logger.error(f"Failed to decode JWT without verification: {e}")
            unverified_payload = None
        
        # Try regular JWT verification
        try:
            payload = verify_token(token)
            return {
                "success": True,
                "token_type": "JWT",
                "payload": payload,
                "unverified_payload": unverified_payload
            }
        except HTTPException as e:
            logger.info(f"JWT verification failed: {e.detail}")
        
        # Try Clerk JWT verification
        try:
            from app.utils.auth import verify_clerk_jwt
            payload = verify_clerk_jwt(token)
            return {
                "success": True,
                "token_type": "Clerk JWT",
                "payload": payload,
                "unverified_payload": unverified_payload
            }
        except HTTPException as e:
            logger.info(f"Clerk JWT verification failed: {e.detail}")
        
        # Try Clerk session verification
        try:
            from app.utils.auth import verify_clerk_session
            payload = verify_clerk_session(token)
            return {
                "success": True,
                "token_type": "Clerk Session",
                "payload": payload,
                "unverified_payload": unverified_payload
            }
        except Exception as e:
            logger.info(f"Clerk session verification failed: {e}")
        
        return {
            "success": False,
            "error": "Token verification failed with all methods",
            "unverified_payload": unverified_payload
        }
        
    except Exception as e:
        logger.error(f"Debug JWT error: {e}")
        return {"error": str(e), "success": False}

class RefreshTokenRequest(BaseModel):
    refresh_token: str

@app.post("/api/auth/refresh", response_model=AuthResponse)
async def refresh_access_token(request: RefreshTokenRequest):
    """Refresh an access token using a valid refresh token"""
    try:
        # Verify the refresh token
        payload = verify_token(request.refresh_token)
        
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": {"code": "INVALID_TOKEN_TYPE", "message": "Invalid token type"}}
            )
        
        user_id = payload.get("sub") or payload.get("user_id")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": {"code": "INVALID_TOKEN", "message": "Invalid token payload"}}
            )
        
        # Check if refresh token exists in database
        async with db_pool.acquire() as conn:
            token_record = await conn.fetchrow(
                "SELECT * FROM refresh_tokens WHERE user_id = $1 AND expires_at > $2",
                uuid.UUID(user_id), datetime.utcnow()
            )
            
            if not token_record:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail={"error": {"code": "INVALID_REFRESH_TOKEN", "message": "Invalid or expired refresh token"}}
                )
            
            # Get user info
            user = await conn.fetchrow(
                "SELECT u.*, r.name as role FROM users u "
                "LEFT JOIN user_roles ur ON u.id = ur.user_id "
                "LEFT JOIN roles r ON ur.role_id = r.id "
                "WHERE u.id = $1",
                uuid.UUID(user_id)
            )
            
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"error": {"code": "USER_NOT_FOUND", "message": "User not found"}}
                )
        
        # Create new access token
        role = user["role"] or "student"
        new_access_token = create_access_token(str(user["id"]), user["email"], role)
        
        # Optionally create new refresh token (rotation)
        new_refresh_token = create_refresh_token(str(user["id"]))
        
        # Update refresh token in database
        async with db_pool.acquire() as conn:
            await conn.execute(
                "UPDATE refresh_tokens SET token_hash = $1, expires_at = $2 WHERE user_id = $3",
                hash_password(new_refresh_token), 
                datetime.utcnow() + timedelta(days=config.JWT_REFRESH_TTL),
                user["id"]
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
            auth_token=new_access_token,
            refresh_token=new_refresh_token,
            user_data=user_data
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": {"code": "REFRESH_ERROR", "message": "Token refresh failed"}}
        )

@app.post("/api/auth/clerk-exchange", response_model=AuthResponse)
async def clerk_exchange(request: ClerkExchangeRequest, credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Exchange a Clerk user (by clerk_user_id or email) for backend JWT."""
    try:
        identifier = request.identifier
        logger.info(f"Clerk exchange request for identifier: {identifier}")
        
        if not identifier:
            raise HTTPException(status_code=400, detail={"error": {"code": "BAD_REQUEST", "message": "Missing identifier"}})

        # Extract user data from Clerk JWT token
        clerk_user_data = None
        try:
            # Try to verify the Clerk JWT token to get user data
            clerk_payload = verify_clerk_jwt(credentials.credentials)
            clerk_user_data = {
                "name": (
                    clerk_payload.get("name") or
                    clerk_payload.get("full_name") or
                    clerk_payload.get("display_name") or
                    ""
                ),
                "email": (
                    clerk_payload.get("email") or
                    clerk_payload.get("email_address") or
                    clerk_payload.get("primary_email") or
                    identifier
                ),
                "email_verified": (
                    clerk_payload.get("email_verified") or
                    clerk_payload.get("verified") or
                    clerk_payload.get("email_verification") or
                    False
                ),
                "clerk_user_id": (
                    clerk_payload.get("sub") or
                    clerk_payload.get("user_id") or
                    clerk_payload.get("id") or
                    ""
                )
            }
            logger.info(f"Extracted Clerk user data: {clerk_user_data}")
        except Exception as e:
            logger.warning(f"Failed to extract Clerk user data: {e}")
            # Fallback to basic data
            clerk_user_data = {
                "name": "User",
                "email": identifier,
                "email_verified": False,
                "clerk_user_id": None
            }

        async with db_pool.acquire() as conn:
            logger.info(f"Looking up user with identifier: {identifier}")
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
            logger.info(f"User lookup result: {user}")

            if not user:
                # If user doesn't exist, create them using asyncpg
                try:
                    logger.info(f"Creating new user for identifier: {identifier}")
                    
                    # Use extracted name or fallback to email prefix
                    user_name = clerk_user_data["name"].strip() if clerk_user_data["name"].strip() else identifier.split('@')[0]
                    
                    # Create new user using asyncpg
                    user_id = await conn.fetchval(
                        """
                        INSERT INTO users (id, email, name, is_verified, is_active, clerk_user_id) 
                        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) 
                        RETURNING id
                        """,
                        clerk_user_data["email"],
                        user_name,
                        clerk_user_data["email_verified"],
                        True,    # is_active
                        clerk_user_data["clerk_user_id"]
                    )
                    
                    # Assign default student role
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
                    
                    # Now fetch the created user
                    user = await conn.fetchrow(
                        """
                        SELECT u.*, r.name as role
                        FROM users u
                        LEFT JOIN user_roles ur ON u.id = ur.user_id
                        LEFT JOIN roles r ON ur.role_id = r.id
                        WHERE u.id = $1
                        """,
                        user_id
                    )
                    
                    logger.info(f"Successfully created user with ID: {user_id}")
                    
                except Exception as e:
                    logger.error(f"Error creating user: {str(e)}")
                    raise HTTPException(
                        status_code=500, 
                        detail={"error": {"code": "USER_CREATION_FAILED", "message": "Failed to create user"}}
                    )

            role = user["role"] or "student"
            access_token = create_access_token(str(user["id"]), user["email"], role)
            refresh_token = create_refresh_token(str(user["id"]))

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
            
            # If we have updated user data from Clerk, use it
            if clerk_user_data and clerk_user_data["name"].strip():
                user_data["name"] = clerk_user_data["name"]
                user_data["verified"] = clerk_user_data["email_verified"]

            logger.info(f"Clerk exchange successful for user: {user['email']}")

            return AuthResponse(
                user_id=str(user["id"]),
                auth_token=access_token,
                refresh_token=refresh_token,
                user_data=user_data
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Clerk exchange error: {e}")
        logger.error(f"Clerk exchange error type: {type(e)}")
        import traceback
        logger.error(f"Clerk exchange traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={"error": {"code": "INTERNAL_ERROR", "message": f"Internal server error: {str(e)}"}}
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

# Dashboard endpoints - using courses router instead
# Dashboard functionality moved to courses router to avoid conflicts

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
        logger.info(f"Total modules in course {course_id}: {total_modules}")
        
        # Get current progress
        current_progress = await conn.fetchrow(
            "SELECT progress_percentage FROM user_course_progress WHERE user_id = $1 AND course_id = $2",
            uuid.UUID(current_user["id"]), course_id
        )
        
        # Calculate progress based on request type
        if request.progress_percentage is not None:
            # Use provided progress percentage
            new_progress = request.progress_percentage
            logger.info(f"Using provided progress percentage: {new_progress}")
        elif request.status == "completed":
            # Calculate progress: each module completion is worth (100 / total_modules)%
            if total_modules > 0:
                module_progress = 100 / total_modules
                current_prog = current_progress["progress_percentage"] if current_progress else 0
                new_progress = current_prog + module_progress
                new_progress = min(new_progress, 100)  # Cap at 100%
                logger.info(f"Calculated progress: {current_prog} + {module_progress} = {new_progress}")
            else:
                new_progress = 100  # If no modules, mark as complete
                logger.info("No modules found, setting progress to 100%")
        else:
            # For visited status, keep current progress or use provided
            new_progress = current_progress["progress_percentage"] if current_progress else 0
            logger.info(f"Using current progress: {new_progress}")
        
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
    
    return {"success": True, "updated_progress_percentage": new_progress, "endpoint": "main.py"}

# Complete lesson endpoint
class CompleteLessonRequest(BaseModel):
    course_id: str
    module_id: str
    responses: List[Dict[str, Any]]
    completed_at: str

@app.post("/api/learn/complete-lesson")
async def complete_lesson(request: CompleteLessonRequest, current_user: dict = Depends(get_current_user)):
    try:
        logger.info(f"Complete lesson request: course_id={request.course_id}, module_id={request.module_id}")
        logger.info(f"Current user: {current_user}")
        
        async with db_pool.acquire() as conn:
            # Mark the lesson as completed with responses
            course_id = request.course_id  # Keep as string
            module_id = request.module_id  # Keep as string
            
            logger.info(f"Using IDs: course_id={course_id}, module_id={module_id}")

            # Parse the completed_at datetime
            from datetime import datetime
            completed_at = datetime.fromisoformat(request.completed_at.replace('Z', '+00:00'))
            
            # Insert lesson completion record
            await conn.execute(
                """
                INSERT INTO lesson_completions (user_id, course_id, module_id, responses, completed_at)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (user_id, course_id, module_id) DO UPDATE SET
                responses = EXCLUDED.responses,
                completed_at = EXCLUDED.completed_at
                """,
                uuid.UUID(current_user["id"]), course_id, module_id,
                json.dumps(request.responses), completed_at
            )
            
            # Also create/update user_module_progress record
            await conn.execute(
                """
                INSERT INTO user_module_progress (user_id, course_id, module_id, status, completed_at)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (user_id, course_id, module_id) DO UPDATE SET
                status = EXCLUDED.status,
                completed_at = EXCLUDED.completed_at
                """,
                uuid.UUID(current_user["id"]), int(course_id), int(module_id),
                'completed', completed_at
            )
            
            logger.info("Lesson completion record inserted successfully")

            # Also update the course progress to 100% for this module
            progress_request = ProgressRequest(
                course_id=course_id,
                module_id=module_id,
                status="completed"
            )
            await update_progress(progress_request, current_user)
            
            logger.info("Course progress updated successfully")

        return {"success": True, "message": "Lesson completed successfully"}
        
    except Exception as e:
        logger.error(f"Error in complete_lesson: {e}")
        logger.error(f"Error type: {type(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={"error": {"code": "INTERNAL_ERROR", "message": f"Internal server error: {str(e)}"}}
        )

# Teacher code endpoint - removed duplicate implementation
# The existing teacher_codes router handles this functionality properly

# Refresh token endpoint
class RefreshTokenRequest(BaseModel):
    refresh_token: str

@app.post("/api/auth/refresh")
async def refresh_token(request: RefreshTokenRequest):
    try:
        async with db_pool.acquire() as conn:
            # Try to decode the refresh token first (it might be a JWT)
            try:
                # Try JWT decode first
                payload = jwt.decode(request.refresh_token, config.JWT_SECRET, algorithms=["HS256"])
                user_id = payload.get("user_id")
                if not user_id:
                    raise jwt.InvalidTokenError("No user_id in token")
                
                # Check if this JWT refresh token exists in our database
                token_record = await conn.fetchrow(
                    "SELECT user_id, expires_at, revoked FROM refresh_tokens WHERE token_hash = $1",
                    request.refresh_token
                )
                
                if not token_record:
                    # JWT is valid but not in database, treat as valid for backward compatibility
                    user = await conn.fetchrow(
                        "SELECT id, email, name, role FROM users u LEFT JOIN user_roles ur ON u.id = ur.user_id LEFT JOIN roles r ON ur.role_id = r.id WHERE u.id = $1",
                        uuid.UUID(user_id)
                    )
                    if not user:
                        raise HTTPException(status_code=401, detail="User not found")
                else:
                    # Token exists in database, check expiry and revocation
                    if token_record["expires_at"] < datetime.utcnow():
                        raise HTTPException(status_code=401, detail="Refresh token expired")
                    if token_record["revoked"]:
                        raise HTTPException(status_code=401, detail="Refresh token revoked")
                    
                    # Get user from database
                    user = await conn.fetchrow(
                        "SELECT u.id, u.email, u.name, r.name as role FROM users u LEFT JOIN user_roles ur ON u.id = ur.user_id LEFT JOIN roles r ON ur.role_id = r.id WHERE u.id = $1",
                        token_record["user_id"]
                    )
                    if not user:
                        raise HTTPException(status_code=401, detail="User not found")
                
            except jwt.ExpiredSignatureError:
                raise HTTPException(status_code=401, detail="Refresh token expired")
            except jwt.InvalidTokenError:
                # Not a JWT, try as raw token (backward compatibility)
                token_record = await conn.fetchrow(
                    "SELECT user_id, expires_at, revoked FROM refresh_tokens WHERE token_hash = $1",
                    hash_password(request.refresh_token)
                )
                
                if not token_record:
                    raise HTTPException(status_code=401, detail="Invalid refresh token")
                
                if token_record["expires_at"] < datetime.utcnow():
                    raise HTTPException(status_code=401, detail="Refresh token expired")
                if token_record["revoked"]:
                    raise HTTPException(status_code=401, detail="Refresh token revoked")
                
                user = await conn.fetchrow(
                    "SELECT u.id, u.email, u.name, r.name as role FROM users u LEFT JOIN user_roles ur ON u.id = ur.user_id LEFT JOIN roles r ON ur.role_id = r.id WHERE u.id = $1",
                    token_record["user_id"]
                )
                if not user:
                    raise HTTPException(status_code=401, detail="User not found")

            # Generate new tokens
            role = user["role"] or "student"
            access_token = create_access_token(str(user["id"]), user["email"], role)
            new_refresh_token = create_refresh_token(str(user["id"]))

            # Revoke old token if it exists in database
            await conn.execute(
                "UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1 OR token_hash = $2",
                request.refresh_token, hash_password(request.refresh_token)
            )

            # Store new refresh token
            await conn.execute(
                "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
                user["id"], hash_password(new_refresh_token), datetime.utcnow() + timedelta(days=config.JWT_REFRESH_TTL)
            )

            return {
                "access_token": access_token,
                "auth_token": access_token,  # For compatibility
                "refresh_token": new_refresh_token,
                "user_id": str(user["id"])
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Refresh token error: {e}")
        raise HTTPException(status_code=401, detail="Invalid refresh token")

# Duplicate clerk-exchange endpoint removed - using the comprehensive one above

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
                SELECT u.id, u.name, u.avatar_url FROM student_teacher_access sta
                JOIN users u ON sta.teacher_id = u.id
                WHERE sta.student_id = $1 AND sta.is_active = true
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
                "SELECT id FROM chat_threads WHERE user_id = $1 AND assigned_teacher_id = $2",
                uuid.UUID(current_user["id"]), teacher["id"]
            )
            
            if not thread:
                thread_id = await conn.fetchval(
                    "INSERT INTO chat_threads (user_id, assigned_teacher_id) VALUES ($1, $2) RETURNING id",
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
                "id": str(teacher["id"]),
                "name": teacher["name"],
                "avatar_url": teacher["avatar_url"],
                "is_online": False,  # TODO: Implement online status
                "thread_id": str(thread_id),
                "unread_count": unread_count
            }
        
        elif current_user["role"] == "teacher":
            # For teachers, redirect to the students endpoint
            raise HTTPException(
                status_code=status.HTTP_302_FOUND,
                detail={"error": {"code": "USE_STUDENTS_ENDPOINT", "message": "Teachers should use /api/connect/students endpoint"}}
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"error": {"code": "FORBIDDEN", "message": "Only students and teachers can access this endpoint"}}
            )

@app.get("/api/connect/thread/messages")
async def get_thread_messages(thread_id: str, current_user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        # Verify access to thread
        thread = await conn.fetchrow(
            "SELECT user_id, assigned_teacher_id FROM chat_threads WHERE id = $1",
            int(thread_id)
        )
        
        if not thread:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": {"code": "THREAD_NOT_FOUND", "message": "Thread not found"}}
            )
        
        user_id = uuid.UUID(current_user["id"])
        if user_id not in [thread["user_id"], thread["assigned_teacher_id"]] and current_user["role"] != "admin":
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
            int(thread_id)
        )
        
        # Mark messages as read for current user
        await conn.execute(
            "UPDATE chat_messages SET read_status = true WHERE thread_id = $1 AND sender_id != $2",
            int(thread_id), user_id
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
            "SELECT user_id, assigned_teacher_id FROM chat_threads WHERE id = $1",
            int(request.thread_id)
        )
        
        if not thread:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": {"code": "THREAD_NOT_FOUND", "message": "Thread not found"}}
            )
        
        user_id = uuid.UUID(current_user["id"])
        if user_id not in [thread["user_id"], thread["assigned_teacher_id"]]:
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
            int(request.thread_id), user_id, current_user["role"], request.content
        )
    
    # Send real-time notification to other participant
    recipient_id = str(thread["assigned_teacher_id"]) if user_id == thread["user_id"] else str(thread["user_id"])
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

@app.get("/api/connect/students")
async def get_assigned_students(current_user: dict = Depends(get_current_user)):
    """Get assigned students for teachers"""
    if current_user["role"] != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "FORBIDDEN", "message": "Only teachers can access this endpoint"}}
        )
    
    async with db_pool.acquire() as conn:
        students = await conn.fetch(
            """
            SELECT DISTINCT u.id, u.name, u.avatar_url, 
                   (SELECT COUNT(*) FROM chat_messages cm 
                    JOIN chat_threads ct ON cm.thread_id = ct.id 
                    WHERE ct.assigned_teacher_id = $1 AND ct.user_id = u.id 
                    AND cm.sender_id != $1 AND cm.read_status = false) as unread_count,
                   (SELECT cm.content FROM chat_messages cm 
                    JOIN chat_threads ct ON cm.thread_id = ct.id 
                    WHERE ct.assigned_teacher_id = $1 AND ct.user_id = u.id 
                    ORDER BY cm.timestamp DESC LIMIT 1) as last_message,
                   (SELECT cm.timestamp FROM chat_messages cm 
                    JOIN chat_threads ct ON cm.thread_id = ct.id 
                    WHERE ct.assigned_teacher_id = $1 AND ct.user_id = u.id 
                    ORDER BY cm.timestamp DESC LIMIT 1) as last_message_time
            FROM student_teacher_access sta
            JOIN users u ON sta.student_id = u.id
            WHERE sta.teacher_id = $1 AND sta.is_active = true
            ORDER BY last_message_time DESC NULLS LAST
            """,
            uuid.UUID(current_user["id"])
        )
        
        return [
            {
                "id": str(student["id"]),
                "name": student["name"],
                "avatar_url": student["avatar_url"],
                "unread_count": student["unread_count"] or 0,
                "last_message": student["last_message"],
                "last_message_time": student["last_message_time"].isoformat() if student["last_message_time"] else None,
                "is_online": False  # TODO: Implement online status
            }
            for student in students
        ]

# Notes endpoints
@app.get("/api/user/notes")
async def get_notes(current_user: dict = Depends(get_current_user)):
    async with db_pool.acquire() as conn:
        notes = await conn.fetch(
            """
            SELECT id, title, content, created_at, updated_at
            FROM user_notes
            WHERE user_id = $1
            ORDER BY created_at DESC
            """,
            uuid.UUID(current_user["id"])
        )
    
    return [
        {
            "id": note["id"],
            "user_id": str(current_user["id"]),
            "title": note["title"],
            "content": note["content"],
            "created_at": note["created_at"].isoformat(),
            "updated_at": note["updated_at"].isoformat() if note["updated_at"] else note["created_at"].isoformat()
        }
        for note in notes
    ]

@app.post("/api/user/notes")
async def create_note(
    note_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Create a new note"""
    async with db_pool.acquire() as conn:
        # Insert new note
        note_id = await conn.fetchval(
            """
            INSERT INTO user_notes (user_id, title, content)
            VALUES ($1, $2, $3)
            RETURNING id
            """,
            uuid.UUID(current_user["id"]),
            note_data.get("title"),
            note_data.get("content", "")
        )
        
        # Get the created note
        note = await conn.fetchrow(
            """
            SELECT id, title, content, created_at, updated_at
            FROM user_notes
            WHERE id = $1
            """,
            note_id
        )
    
    return {
        "id": note["id"],
        "user_id": str(current_user["id"]),
        "title": note["title"],
        "content": note["content"],
        "created_at": note["created_at"].isoformat(),
        "updated_at": note["updated_at"].isoformat() if note["updated_at"] else note["created_at"].isoformat()
    }

@app.put("/api/user/notes/{note_id}")
async def update_note(
    note_id: int,
    note_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update an existing note"""
    async with db_pool.acquire() as conn:
        # Update note
        await conn.execute(
            """
            UPDATE user_notes 
            SET title = $1, content = $2, updated_at = NOW()
            WHERE id = $3 AND user_id = $4
            """,
            note_data.get("title"),
            note_data.get("content", ""),
            note_id,
            uuid.UUID(current_user["id"])
        )
        
        # Get the updated note
        note = await conn.fetchrow(
            """
            SELECT id, title, content, created_at, updated_at
            FROM user_notes
            WHERE id = $1 AND user_id = $2
            """,
            note_id,
            uuid.UUID(current_user["id"])
        )
        
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
    
    return {
        "id": note["id"],
        "user_id": str(current_user["id"]),
        "title": note["title"],
        "content": note["content"],
        "created_at": note["created_at"].isoformat(),
        "updated_at": note["updated_at"].isoformat() if note["updated_at"] else note["created_at"].isoformat()
    }

@app.delete("/api/user/notes/{note_id}")
async def delete_note(
    note_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Delete a note"""
    async with db_pool.acquire() as conn:
        result = await conn.execute(
            """
            DELETE FROM user_notes 
            WHERE id = $1 AND user_id = $2
            """,
            note_id,
            uuid.UUID(current_user["id"])
        )
        
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Note not found")
    
    return {"message": "Note deleted successfully"}

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
                            "SELECT user_id, assigned_teacher_id FROM chat_threads WHERE id = $1",
                            int(thread_id)
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
                            int(thread_id), user_uuid, "student", content  # You'd get role from token
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

@app.get("/api/auth/test-clerk-exchange")
async def test_clerk_exchange():
    """Test endpoint to verify Clerk exchange functionality"""
    try:
        # Test with a dummy email to see if the endpoint works
        test_email = "test@example.com"
        
        async with db_pool.acquire() as conn:
            # Check if test user exists
            user = await conn.fetchrow(
                """
                SELECT u.*, r.name as role
                FROM users u
                LEFT JOIN user_roles ur ON u.id = ur.user_id
                LEFT JOIN roles r ON ur.role_id = r.id
                WHERE u.email = $1
                """,
                test_email
            )
            
            if user:
                return {
                    "success": True,
                    "message": "User exists",
                    "user": {
                        "id": str(user["id"]),
                        "email": user["email"],
                        "role": user["role"]
                    }
                }
            else:
                return {
                    "success": True,
                    "message": "User does not exist, would create new user",
                    "test_email": test_email
                }
                
    except Exception as e:
        logger.error(f"Test clerk exchange error: {e}")
        return {
            "success": False,
            "error": str(e)
        }

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