import asyncio
import json
import logging
from typing import Dict, Set, Any
from fastapi import WebSocket, WebSocketDisconnect
import asyncpg
from .database import get_db_pool

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # Store active WebSocket connections by user_id
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # Store user_id by WebSocket for cleanup
        self.websocket_to_user: Dict[WebSocket, str] = {}
        # Database connection for listening to notifications
        self.db_connection = None
        self.notification_task = None

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        
        self.active_connections[user_id].add(websocket)
        self.websocket_to_user[websocket] = user_id
        
        logger.info(f"User {user_id} connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.websocket_to_user:
            user_id = self.websocket_to_user[websocket]
            
            if user_id in self.active_connections:
                self.active_connections[user_id].discard(websocket)
                
                # Remove user entry if no more connections
                if not self.active_connections[user_id]:
                    del self.active_connections[user_id]
            
            del self.websocket_to_user[websocket]
            logger.info(f"User {user_id} disconnected. Total connections: {len(self.active_connections)}")

    async def send_personal_message(self, message: str, user_id: str):
        if user_id in self.active_connections:
            dead_connections = set()
            for websocket in self.active_connections[user_id]:
                try:
                    await websocket.send_text(message)
                except Exception as e:
                    logger.error(f"Error sending message to user {user_id}: {e}")
                    dead_connections.add(websocket)
            
            # Clean up dead connections
            for websocket in dead_connections:
                self.disconnect(websocket)

    async def broadcast_to_thread(self, message: str, thread_id: int, exclude_user: str = None):
        """Broadcast message to all users in a chat thread"""
        # Get all users in the thread
        db_pool = get_db_pool()
        async with db_pool.acquire() as conn:
            users = await conn.fetch(
                """
                SELECT DISTINCT user_id, assigned_teacher_id 
                FROM chat_threads 
                WHERE id = $1
                """,
                thread_id
            )
            
            for user in users:
                user_id = str(user['user_id'])
                teacher_id = str(user['assigned_teacher_id'])
                
                # Send to both student and teacher (excluding sender)
                for target_user in [user_id, teacher_id]:
                    if target_user and target_user != exclude_user:
                        await self.send_personal_message(message, target_user)

    async def start_notification_listener(self):
        """Start listening to PostgreSQL notifications"""
        try:
            db_pool = get_db_pool()
            self.db_connection = await db_pool.acquire()
            
            # Listen to chat message notifications
            await self.db_connection.add_listener('chat_message_notification', self.handle_chat_notification)
            
            logger.info("Started PostgreSQL notification listener")
            
        except Exception as e:
            logger.error(f"Error starting notification listener: {e}")

    async def handle_chat_notification(self, connection, pid, channel, payload):
        """Handle PostgreSQL NOTIFY for chat messages"""
        try:
            data = json.loads(payload)
            thread_id = data.get('thread_id')
            message_data = data.get('message')
            sender_id = data.get('sender_id')
            
            # Broadcast to all users in the thread
            await self.broadcast_to_thread(
                json.dumps({
                    'type': 'new_message',
                    'thread_id': thread_id,
                    'message': message_data,
                    'sender_id': sender_id
                }),
                thread_id,
                exclude_user=sender_id
            )
            
        except Exception as e:
            logger.error(f"Error handling chat notification: {e}")

    async def stop_notification_listener(self):
        """Stop the notification listener and cleanup"""
        if self.db_connection:
            await self.db_connection.remove_listener('chat_message_notification', self.handle_chat_notification)
            await self.db_connection.close()
            self.db_connection = None
            logger.info("Stopped PostgreSQL notification listener")

# Global connection manager instance
manager = ConnectionManager()

async def get_connection_manager():
    return manager

