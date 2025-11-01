-- Create extensions (pgmq includes necessary dependencies)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgmq" CASCADE;

-- Create PGMQ queues for chat notifications
SELECT pgmq.create('chat_notifications');
SELECT pgmq.create('message_delivery');

-- Ensure expo_push_token column exists in users table
-- This will be created by the main schema, but we add it here for safety
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'expo_push_token'
    ) THEN
        ALTER TABLE users ADD COLUMN expo_push_token TEXT;
    END IF;
END $$;