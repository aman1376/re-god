#!/usr/bin/env python3
"""
Simple migration script using subprocess to run SQL directly
"""
import subprocess
import os
import sys

def run_migration():
    # Database connection parameters
    DB_HOST = os.getenv('DB_HOST', 'localhost')
    DB_PORT = os.getenv('DB_PORT', '5432')
    DB_NAME = os.getenv('DB_NAME', 'regod')
    DB_USER = os.getenv('DB_USER', 'postgres')
    DB_PASSWORD = os.getenv('DB_PASSWORD', 'password')
    
    # Read migration SQL file
    with open('migrate_notes_schema.sql', 'r') as f:
        migration_sql = f.read()
    
    # Run migration using psql
    try:
        print("Running migration...")
        result = subprocess.run([
            'psql',
            f'postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}',
            '-c', migration_sql
        ], capture_output=True, text=True, check=True)
        
        print("Migration completed successfully!")
        print("Output:", result.stdout)
        
        # Verify the new schema
        verify_result = subprocess.run([
            'psql',
            f'postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}',
            '-c', """
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'user_notes' 
            ORDER BY ordinal_position;
            """
        ], capture_output=True, text=True, check=True)
        
        print("\nNew user_notes table schema:")
        print(verify_result.stdout)
        
    except subprocess.CalledProcessError as e:
        print(f"Migration failed: {e}")
        print("Error output:", e.stderr)
        sys.exit(1)
    except FileNotFoundError:
        print("psql command not found. Please install PostgreSQL client tools.")
        sys.exit(1)

if __name__ == "__main__":
    run_migration()




