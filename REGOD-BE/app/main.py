from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import time
import asyncio
import logging
import os
from datetime import datetime

from app.database import engine, get_db, test_connection, create_db_pool
from app import models
from app.routes import auth, courses, favorites, chat, profile, admin, teacher_codes, clerk_webhooks, uploads
from app.rbac import initialize_rbac
from app.realtime import manager
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
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=False,  # Cannot be True when using wildcard origins
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for uploads
upload_dir = os.getenv("LOCAL_UPLOAD_DIR", os.path.join(os.getcwd(), "uploads"))
if os.path.exists(upload_dir):
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
        
        # Initialize database pool
        await create_db_pool()
        print("Database pool created")
        
        # Initialize real-time services
        await pgmq_service.initialize()
        await manager.start_notification_listener()
        await pgmq_service.start_workers()
        print("Real-time services initialized successfully")
            
    except Exception as e:
        print(f"Error initializing services: {e}")
    finally:
        db.close()

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    try:
        await manager.stop_notification_listener()
        print("Real-time services stopped")
    except Exception as e:
        print(f"Error during shutdown: {e}")

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

# Simple test WebSocket endpoint (no dependencies)
@app.websocket("/test-ws")
async def test_websocket_simple(websocket: WebSocket):
    print("[TEST-WS] Connection attempt")
    await websocket.accept()
    print("[TEST-WS] Connection accepted")
    try:
        await websocket.send_text("Hello from server!")
        while True:
            data = await websocket.receive_text()
            print(f"[TEST-WS] Received: {data}")
            await websocket.send_text(f"Echo: {data}")
    except WebSocketDisconnect:
        print("[TEST-WS] Disconnected")
    except Exception as e:
        print(f"[TEST-WS] Error: {e}")

# WebSocket endpoint for real-time chat
@app.websocket("/api/ws/chat/{user_id}")
async def websocket_chat_endpoint(websocket: WebSocket, user_id: str):
    """
    WebSocket endpoint for real-time chat communication.
    Handles bidirectional messaging and real-time notifications.
    """
    print(f"[WebSocket] Connection attempt for user: {user_id}")
    
    try:
        # Accept the WebSocket connection
        await websocket.accept()
        print(f"[WebSocket] Connection accepted for user: {user_id}")
        
        # Register with connection manager (without re-accepting)
        if user_id not in manager.active_connections:
            manager.active_connections[user_id] = set()
        manager.active_connections[user_id].add(websocket)
        manager.websocket_to_user[websocket] = user_id
        
        print(f"[WebSocket] User {user_id} registered. Total connections: {len(manager.active_connections)}")
        
        # Send welcome message
        await websocket.send_json({
            "type": "connected",
            "message": f"Connected to chat as {user_id}",
            "timestamp": datetime.utcnow().isoformat()
        })
        
        # Listen for messages
        while True:
            data = await websocket.receive_text()
            print(f"[WebSocket] Received from {user_id}: {data}")
            
            # Acknowledge receipt
            await websocket.send_json({
                "type": "ack",
                "message": "Message received",
                "data": data,
                "timestamp": datetime.utcnow().isoformat()
            })
            
    except WebSocketDisconnect:
        print(f"[WebSocket] User {user_id} disconnected")
        manager.disconnect(websocket)
    except Exception as e:
        print(f"[WebSocket] Error for user {user_id}: {e}")
        import traceback
        traceback.print_exc()
        manager.disconnect(websocket)
        try:
            await websocket.close()
        except:
            pass

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