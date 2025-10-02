from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.utils.auth import get_current_user
from app.rbac import require_role
import os
import uuid
from datetime import datetime, timedelta

router = APIRouter()


def _ensure_upload_dir() -> str:
    base_dir = os.getenv("LOCAL_UPLOAD_DIR", os.path.join(os.getcwd(), "uploads"))
    os.makedirs(base_dir, exist_ok=True)
    return base_dir


@router.post("/uploads/local", response_model=dict)
@require_role(["admin", "teacher"])  # Admins and teachers can upload
async def upload_local(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save file to local disk and return a public URL served from /uploads."""
    try:
        upload_dir = _ensure_upload_dir()
        safe_name = f"{uuid.uuid4().hex}_{file.filename}"
        abs_path = os.path.join(upload_dir, safe_name)
        content = await file.read()
        with open(abs_path, "wb") as f:
            f.write(content)

        public_path = f"/uploads/{safe_name}"
        return {
            "path": public_path,
            "filename": file.filename,
            "size": len(content),
            "content_type": file.content_type,
            "uploaded_at": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Local upload failed: {str(e)}")


@router.post("/uploads/s3/presign", response_model=dict)
@require_role(["admin", "teacher"])  # Admins and teachers can upload
async def create_s3_presigned_url(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return a presigned PUT URL for S3 upload.
    Body: { filename: str, content_type?: str }
    """
    import boto3
    from botocore.client import Config as BotoConfig

    filename = payload.get("filename")
    content_type = payload.get("content_type", "application/octet-stream")
    if not filename:
        raise HTTPException(status_code=400, detail="filename required")

    bucket = os.getenv("S3_BUCKET")
    region = os.getenv("AWS_REGION", "us-east-1")
    endpoint = os.getenv("S3_ENDPOINT_URL")  # optional for R2/MinIO
    access_key = os.getenv("AWS_ACCESS_KEY_ID")
    secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")

    if not bucket:
        raise HTTPException(status_code=500, detail="S3_BUCKET not configured")

    key = f"uploads/{uuid.uuid4().hex}_{os.path.basename(filename)}"

    session = boto3.session.Session(
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region,
    )
    s3 = session.client("s3", endpoint_url=endpoint, config=BotoConfig(signature_version="s3v4"))

    try:
        url = s3.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": bucket,
                "Key": key,
                "ContentType": content_type,
            },
            ExpiresIn=int(os.getenv("S3_PRESIGN_TTL", "900")),
        )

        if endpoint:
            public_base = endpoint.rstrip("/")
            # If endpoint like https://<account>.r2.cloudflarestorage.com/<bucket>
            # we build URL accordingly; otherwise fall back to /<bucket>/<key>
            if bucket not in public_base:
                public_url = f"{public_base}/{bucket}/{key}"
            else:
                public_url = f"{public_base}/{key}"
        else:
            public_url = f"https://{bucket}.s3.{region}.amazonaws.com/{key}"

        return {
            "upload_url": url,
            "key": key,
            "public_url": public_url,
            "content_type": content_type,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"S3 presign failed: {str(e)}")


@router.post("/uploads/profile-picture", response_model=dict)
async def upload_profile_picture(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload profile picture for any authenticated user"""
    print(f"[UPLOAD] Starting profile picture upload for user {current_user['id']}")
    print(f"[UPLOAD] File details: {file.filename}, {file.content_type}, {file.size if hasattr(file, 'size') else 'unknown size'}")
    
    # Validate file type
    if not file.content_type or not file.content_type.startswith('image/'):
        print(f"[UPLOAD] Invalid file type: {file.content_type}")
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Validate file size (max 5MB)
    content = await file.read()
    print(f"[UPLOAD] File content size: {len(content)} bytes")
    if len(content) > 5 * 1024 * 1024:  # 5MB
        print(f"[UPLOAD] File too large: {len(content)} bytes")
        raise HTTPException(status_code=400, detail="File size must be less than 5MB")
    
    try:
        upload_dir = _ensure_upload_dir()
        print(f"[UPLOAD] Upload directory: {upload_dir}")
        
        # Create profile pictures subdirectory
        profile_dir = os.path.join(upload_dir, "profile_pictures")
        os.makedirs(profile_dir, exist_ok=True)
        print(f"[UPLOAD] Profile directory: {profile_dir}")
        
        # Generate unique filename
        file_extension = os.path.splitext(file.filename)[1] if file.filename else '.jpg'
        safe_name = f"{current_user['id']}_{uuid.uuid4().hex}{file_extension}"
        abs_path = os.path.join(profile_dir, safe_name)
        print(f"[UPLOAD] Saving to: {abs_path}")
        
        # Save file
        with open(abs_path, "wb") as f:
            f.write(content)
        print(f"[UPLOAD] File saved successfully")
        
        # Generate public URL
        public_path = f"/uploads/profile_pictures/{safe_name}"
        print(f"[UPLOAD] Public path: {public_path}")
        
        # Update user's avatar_url in database
        user_id = current_user['id']
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.avatar_url = public_path
            db.commit()
            db.refresh(user)
            print(f"[UPLOAD] Database updated successfully")
        else:
            print(f"[UPLOAD] Warning: User not found in database")
        
        return {
            "path": public_path,
            "filename": file.filename,
            "size": len(content),
            "content_type": file.content_type,
            "uploaded_at": datetime.utcnow().isoformat(),
            "user_id": str(current_user['id']),
        }
    except Exception as e:
        print(f"[UPLOAD] Error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Profile picture upload failed: {str(e)}")




