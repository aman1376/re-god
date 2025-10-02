from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
import uuid
from typing import Dict, Any, Optional
from app.database import get_db
from app.models import User, Role
from app.clerk_jwt import verify_clerk_jwt, verify_clerk_session
from sqlalchemy.orm import Session
import os
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)
security = HTTPBearer()

# JWT Configuration
JWT_SECRET = os.getenv("JWT_SECRET", "your-super-secret-jwt-key-change-in-production")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))  # 1 hour
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))  # 30 days

def create_access_token(user_id: str, email: str, role: str = "student") -> str:
    """
    Create a new access token
    """
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "user_id": user_id,
        "email": email,
        "role": role,
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "access"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    """
    Create a new refresh token
    """
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": user_id,
        "user_id": user_id,
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "refresh"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token: str) -> Dict[str, Any]:
    """
    Verify and decode a JWT token
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "TOKEN_EXPIRED", "message": "Token has expired"}},
            headers={"WWW-Authenticate": "Bearer"}
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "INVALID_TOKEN", "message": "Invalid token"}},
            headers={"WWW-Authenticate": "Bearer"}
        )

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get current authenticated user from JWT token
    Supports both regular JWT and Clerk JWT tokens with fallback
    Returns dict format for compatibility with courses router
    """
    try:
        token = credentials.credentials
        logger.info(f"Received token (first 50 chars): {token[:50]}...")
        
        user = None
        user_id = None
        email = None
        name = None
        email_verified = False
        payload = None
        
        # Try regular JWT verification first (for mobile app and admin portal)
        try:
            payload = verify_token(token)
            logger.info(f"Successfully verified regular JWT with payload: {payload}")
            
            user_id = payload.get("sub") or payload.get("user_id")
            email = payload.get("email", "")
            name = payload.get("name", "User")
            email_verified = payload.get("email_verified", False)
            
        except HTTPException as jwt_error:
            logger.info(f"Regular JWT verification failed: {jwt_error.detail}, trying Clerk JWT...")
            
            # Fallback to Clerk JWT verification (for legacy compatibility)
            try:
                # Helpers to sanitize Clerk template artifacts and booleans
                def _is_templated(value: Any) -> bool:
                    try:
                        return isinstance(value, str) and ("{{" in value or "}}" in value)
                    except Exception:
                        return False

                def _to_bool(value: Any, default: bool = False) -> bool:
                    if isinstance(value, bool):
                        return value
                    if isinstance(value, str):
                        v = value.strip().lower().strip('"')
                        if v in ("true", "1", "yes"): return True
                        if v in ("false", "0", "no"): return False
                    return default
                
                payload = verify_clerk_jwt(token)
                logger.info(f"Successfully verified Clerk JWT token with payload: {payload}")
                
                # Extract user information from Clerk JWT
                user_id = payload.get("sub") or payload.get("user_id")
                raw_email = payload.get("email") or payload.get("email_address") or payload.get("primary_email_address", {}).get("email_address", "")
                email = None if _is_templated(raw_email) else raw_email
                name = payload.get("name") or payload.get("full_name") or payload.get("given_name") or payload.get("first_name") or "User"
                email_verified = _to_bool(payload.get("email_verified")) or _to_bool(payload.get("email_address_verified"))
                
            except HTTPException as clerk_error:
                logger.info(f"Clerk JWT verification also failed: {clerk_error.detail}, trying Clerk session...")
                
                # Final fallback to Clerk session token verification
                try:
                    payload = verify_clerk_session(token)
                    logger.info(f"Successfully verified Clerk session with payload: {payload}")
                    
                    user_id = payload.get("sub") or payload.get("user_id")
                    email = payload.get("email", "")
                    name = payload.get("name", "User")
                    email_verified = payload.get("email_verified", False)
                    
                except Exception as session_error:
                    logger.error(f"All token verification methods failed. Session error: {session_error}")
                    raise HTTPException(
                        status_code=401,
                        detail={"error": {"code": "TOKEN_VERIFICATION_FAILED", "message": "Token verification failed"}},
                        headers={"WWW-Authenticate": "Bearer"},
                    )
        
        if not user_id:
            logger.error("No user ID found in token payload")
            raise HTTPException(
                status_code=401,
                detail={"error": {"code": "INVALID_TOKEN", "message": "Invalid token payload - no user ID"}},
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Try to find user by UUID first, then by Clerk user ID, then by email
        try:
            user_uuid = uuid.UUID(user_id)
            user = db.query(User).filter(User.id == user_uuid).first()
        except ValueError:
            # Not a UUID, try Clerk user ID
            user = db.query(User).filter(User.clerk_user_id == user_id).first()
        
        if not user and email:
            # Try to find by email as last resort
            user = db.query(User).filter(User.email == email).first()
        
        # Create user if doesn't exist
        if not user:
            logger.info(f"Creating new user for ID: {user_id}")
            user = User(
                id=uuid.uuid4(),  # Generate new UUID for database
                clerk_user_id=user_id,  # Store original Clerk ID
                email=email,
                name=name,
                is_verified=email_verified,
                is_active=True
            )
            db.add(user)
            
            # Assign default student role
            student_role = db.query(Role).filter(Role.name == "student").first()
            if student_role:
                user.roles.append(student_role)
            
            db.commit()
            db.refresh(user)
            logger.info(f"Created new user with database ID: {user.id}")
        else:
            # Update existing user info safely (avoid templated artifacts)
            changed = False
            if email and user.email != email:
                user.email = email
                changed = True
            if name and user.name != name:
                user.name = name
                changed = True
            parsed_verified = bool(email_verified)
            if user.is_verified != parsed_verified:
                user.is_verified = parsed_verified
                changed = True
            if changed:
                db.commit()
        
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
        
        # Return dictionary format for compatibility
        return {
            "id": str(user.id),  # Database UUID
            "email": user.email,
            "name": user.name,
            "role": role,
            "verified": user.is_verified,
            "clerk_user_id": user.clerk_user_id,  # Store Clerk ID for reference
            "avatar_url": user.avatar_url  # Include avatar URL from database
        }
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_current_user: {e}")
        raise HTTPException(
            status_code=500,
            detail={"error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}},
        )