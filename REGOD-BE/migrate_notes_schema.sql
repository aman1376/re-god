-- Migration script to update user_notes table schema
-- This script removes course_id and lesson_id columns and adds title column

-- First, add the new title column
ALTER TABLE user_notes ADD COLUMN title VARCHAR(255);

-- Update existing notes to have a default title based on their content
UPDATE user_notes 
SET title = CASE 
  WHEN LENGTH(note_content) > 50 THEN LEFT(note_content, 47) || '...'
  ELSE note_content
END
WHERE title IS NULL;

-- Rename note_content to content
ALTER TABLE user_notes RENAME COLUMN note_content TO content;

-- Drop the foreign key constraints and columns
ALTER TABLE user_notes DROP CONSTRAINT IF EXISTS user_notes_course_id_fkey;
ALTER TABLE user_notes DROP CONSTRAINT IF EXISTS user_notes_lesson_id_fkey;
ALTER TABLE user_notes DROP COLUMN IF EXISTS course_id;
ALTER TABLE user_notes DROP COLUMN IF EXISTS lesson_id;

-- Make content column NOT NULL
ALTER TABLE user_notes ALTER COLUMN content SET NOT NULL;

-- Add index on user_id for better performance
CREATE INDEX IF NOT EXISTS idx_user_notes_user_id ON user_notes(user_id);

-- Add index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_user_notes_created_at ON user_notes(created_at DESC);




