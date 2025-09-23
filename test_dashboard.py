#!/usr/bin/env python3
import requests
import json

# Test the dashboard endpoint
API_BASE = "https://bf5773da486c.ngrok-free.app/api"

# First, get a token via clerk exchange
def test_clerk_exchange():
    response = requests.post(f"{API_BASE}/auth/clerk-exchange", 
                           json={"identifier": "animeshjha428@gmail.com"},
                           headers={"ngrok-skip-browser-warning": "true"})
    
    if response.status_code == 200:
        data = response.json()
        print("✅ Clerk exchange successful")
        print(f"User ID: {data.get('user_id')}")
        return data.get('auth_token')
    else:
        print(f"❌ Clerk exchange failed: {response.status_code}")
        print(response.text)
        return None

def test_dashboard(token):
    headers = {
        "Authorization": f"Bearer {token}",
        "ngrok-skip-browser-warning": "true"
    }
    
    response = requests.get(f"{API_BASE}/user/dashboard", headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        print("✅ Dashboard successful")
        print(f"Last visited course: {data.get('last_visited_course')}")
        print(f"Available courses: {len(data.get('available_courses', []))}")
        return data
    else:
        print(f"❌ Dashboard failed: {response.status_code}")
        print(response.text)
        return None

def test_course_modules(token, course_id):
    headers = {
        "Authorization": f"Bearer {token}",
        "ngrok-skip-browser-warning": "true"
    }
    
    response = requests.get(f"{API_BASE}/courses/{course_id}/modules", headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Course modules successful: {len(data)} modules")
        for module in data:
            print(f"  - {module.get('title')} (ID: {module.get('id')})")
        return data
    else:
        print(f"❌ Course modules failed: {response.status_code}")
        print(response.text)
        return None

if __name__ == "__main__":
    print("Testing API endpoints...")
    
    # Test clerk exchange
    token = test_clerk_exchange()
    if not token:
        exit(1)
    
    # Test dashboard
    dashboard = test_dashboard(token)
    if not dashboard:
        exit(1)
    
    # Test course modules if we have a course
    if dashboard.get('last_visited_course'):
        course_id = dashboard['last_visited_course']['course_id']
        test_course_modules(token, course_id)
    elif dashboard.get('available_courses'):
        course_id = dashboard['available_courses'][0]['course_id']
        test_course_modules(token, course_id)
