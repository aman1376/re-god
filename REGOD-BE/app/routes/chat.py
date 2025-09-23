from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import List
import json
from datetime import datetime

from app.database import get_db
from app.models import User, ChatThread, ChatMessage, StudentTeacherAccess
from app.schemas import ThreadResponse, MessageResponse, MessageBase
from app.utils.auth import get_current_user
from app.rbac import require_permission

router = APIRouter()

# Store active WebSocket connections
active_connections = {}

@router.get("/thread", response_model=ThreadResponse)
async def get_or_create_thread(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get or create a chat thread for the current user"""
    # Find existing thread or create a new one
    thread = db.query(ChatThread).filter(
        ChatThread.user_id == current_user.id
    ).first()
    
    if not thread:
        # For students, find their assigned teacher
        teacher_id = None
        if current_user.has_role("student"):
            access = db.query(StudentTeacherAccess).filter(
                StudentTeacherAccess.student_id == current_user.id,
                StudentTeacherAccess.is_active == True
            ).first()
            
            if access:
                teacher_id = access.teacher_id
        
        # Create a new thread
        thread = ChatThread(
            user_id=current_user.id,
            assigned_teacher_id=teacher_id
        )
        db.add(thread)
        db.commit()
        db.refresh(thread)
    
    # Get teacher info if assigned
    teacher_name = None
    teacher_avatar = None
    is_online = False
    
    if thread.assigned_teacher_id:
        teacher = db.query(User).filter(User.id == thread.assigned_teacher_id).first()
        if teacher:
            teacher_name = teacher.name
            teacher_avatar = teacher.avatar_url
            is_online = thread.assigned_teacher_id in active_connections
    
    # Get unread message count
    unread_count = db.query(ChatMessage).filter(
        ChatMessage.thread_id == thread.id,
        ChatMessage.sender_id != current_user.id,
        ChatMessage.read_status == False
    ).count()
    
    return ThreadResponse(
        id=thread.id,
        user_id=thread.user_id,
        assigned_teacher_id=thread.assigned_teacher_id,
        recipient_name=teacher_name,
        recipient_avatar=teacher_avatar,
        is_online=is_online,
        unread_count=unread_count,
        created_at=thread.created_at
    )

@router.get("/thread/messages", response_model=List[MessageResponse])
async def get_message_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    before: str = None  # timestamp for pagination
):
    """Get message history for the user's chat thread"""
    # Get user's thread
    thread = db.query(ChatThread).filter(
        ChatThread.user_id == current_user.id
    ).first()
    
    if not thread:
        return []
    
    # Build query
    query = db.query(ChatMessage).filter(
        ChatMessage.thread_id == thread.id
    ).order_by(ChatMessage.timestamp.desc())
    
    # Apply pagination if before timestamp provided
    if before:
        try:
            before_date = datetime.fromisoformat(before.replace('Z', '+00:00'))
            query = query.filter(ChatMessage.timestamp < before_date)
        except ValueError:
            pass
    
    messages = query.limit(50).all()
    
    # Mark messages as read
    for message in messages:
        if message.sender_id != current_user.id and not message.read_status:
            message.read_status = True
    db.commit()
    
    # Prepare response
    response = []
    for msg in reversed(messages):  # Return in chronological order
        sender = db.query(User).filter(User.id == msg.sender_id).first()
        response.append(MessageResponse(
            id=msg.id,
            thread_id=msg.thread_id,
            sender_id=msg.sender_id,
            sender_name=sender.name if sender else "Unknown",
            sender_type=msg.sender_type,
            content=msg.content,
            message_type=msg.message_type,
            timestamp=msg.timestamp,
            read_status=msg.read_status
        ))
    
    return response

@router.post("/thread/messages", response_model=MessageResponse)
async def send_message(
    message_data: MessageBase,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send a message in the chat thread"""
    # Get user's thread
    thread = db.query(ChatThread).filter(
        ChatThread.user_id == current_user.id
    ).first()
    
    if not thread:
        # Create a thread if it doesn't exist
        thread = ChatThread(user_id=current_user.id)
        db.add(thread)
        db.commit()
        db.refresh(thread)
    
    # Create new message
    new_message = ChatMessage(
        thread_id=thread.id,
        sender_id=current_user.id,
        sender_type="user",
        content=message_data.content,
        message_type=message_data.message_type
    )
    
    db.add(new_message)
    db.commit()
    db.refresh(new_message)
    
    # Notify teacher if connected via WebSocket
    if thread.assigned_teacher_id and thread.assigned_teacher_id in active_connections:
        teacher_ws = active_connections[thread.assigned_teacher_id]
        await teacher_ws.send_text(json.dumps({
            "type": "new_message",
            "thread_id": thread.id,
            "message": {
                "id": new_message.id,
                "content": new_message.content,
                "sender_id": new_message.sender_id,
                "sender_name": current_user.name,
                "timestamp": new_message.timestamp.isoformat()
            }
        }))
    
    return MessageResponse(
        id=new_message.id,
        thread_id=new_message.thread_id,
        sender_id=new_message.sender_id,
        sender_name=current_user.name,
        sender_type=new_message.sender_type,
        content=new_message.content,
        message_type=new_message.message_type,
        timestamp=new_message.timestamp,
        read_status=new_message.read_status
    )

@router.websocket("/socket")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str,
    db: Session = Depends(get_db)
):
    """WebSocket endpoint for real-time chat"""
    try:
        # Authenticate user
        from app.utils.auth import get_current_user_from_token
        user = await get_current_user_from_token(token, db)
        
        await websocket.accept()
        active_connections[user.id] = websocket
        
        try:
            while True:
                data = await websocket.receive_text()
                message_data = json.loads(data)
                
                # Handle different message types
                if message_data.get("type") == "typing":
                    # Broadcast typing indicator
                    pass
                    
        except WebSocketDisconnect:
            del active_connections[user.id]
            
    except Exception as e:
        await websocket.close()
        print(f"WebSocket error: {e}")

async def get_current_user_from_token(token: str, db: Session):
    """Helper function to get user from token for WebSocket"""
    from app.utils.auth import get_current_user
    from fastapi import Header
    # Simplified implementation - in production, use proper JWT verification
    try:
        # This would normally verify the JWT token
        user = db.query(User).filter(User.id == 1).first()  # Placeholder
        return user
    except:
        raise WebSocketDisconnect(1008, "Authentication failed")