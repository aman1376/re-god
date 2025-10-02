#!/usr/bin/env python3
"""
Test script to verify authentication endpoints
"""
import requests
import json

BASE_URL = "http://localhost:4000"

def test_health():
    """Test health endpoint"""
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"Health check: {response.status_code}")
        if response.status_code == 200:
            print("✅ Health check passed")
            return True
        else:
            print("❌ Health check failed")
            return False
    except Exception as e:
        print(f"❌ Health check error: {e}")
        return False

def test_auth_with_token(token):
    """Test authentication with a token"""
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test profile endpoint
    try:
        response = requests.get(f"{BASE_URL}/api/user/profile", headers=headers)
        print(f"Profile endpoint: {response.status_code}")
        if response.status_code == 200:
            print("✅ Profile endpoint works")
            profile_data = response.json()
            print(f"Profile data: {json.dumps(profile_data, indent=2)}")
        else:
            print(f"❌ Profile endpoint failed: {response.text}")
    except Exception as e:
        print(f"❌ Profile endpoint error: {e}")
    
    # Test dashboard endpoint
    try:
        response = requests.get(f"{BASE_URL}/api/user/dashboard", headers=headers)
        print(f"Dashboard endpoint: {response.status_code}")
        if response.status_code == 200:
            print("✅ Dashboard endpoint works")
            dashboard_data = response.json()
            print(f"Dashboard data: {json.dumps(dashboard_data, indent=2)}")
        else:
            print(f"❌ Dashboard endpoint failed: {response.text}")
    except Exception as e:
        print(f"❌ Dashboard endpoint error: {e}")

def main():
    print("🧪 Testing REGOD Backend Authentication")
    print("=" * 50)
    
    # Test health first
    if not test_health():
        print("Backend is not healthy, stopping tests")
        return
    
    print("\n📝 To test with a real token:")
    print("1. Login to your app")
    print("2. Check the console logs for 'Received token'")
    print("3. Copy the token and run:")
    print("   python test_auth.py <your_token_here>")
    
    # If token provided as argument
    import sys
    if len(sys.argv) > 1:
        token = sys.argv[1]
        print(f"\n🔑 Testing with provided token...")
        test_auth_with_token(token)

if __name__ == "__main__":
    main()








