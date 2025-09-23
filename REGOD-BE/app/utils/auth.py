from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from typing import Dict, Any
from app.database import get_db
from app.models import User
from sqlalchemy.orm import Session
import os

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Get current authenticated user from JWT token"""
    try:
        token = credentials.credentials
        JWT_SECRET = os.getenv("JWT_SECRET", "your-super-secret-jwt-key-change-in-production")
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail={"error": {"code": "INVALID_TOKEN", "message": "Invalid token payload"}},
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Get user from database
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
        role = roles[0] if roles else "user"
        
        # Return the User object for RBAC compatibility
        return user
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "TOKEN_EXPIRED", "message": "Token has expired"}},
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "INVALID_TOKEN", "message": "Invalid token"}},
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}},
        )
