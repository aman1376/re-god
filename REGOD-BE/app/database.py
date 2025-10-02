from sqlalchemy import create_engine,text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
import asyncpg
from dotenv import load_dotenv

load_dotenv()

# Use different database URLs for different environments
if os.getenv("ENVIRONMENT") == "test":
    SQLALCHEMY_DATABASE_URL = os.getenv("TEST_DATABASE_URL")
else:
    SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

# Pool configuration for better performance
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_size=20,
    max_overflow=30,
    pool_timeout=30,
    pool_recycle=1800,  # Recycle connections after 30 minutes
    pool_pre_ping=True,  # Enable connection health checks
    echo=bool(os.getenv("DEBUG", False))  # Echo SQL queries in debug mode
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    """
    Dependency function to get database session.
    Use this in your route dependencies.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_connection():
    """Test database connection"""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        print(f"Database connection error: {e}")
        return False

# Async database pool for real-time features
db_pool = None

async def create_db_pool():
    """Create async database connection pool"""
    global db_pool
    if db_pool is None:
        # Convert SQLAlchemy URL to asyncpg format
        db_url = SQLALCHEMY_DATABASE_URL.replace("postgresql://", "postgresql://")
        db_pool = await asyncpg.create_pool(
            db_url,
            min_size=5,
            max_size=20,
            command_timeout=60
        )
    return db_pool

def get_db_pool():
    """Get the database pool (synchronous access)"""
    global db_pool
    return db_pool