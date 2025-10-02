#!/usr/bin/env python3
"""
Test script to debug current authentication issues
"""
import requests
import json

# Test the current JWT token
def test_auth():
    base_url = "http://localhost:4000"
    
    # Test the debug endpoint
    print("Testing authentication debug endpoint...")
    
    # You'll need to replace this with an actual JWT token from your app
    test_token = "eyJhbGciOiJSUzI1NiIsImNhdCI6ImNsX0I3ZDRQRDIyMkFBQS..."
    
    try:
        response = requests.post(
            f"{base_url}/api/auth/debug-jwt",
            headers={"Content-Type": "application/json"},
            json={"token": test_token}
        )
        
        if response.status_code == 200:
            print("✅ Debug endpoint response:")
            print(json.dumps(response.json(), indent=2))
        else:
            print(f"❌ Debug endpoint failed: {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"❌ Error testing debug endpoint: {e}")

if __name__ == "__main__":
    test_auth()








