from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import time
from datetime import datetime
import os

from app.database import engine, get_db, test_connection
from app import models
from app.routes import auth, courses, favorites, chat, profile, admin, teacher_codes, clerk_webhooks, uploads, notifications, upload
from app.rbac import initialize_rbac
from app.queue_service import pgmq_service

# Create database tables
try:
    models.Base.metadata.create_all(bind=engine)
    print("Database tables created successfully")
except Exception as e:
    print(f"Error creating database tables: {e}")
    # Wait and retry (useful for Docker startup)
    time.sleep(2)
    try:
        models.Base.metadata.create_all(bind=engine)
        print("Database tables created on retry")
    except Exception as e2:
        print(f"Failed to create database tables after retry: {e2}")

app = FastAPI(
    title="REGOD API",
    version="1.0.0",
    description="A comprehensive learning platform backend with Clerk authentication",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*", 
    ],
    allow_credentials=True,  # Allow credentials for authenticated requests
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Mount static files for uploads
upload_dir = os.getenv("LOCAL_UPLOAD_DIR", os.path.join(os.getcwd(), "uploads"))
os.makedirs(upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

# Initialize RBAC system on startup
@app.on_event("startup")
async def startup_event():
    db = next(get_db())
    try:
        initialize_rbac(db)
        print("RBAC system initialized successfully")
        
        # Test database connection
        if test_connection():
            print("Database connection: OK")
        else:
            print("Database connection: FAILED")
        
        # Initialize PGMQ service
        await pgmq_service.initialize()
        await pgmq_service.start_workers()
        print("PGMQ service initialized successfully")
            
    except Exception as e:
        print(f"Error initializing services: {e}")
    finally:
        db.close()

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    db_status = "healthy" if test_connection() else "unhealthy"
    return {
        "status": "ok",
        "database": db_status,
        "timestamp": datetime.utcnow().isoformat(),
        "service": "regod-backend"
    }

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(courses.router, prefix="/api", tags=["Courses"])
app.include_router(favorites.router, prefix="/api/user", tags=["Favorites"])
app.include_router(chat.router, prefix="/api/connect", tags=["Connect"])
app.include_router(profile.router, prefix="/api/user", tags=["Profile"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(teacher_codes.router, prefix="/api", tags=["Teacher Codes"])
app.include_router(clerk_webhooks.router, prefix="/api", tags=["Clerk Webhooks"])
app.include_router(uploads.router, prefix="/api", tags=["Uploads"])
app.include_router(upload.router, prefix="/api/upload", tags=["File Upload"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])

@app.get("/")
async def root():
    return {
        "message": "Welcome to REGOD API",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/api/init")
async def initialize_app(db: Session = Depends(get_db)):
    return {
        "show_onboarding": True,
        "app_version": "1.0.0",
        "maintenance_mode": False,
        "database_connected": test_connection()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        reload=True if os.getenv("ENVIRONMENT") == "development" else False
    )