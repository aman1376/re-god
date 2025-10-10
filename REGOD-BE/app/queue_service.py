import asyncio
import json
import logging
from typing import Dict, Any, Optional
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

class PGMQService:
    def __init__(self):
        self.db_pool = None
        self.queues = {
            'chat_notifications': 'chat_notifications',
            'message_delivery': 'message_delivery'
        }

    async def initialize(self):
        """Initialize PGMQ service with database connection"""
        try:
            # Create async database pool
            database_url = os.getenv("DATABASE_URL")
            if not database_url:
                logger.error("DATABASE_URL not found in environment")
                return
            
            # Ensure the URL is in the correct format for asyncpg
            if database_url.startswith("postgresql://"):
                db_url = database_url
            else:
                logger.error(f"Invalid database URL format: {database_url}")
                return
            
            self.db_pool = await asyncpg.create_pool(
                db_url,
                min_size=2,
                max_size=10,
                command_timeout=60
            )
            logger.info("PGMQ Service initialized with database pool")
        except Exception as e:
            logger.error(f"Failed to initialize PGMQ service: {e}")
            self.db_pool = None

    async def send_chat_notification(self, user_id: str, message_data: Dict[str, Any]):
        """Send a chat notification to PGMQ queue"""
        if not self.db_pool:
            logger.warning("PGMQ service not initialized, skipping notification")
            return
        
        try:
            async with self.db_pool.acquire() as conn:
                # Send notification to chat_notifications queue
                await conn.execute(
                    "SELECT pgmq.send($1, $2)",
                    self.queues['chat_notifications'],
                    json.dumps({
                        'user_id': user_id,
                        'type': 'chat_notification',
                        'data': message_data,
                        'timestamp': message_data.get('timestamp')
                    })
                )
                logger.info(f"Chat notification queued for user {user_id}")
        except Exception as e:
            logger.error(f"Error sending chat notification: {e}")

    async def send_message_delivery_notification(self, thread_id: int, message_id: str, recipient_id: str):
        """Send message delivery notification"""
        if not self.db_pool:
            logger.warning("PGMQ service not initialized, skipping delivery notification")
            return
        
        try:
            async with self.db_pool.acquire() as conn:
                await conn.execute(
                    "SELECT pgmq.send($1, $2)",
                    self.queues['message_delivery'],
                    json.dumps({
                        'thread_id': thread_id,
                        'message_id': message_id,
                        'recipient_id': recipient_id,
                        'type': 'message_delivery',
                        'status': 'delivered'
                    })
                )
                logger.info(f"Message delivery notification queued for thread {thread_id}")
        except Exception as e:
            logger.error(f"Error sending delivery notification: {e}")

    async def process_chat_notifications(self):
        """Process chat notifications from the queue"""
        if not self.db_pool:
            return
        
        try:
            async with self.db_pool.acquire() as conn:
                # Read messages from chat_notifications queue
                messages = await conn.fetch(
                    "SELECT * FROM pgmq.read($1, 10, 5)",
                    self.queues['chat_notifications']
                )
                
                for msg in messages:
                    try:
                        data = json.loads(msg['message'])
                        user_id = data['user_id']
                        notification_type = data['type']
                        
                        if notification_type == 'chat_notification':
                            # Process chat notification
                            await self._process_chat_notification(data)
                        
                        # Delete processed message
                        await conn.execute(
                            "SELECT pgmq.delete($1, $2)",
                            self.queues['chat_notifications'],
                            msg['msg_id']
                        )
                        
                    except Exception as e:
                        logger.error(f"Error processing notification message: {e}")
                        
        except Exception as e:
            logger.error(f"Error processing chat notifications: {e}")

    async def _process_chat_notification(self, data: Dict[str, Any]):
        """Process individual chat notification"""
        try:
            user_id = data['user_id']
            message_data = data['data']
            
            logger.info(f"Processing chat notification for user {user_id}: {message_data}")
            
            # Get user's push tokens from database
            async with self.db_pool.acquire() as conn:
                user_tokens = await conn.fetch(
                    "SELECT expo_push_token FROM users WHERE id = $1 AND expo_push_token IS NOT NULL",
                    user_id
                )
                
                if user_tokens:
                    # Send push notification via Expo
                    await self._send_expo_push_notification(
                        user_tokens[0]['expo_push_token'],
                        message_data
                    )
                else:
                    logger.info(f"No push token found for user {user_id}")
            
        except Exception as e:
            logger.error(f"Error processing chat notification: {e}")

    async def _send_expo_push_notification(self, expo_push_token: str, message_data: Dict[str, Any]):
        """Send push notification via Expo Push Service"""
        try:
            import requests
            
            payload = {
                'to': expo_push_token,
                'title': f"New message from {message_data.get('sender_name', 'Someone')}",
                'body': message_data.get('content', 'You have a new message'),
                'data': {
                    'type': 'chat',
                    'thread_id': message_data.get('thread_id'),
                    'sender_name': message_data.get('sender_name'),
                    'timestamp': message_data.get('timestamp')
                },
                'sound': 'default',
                'badge': 1,
                'channelId': 'chat-messages'
            }
            
            response = requests.post(
                'https://exp.host/--/api/v2/push/send',
                headers={
                    'Accept': 'application/json',
                    'Accept-encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                json=payload
            )
            
            if response.status_code == 200:
                logger.info(f"Push notification sent successfully to {expo_push_token}")
            else:
                logger.error(f"Failed to send push notification: {response.text}")
                
        except Exception as e:
            logger.error(f"Error sending Expo push notification: {e}")

    async def process_message_delivery(self):
        """Process message delivery confirmations"""
        if not self.db_pool:
            return
        
        try:
            async with self.db_pool.acquire() as conn:
                messages = await conn.fetch(
                    "SELECT * FROM pgmq.read($1, 10, 5)",
                    self.queues['message_delivery']
                )
                
                for msg in messages:
                    try:
                        data = json.loads(msg['message'])
                        thread_id = data['thread_id']
                        message_id = data['message_id']
                        recipient_id = data['recipient_id']
                        
                        # Update message delivery status in database
                        await conn.execute(
                            """
                            UPDATE chat_messages 
                            SET delivery_status = 'delivered', delivered_at = NOW()
                            WHERE id = $1 AND recipient_id = $2
                            """,
                            message_id, recipient_id
                        )
                        
                        # Delete processed message
                        await conn.execute(
                            "SELECT pgmq.delete($1, $2)",
                            self.queues['message_delivery'],
                            msg['msg_id']
                        )
                        
                        logger.info(f"Message {message_id} marked as delivered to {recipient_id}")
                        
                    except Exception as e:
                        logger.error(f"Error processing delivery message: {e}")
                        
        except Exception as e:
            logger.error(f"Error processing message delivery: {e}")

    async def start_workers(self):
        """Start background workers for processing queues"""
        async def worker_loop():
            while True:
                try:
                    await self.process_chat_notifications()
                    await self.process_message_delivery()
                    await asyncio.sleep(1)  # Process every second
                except Exception as e:
                    logger.error(f"Error in worker loop: {e}")
                    await asyncio.sleep(5)  # Wait before retrying
        
        # Start workers in background
        asyncio.create_task(worker_loop())
        logger.info("PGMQ workers started")

# Global PGMQ service instance
pgmq_service = PGMQService()

async def get_pgmq_service():
    return pgmq_service
