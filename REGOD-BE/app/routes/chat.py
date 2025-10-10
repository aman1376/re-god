from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import List
import json
import uuid
from datetime import datetime

from app.database import get_db, get_db_pool
from app.models import User, ChatThread, ChatMessage, TeacherAssignment
from app.schemas import ThreadResponse, MessageResponse, MessageBase
from app.utils.auth import get_current_user
from app.rbac import require_permission
from app.realtime import manager
from app.queue_service import pgmq_service

router = APIRouter()

# Store active WebSocket connections
active_connections = {}

@router.get("/thread", response_model=ThreadResponse)
async def get_or_create_thread(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get or create a chat thread for the current user"""
    user_uuid = uuid.UUID(current_user["id"])
    
    if current_user.get("role") == "student":
        # For students, find existing thread or create a new one
        thread = db.query(ChatThread).filter(
            ChatThread.user_id == user_uuid
        ).first()
        
        if not thread:
            # For students, find their assigned teacher
            teacher_id = None
            access = db.query(TeacherAssignment).filter(
                TeacherAssignment.student_id == user_uuid,
                TeacherAssignment.active == True
            ).first()
            
            if access:
                teacher_id = access.teacher_id
            
            # Create a new thread
            thread = ChatThread(
                user_id=user_uuid,
                assigned_teacher_id=teacher_id
            )
            db.add(thread)
            db.commit()
            db.refresh(thread)
    else:
        # For teachers/admins, get the first thread where they are assigned as teacher
        thread = db.query(ChatThread).filter(
            ChatThread.assigned_teacher_id == user_uuid
        ).first()
        
        if not thread:
            # Teachers don't create threads - they are assigned to existing student threads
            raise HTTPException(
                status_code=404, 
                detail="No chat thread found. Students need to initiate conversations."
            )
    
    # Get recipient info based on user role
    recipient_name = None
    recipient_avatar = None
    is_online = False
    
    if current_user.get("role") == "student":
        # For students, show teacher info as recipient
        if thread.assigned_teacher_id:
            teacher = db.query(User).filter(User.id == thread.assigned_teacher_id).first()
            if teacher:
                recipient_name = teacher.name
                recipient_avatar = teacher.avatar_url
                is_online = str(thread.assigned_teacher_id) in active_connections
    else:
        # For teachers, show student info as recipient
        student = db.query(User).filter(User.id == thread.user_id).first()
        if student:
            recipient_name = student.name
            recipient_avatar = student.avatar_url
            is_online = str(thread.user_id) in active_connections
    
    # Get unread message count (messages not sent by current user)
    unread_count = db.query(ChatMessage).filter(
        ChatMessage.thread_id == thread.id,
        ChatMessage.sender_id != user_uuid,
        ChatMessage.read_status == False
    ).count()
    
    # Get the most recent message
    recent_message = db.query(ChatMessage).filter(
        ChatMessage.thread_id == thread.id
    ).order_by(ChatMessage.timestamp.desc()).first()
    
    last_message_content = None
    last_message_time = None
    if recent_message:
        last_message_content = recent_message.content
        last_message_time = recent_message.timestamp.isoformat()
    
    return ThreadResponse(
        id=thread.id,
        user_id=str(thread.user_id),
        assigned_teacher_id=str(thread.assigned_teacher_id) if thread.assigned_teacher_id else None,
        recipient_name=recipient_name,
        recipient_avatar=recipient_avatar,
        is_online=is_online,
        unread_count=unread_count,
        created_at=thread.created_at,
        last_message=last_message_content,
        last_message_time=last_message_time
    )

@router.get("/students")
async def get_assigned_students(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all students assigned to this teacher/admin"""
    # Check if user is teacher or admin
    if current_user.get("role") not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    teacher_uuid = uuid.UUID(current_user["id"])
    
    # Get all threads where this user is the assigned teacher
    threads = db.query(ChatThread).filter(
        ChatThread.assigned_teacher_id == teacher_uuid
    ).all()
    
    students = []
    for thread in threads:
        # Get student info
        student = db.query(User).filter(User.id == thread.user_id).first()
        if not student:
            continue
            
        # Get the most recent message
        recent_message = db.query(ChatMessage).filter(
            ChatMessage.thread_id == thread.id
        ).order_by(ChatMessage.timestamp.desc()).first()
        
        last_message_content = None
        last_message_time = None
        if recent_message:
            last_message_content = recent_message.content
            last_message_time = recent_message.timestamp.isoformat()
        
        # Check if student is online (has active WebSocket connection)
        is_online = str(thread.user_id) in active_connections
        
        # Get unread message count (messages sent by student that teacher hasn't read)
        unread_count = db.query(ChatMessage).filter(
            ChatMessage.thread_id == thread.id,
            ChatMessage.sender_id == thread.user_id,  # Messages from student
            ChatMessage.read_status == False
        ).count()
        
        students.append({
            "id": str(student.id),
            "name": student.name,
            "avatar_url": student.avatar_url,
            "is_online": is_online,
            "last_message": last_message_content,
            "last_message_time": last_message_time,
            "thread_id": thread.id,
            "unread_count": unread_count
        })
    
    return students

@router.get("/thread/messages", response_model=List[MessageResponse])
async def get_message_history(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
    before: str = None,  # timestamp for pagination
    thread_id: int = None  # specific thread ID to get messages from
):
    """Get message history for the user's chat thread"""
    user_uuid = uuid.UUID(current_user["id"])
    
    # For students, find thread where they are the user
    # For teachers, find threads where they are the assigned teacher
    if current_user.get("role") == "student":
        thread = db.query(ChatThread).filter(
            ChatThread.user_id == user_uuid
        ).first()
    else:
        # For teachers/admins, get specific thread if thread_id provided, otherwise first thread
        if thread_id:
            thread = db.query(ChatThread).filter(
                ChatThread.id == thread_id,
                ChatThread.assigned_teacher_id == user_uuid
            ).first()
        else:
            # Fallback to first thread if no thread_id provided
            thread = db.query(ChatThread).filter(
                ChatThread.assigned_teacher_id == user_uuid
            ).first()
    
    if not thread:
        return []
    
    # Build query
    query = db.query(ChatMessage).filter(
        ChatMessage.thread_id == thread.id
    ).order_by(ChatMessage.timestamp.asc())
    
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
        if message.sender_id != user_uuid and not message.read_status:
            message.read_status = True
    db.commit()
    
    # Prepare response
    response = []
    for msg in messages:  # Return in chronological order (already ordered by timestamp.asc())
        sender = db.query(User).filter(User.id == msg.sender_id).first()
        response.append(MessageResponse(
            id=msg.id,
            thread_id=msg.thread_id,
            sender_id=str(msg.sender_id),
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
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send a message in the chat thread"""
    user_uuid = uuid.UUID(current_user["id"])
    
    if current_user.get("role") == "student":
        # For students, find their thread
        thread = db.query(ChatThread).filter(
            ChatThread.user_id == user_uuid
        ).first()
        
        if not thread:
            # Create a thread if it doesn't exist
            thread = ChatThread(user_id=user_uuid)
            db.add(thread)
            db.commit()
            db.refresh(thread)
    else:
        # For teachers, use the specific thread_id from the request if provided
        if message_data.thread_id:
            thread = db.query(ChatThread).filter(
                ChatThread.id == message_data.thread_id,
                ChatThread.assigned_teacher_id == user_uuid
            ).first()
        else:
            # Fallback to first thread if no thread_id provided
            thread = db.query(ChatThread).filter(
                ChatThread.assigned_teacher_id == user_uuid
            ).first()
        
        if not thread:
            raise HTTPException(
                status_code=404,
                detail="No chat thread found. Students need to initiate conversations."
            )
    
    # Create new message
    sender_type = "user" if current_user.get("role") == "student" else "teacher"
    new_message = ChatMessage(
        thread_id=thread.id,
        sender_id=user_uuid,
        sender_type=sender_type,
        content=message_data.content,
        message_type=message_data.message_type
    )
    
    db.add(new_message)
    db.commit()
    db.refresh(new_message)
    
    # Send WebSocket notification for real-time updates
    try:
        if current_user.get("role") == "student":
            # Student sent message - notify teacher
            if thread.assigned_teacher_id and str(thread.assigned_teacher_id) in active_connections:
                teacher_ws = active_connections[str(thread.assigned_teacher_id)]
                await teacher_ws.send_text(json.dumps({
                    'type': 'new_message',
                    'message': {
                        'id': str(new_message.id),
                        'content': new_message.content,
                        'sender_id': str(new_message.sender_id),
                        'sender_name': current_user.get("name", "User"),
                        'timestamp': new_message.timestamp.isoformat(),
                        'message_type': new_message.message_type
                    },
                    'thread_id': thread.id
                }))
        else:
            # Teacher sent message - notify student
            if str(thread.user_id) in active_connections:
                student_ws = active_connections[str(thread.user_id)]
                await student_ws.send_text(json.dumps({
                    'type': 'new_message',
                    'message': {
                        'id': str(new_message.id),
                        'content': new_message.content,
                        'sender_id': str(new_message.sender_id),
                        'sender_name': current_user.get("name", "User"),
                        'timestamp': new_message.timestamp.isoformat(),
                        'message_type': new_message.message_type
                    },
                    'thread_id': thread.id
                }))
    except Exception as e:
        print(f"Error sending WebSocket notification: {e}")
    
    # Send PGMQ notification for offline users
    try:
        # Determine recipient ID
        if current_user.get("role") == "student":
            recipient_id = str(thread.assigned_teacher_id)
        else:
            recipient_id = str(thread.user_id)
        
        # Send notification if recipient is not online
        if recipient_id not in active_connections:
            await pgmq_service.send_chat_notification(recipient_id, {
                'sender_name': current_user.get("name", "Unknown"),
                'content': new_message.content,
                'thread_id': thread.id,
                'timestamp': new_message.timestamp.isoformat()
            })
    except Exception as e:
        print(f"Error sending PGMQ notification: {e}")
    
    return MessageResponse(
        id=new_message.id,
        thread_id=new_message.thread_id,
        sender_id=str(new_message.sender_id),
        sender_name=current_user.get("name", "User"),
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
    print(f"[WebSocket] Connection attempt with token: {token[:50]}...")
    try:
        # Authenticate user
        user = await get_current_user_from_token(token, db)
        print(f"[WebSocket] Authentication successful for user: {user.id}")
        
        await websocket.accept()
        print(f"[WebSocket] Connection accepted for user: {user.id}")
        active_connections[str(user.id)] = websocket
        
        try:
            while True:
                data = await websocket.receive_text()
                try:
                    message_data = json.loads(data)
                except json.JSONDecodeError as json_error:
                    print(f"[WebSocket] Invalid JSON received: {data}, error: {json_error}")
                    continue
                
                # Handle different message types
                if message_data.get("type") == "typing":
                    # Broadcast typing indicator
                    pass
                    
        except WebSocketDisconnect:
            # Safely remove connection if it exists
            user_id_str = str(user.id)
            if user_id_str in active_connections:
                del active_connections[user_id_str]
                print(f"[WebSocket] Removed connection for user: {user_id_str}")
            
    except Exception as e:
        print(f"[WebSocket] Error: {type(e).__name__}: {str(e)}")
        import traceback
        print(f"[WebSocket] Traceback: {traceback.format_exc()}")
        
        # Clean up connection if user was authenticated
        if 'user' in locals():
            user_id_str = str(user.id)
            if user_id_str in active_connections:
                del active_connections[user_id_str]
                print(f"[WebSocket] Removed connection for user: {user_id_str} (exception cleanup)")
        
        try:
            await websocket.close()
        except:
            pass

async def get_current_user_from_token(token: str, db: Session):
    """Helper function to get user from token for WebSocket"""
    from app.utils.auth import verify_token, verify_clerk_jwt
    import uuid
    
    try:
        # Try to verify as regular JWT first
        try:
            payload = verify_token(token)
        except:
            # Fall back to Clerk JWT
            payload = verify_clerk_jwt(token)
        
        # Extract user ID from token
        user_id = payload.get("sub") or payload.get("user_id")
        if not user_id:
            raise WebSocketDisconnect(1008, "Invalid token: no user ID")
        
        # Convert to UUID and fetch user
        user_uuid = uuid.UUID(user_id)
        user = db.query(User).filter(User.id == user_uuid).first()
        
        if not user:
            raise WebSocketDisconnect(1008, "User not found")
        
        return user
        
    except WebSocketDisconnect:
        raise
    except Exception as e:
        print(f"WebSocket authentication error: {e}")
        raise WebSocketDisconnect(1008, "Authentication failed")