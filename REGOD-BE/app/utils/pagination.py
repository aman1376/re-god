"""
Pagination utility for consistent pagination across all endpoints
"""
from typing import TypeVar, Generic, List, Optional
from pydantic import BaseModel
from sqlalchemy.orm import Query

T = TypeVar('T')

class PaginationParams(BaseModel):
    """Standard pagination parameters"""
    page: int = 1  # Page number (1-indexed)
    items_per_page: int = 50  # Items per page
    
    @property
    def skip(self) -> int:
        """Calculate skip/offset value"""
        return (self.page - 1) * self.items_per_page
    
    @property
    def limit(self) -> int:
        """Get limit value"""
        return self.items_per_page


class PaginatedResponse(BaseModel, Generic[T]):
    """Standard paginated response"""
    items: List[T]
    total: int
    page: int
    items_per_page: int
    total_pages: int
    has_next: bool
    has_prev: bool
    
    class Config:
        from_attributes = True


def paginate(
    query: Query,
    page: int = 1,
    items_per_page: int = 50
) -> tuple[List, int, int, int, bool, bool]:
    """
    Paginate a SQLAlchemy query
    
    Args:
        query: SQLAlchemy query object
        page: Page number (1-indexed)
        items_per_page: Number of items per page
    
    Returns:
        Tuple of (items, total, page, items_per_page, has_next, has_prev)
    """
    # Ensure page is at least 1
    page = max(1, page)
    
    # Get total count
    total = query.count()
    
    # Calculate total pages
    total_pages = (total + items_per_page - 1) // items_per_page  # Ceiling division
    
    # Calculate skip/offset
    skip = (page - 1) * items_per_page
    
    # Get paginated items
    items = query.offset(skip).limit(items_per_page).all()
    
    # Check if there are more pages
    has_next = page < total_pages
    has_prev = page > 1
    
    return items, total, page, items_per_page, has_next, has_prev


def create_paginated_response(
    items: List[T],
    total: int,
    page: int,
    items_per_page: int,
    has_next: bool,
    has_prev: bool
) -> dict:
    """
    Create a standardized paginated response dictionary
    
    Args:
        items: List of items for the current page
        total: Total number of items across all pages
        page: Current page number
        items_per_page: Number of items per page
        has_next: Whether there is a next page
        has_prev: Whether there is a previous page
    
    Returns:
        Dictionary with pagination metadata
    """
    total_pages = (total + items_per_page - 1) // items_per_page
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "items_per_page": items_per_page,
        "total_pages": total_pages,
        "has_next": has_next,
        "has_prev": has_prev
    }

