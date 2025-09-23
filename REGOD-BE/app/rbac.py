from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from functools import wraps
from typing import List, Callable, Any
from app.database import get_db
from app.models import User, Role, Permission
from app.utils.auth import get_current_user  # Local JWT-based auth

# =========================
# Permission constants
# =========================
PERMISSIONS = {
    "user:read": "Read user information",
    "user:write": "Modify user information",
    "user:delete": "Delete user account",
    "course:read": "Read course information",
    "course:write": "Create or modify courses",
    "course:delete": "Delete courses",
    "progress:read": "Read progress information",
    "progress:write": "Update progress information",
    "chat:read": "Read chat messages",
    "chat:write": "Send chat messages",
    "chat:delete": "Delete chat messages",
    "note:read": "Read notes",
    "note:write": "Create or modify notes",
    "note:delete": "Delete notes",
    "admin:users:manage": "Manage users and roles",
    "admin:courses:manage": "Manage all courses",
    "admin:system:manage": "Manage system settings",
    "teacher:codes:manage": "Manage teacher codes",
    "teacher:students:view": "View assigned students",
}

# =========================
# Default roles
# =========================
DEFAULT_ROLES = {
    "student": {
        "description": "Default student role",
        "permissions": [
            "user:read", "user:write",
            "course:read",
            "progress:read", "progress:write",
            "chat:read", "chat:write",
            "note:read", "note:write", "note:delete"
        ]
    },
    "teacher": {
        "description": "Teacher role",
        "permissions": [
            "user:read",
            "course:read", "course:write",
            "progress:read",
            "chat:read", "chat:write",
            "note:read",
            "teacher:codes:manage",
            "teacher:students:view"
        ]
    },
    "admin": {
        "description": "Administrator role",
        "permissions": list(PERMISSIONS.keys())  # All permissions
    }
}

# =========================
# Decorators
# =========================
def require_permission(permission_name: str):
    """Require a specific permission for an endpoint"""
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(
            *args, 
            current_user: User = Depends(get_current_user),
            db: Session = Depends(get_db),
            **kwargs: Any
        ):
            if not current_user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required"
                )

            if not current_user.has_permission(permission_name):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission '{permission_name}' required"
                )

            return await func(*args, current_user=current_user, db=db, **kwargs)
        return wrapper
    return decorator


from typing import Union

def require_role(role_name: Union[str, list[str]]):
    """Require a specific role (or any of a list of roles) for an endpoint"""
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(
            *args,
            current_user: User = Depends(get_current_user),
            db: Session = Depends(get_db),
            **kwargs: Any
        ):
            if not current_user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required"
                )
            roles_to_check = role_name if isinstance(role_name, list) else [role_name]
            if not any(current_user.has_role(r) for r in roles_to_check):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Role '{roles_to_check}' required"
                )

            return await func(*args, current_user=current_user, db=db, **kwargs)
        return wrapper
    return decorator

# =========================
# RBAC Initialization
# =========================
def initialize_rbac(db: Session):
    """Initialize the RBAC system with default roles and permissions"""
    # Create permissions
    for perm_name, perm_desc in PERMISSIONS.items():
        permission = db.query(Permission).filter(Permission.name == perm_name).first()
        if not permission:
            permission = Permission(name=perm_name, description=perm_desc)
            db.add(permission)

    db.commit()

    # Create roles with permissions
    for role_name, role_data in DEFAULT_ROLES.items():
        role = db.query(Role).filter(Role.name == role_name).first()
        if not role:
            role = Role(
                name=role_name,
                description=role_data["description"],
                is_default=(role_name == "student")
            )
            db.add(role)
            db.flush()

        # Assign permissions
        for perm_name in role_data["permissions"]:
            permission = db.query(Permission).filter(Permission.name == perm_name).first()
            if permission and permission not in role.permissions:
                role.permissions.append(permission)

    db.commit()


def get_user_permissions(user: User) -> List[str]:
    """Get all permissions for a user"""
    permissions = []
    for role in user.roles:
        for permission in role.permissions:
            permissions.append(permission.name)
    return list(set(permissions))  # Remove duplicates
