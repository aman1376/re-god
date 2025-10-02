import asyncio
import json
import logging
from typing import Dict, Any, Optional
import asyncpg
from .database import get_db_pool

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
        self.db_pool = get_db_pool()
        logger.info("PGMQ Service initialized")

    async def send_chat_notification(self, user_id: str, message_data: Dict[str, Any]):
        """Send a chat notification to PGMQ queue"""
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
        # This could trigger push notifications, email alerts, etc.
        user_id = data['user_id']
        message_data = data['data']
        
        logger.info(f"Processing chat notification for user {user_id}: {message_data}")
        
        # Here you could integrate with:
        # - Push notification services (FCM, APNS)
        # - Email services
        # - SMS services
        # - Other notification channels

    async def process_message_delivery(self):
        """Process message delivery confirmations"""
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
