-- Create additional databases if needed
CREATE DATABASE regod_test;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgmq";

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE regod_db TO regod_user;
GRANT ALL PRIVILEGES ON DATABASE regod_test TO regod_user;

-- Create PGMQ queues for chat notifications
SELECT pgmq.create('chat_notifications');
SELECT pgmq.create('message_delivery');