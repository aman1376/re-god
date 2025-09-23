"""
Clerk JWT Verification Module
Handles JWT token verification using Clerk's JWKS endpoint
"""

import jwt
import requests
import os
from typing import Dict, Any, Optional
from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)

class ClerkJWKS:
    def __init__(self):
        self.jwks_url = os.getenv("CLERK_JWKS_URL", "https://api.clerk.com/v1/jwks")
        self._jwks_cache = None
        self._cache_expiry = None
    
    def get_jwks(self) -> Dict[str, Any]:
        """Get JWKS from Clerk with caching"""
        import time
        
        # Check if cache is still valid (cache for 1 hour)
        if (self._jwks_cache and self._cache_expiry and 
            time.time() < self._cache_expiry):
            return self._jwks_cache
        
        try:
            response = requests.get(self.jwks_url, timeout=10)
            response.raise_for_status()
            self._jwks_cache = response.json()
            self._cache_expiry = time.time() + 3600  # Cache for 1 hour
            return self._jwks_cache
        except Exception as e:
            logger.error(f"Failed to fetch JWKS: {e}")
            raise HTTPException(
                status_code=500,
                detail={"error": {"code": "JWKS_FETCH_FAILED", "message": "Failed to fetch JWKS"}}
            )
    
    def get_public_key(self, kid: str) -> str:
        """Get public key for a specific key ID"""
        jwks = self.get_jwks()
        
        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                # Convert JWK to PEM format
                from cryptography.hazmat.primitives import serialization
                from cryptography.hazmat.primitives.asymmetric import rsa
                import base64
                
                # Extract RSA parameters
                n = base64.urlsafe_b64decode(key["n"] + "==")
                e = base64.urlsafe_b64decode(key["e"] + "==")
                
                # Convert to integers
                n_int = int.from_bytes(n, 'big')
                e_int = int.from_bytes(e, 'big')
                
                # Create RSA public key
                public_key = rsa.RSAPublicNumbers(e_int, n_int).public_key()
                
                # Convert to PEM format
                pem = public_key.public_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PublicFormat.SubjectPublicKeyInfo
                )
                
                return pem.decode('utf-8')
        
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "INVALID_KEY_ID", "message": "Invalid key ID"}}
        )

# Global instance
clerk_jwks = ClerkJWKS()

def verify_clerk_jwt(token: str) -> Dict[str, Any]:
    """Verify Clerk JWT token and return payload"""
    try:
        # Decode header to get key ID
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        
        if not kid:
            raise HTTPException(
                status_code=401,
                detail={"error": {"code": "MISSING_KEY_ID", "message": "Missing key ID in token header"}}
            )
        
        # Get public key
        public_key = clerk_jwks.get_public_key(kid)
        
        # Verify and decode token
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"verify_exp": True, "verify_aud": False}
        )
        
        return payload
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "TOKEN_EXPIRED", "message": "Token has expired"}}
        )
    except jwt.InvalidTokenError as e:
        logger.error(f"Invalid token: {e}")
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "INVALID_TOKEN", "message": "Invalid token"}}
        )
    except Exception as e:
        logger.error(f"Token verification error: {e}")
        raise HTTPException(
            status_code=500,
            detail={"error": {"code": "TOKEN_VERIFICATION_FAILED", "message": "Token verification failed"}}
        )
