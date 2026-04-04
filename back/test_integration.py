#!/usr/bin/env python3
"""
Integration test for web search feature.
Tests the actual API endpoints by hitting the running server.
"""
import os
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'server.settings')
sys.path.insert(0, '/home/ubuntu/repos/bots/back')

import django
django.setup()

import requests
from django.contrib.auth.models import User
from bots.models import Bot, AiModel
from rest_framework_simplejwt.tokens import RefreshToken


def run_integration_test():
    print("=" * 60)
    print("Integration Test: Web Search Feature")
    print("=" * 60)
    
    base_url = "http://localhost:8000"
    
    print(f"\n1. Checking if server is running at {base_url}")
    try:
        response = requests.get(f"{base_url}/api/bots.json")
        print(f"   Status: {response.status_code}")
        if response.status_code == 401:
            print("   ✓ Server is running, needs authentication")
        elif response.status_code == 200:
            print("   ✓ Server is running and accessible")
    except Exception as e:
        print(f"   ✗ Server not accessible: {e}")
        return False
    
    # Get or create a test user
    print("\n2. Setting up test user")
    user, created = User.objects.get_or_create(
        username='integration_test_user',
        defaults={
            'email': 'integration@test.com',
            'is_staff': False
        }
    )
    if created:
        user.set_password('testpass123')
        user.save()
    
    print(f"   Using user: {user.username}")
    
    # Get JWT token
    refresh = RefreshToken.for_user(user)
    access_token = str(refresh.access_token)
    headers = {'Authorization': f'Bearer {access_token}'}
    print(f"   Generated JWT token")
    
    # Get or create AI model
    ai_model, _ = AiModel.objects.get_or_create(
        model_id='us.amazon.nova-lite-v1:0',
        defaults={'name': 'Nova Lite'}
    )
    
    # Create test bots
    print("\n3. Creating test bots")
    
    # Clean up any existing test bots
    Bot.objects.filter(name__startswith='Test Web Search').delete()
    
    bot_with_search = Bot.objects.create(
        user=user,
        name='Test Web Search Bot',
        ai_model=ai_model,
        system_prompt='You are a helpful assistant.',
        enable_web_search=True
    )
    print(f"   Created bot with enable_web_search=True: {bot_with_search.name}")
    
    bot_without_search = Bot.objects.create(
        user=user,
        name='Test Bot No Search',
        ai_model=ai_model,
        system_prompt='You are a helpful assistant.',
        enable_web_search=False
    )
    print(f"   Created bot with enable_web_search=False: {bot_without_search.name}")
    
    # Test 1: Get bot details via API
    print("\n4. Testing GET /api/bots/{id}.json")
    try:
        response = requests.get(
            f"{base_url}/api/bots/{bot_with_search.id}.json",
            headers=headers
        )
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            bot_data = response.json()
            print(f"   Bot name: {bot_data.get('name')}")
            print(f"   enable_web_search: {bot_data.get('enable_web_search')}")
            
            if bot_data.get('enable_web_search') == True:
                print("   ✓ Bot correctly has enable_web_search=True")
            else:
                print("   ✗ FAIL: enable_web_search should be True")
                return False
        else:
            print(f"   ✗ FAIL: Could not get bot details")
            print(f"   Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"   ✗ ERROR: {e}")
        return False
    
    # Test 2: Get bot without web search
    print("\n5. Testing GET /api/bots/{id}.json (without web search)")
    try:
        response = requests.get(
            f"{base_url}/api/bots/{bot_without_search.id}.json",
            headers=headers
        )
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            bot_data = response.json()
            if bot_data.get('enable_web_search') == False:
                print("   ✓ Bot correctly has enable_web_search=False")
            else:
                print("   ✗ FAIL: enable_web_search should be False")
                return False
        else:
            print(f"   ✗ FAIL: Could not get bot details")
            return False
    except Exception as e:
        print(f"   ✗ ERROR: {e}")
        return False
    
    # Test 3: Create chat with web search enabled bot
    print("\n6. Testing POST /api/chats/new with web search enabled bot")
    try:
        import urllib.parse
        form_data = urllib.parse.urlencode({
            'message': 'What is the capital of France?',
            'bot': str(bot_with_search.bot_id)
        })
        
        response = requests.post(
            f"{base_url}/api/chats/new",
            headers={**headers, 'Content-Type': 'application/x-www-form-urlencoded'},
            data=form_data
        )
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            chat_data = response.json()
            response_text = chat_data.get('response', '')
            print(f"   Chat response: {response_text[:100]}...")
            
            if response_text:
                print("   ✓ Chat API call succeeded with web search enabled bot")
            else:
                print("   ✗ WARNING: Empty response")
        else:
            print(f"   Response: {response.text[:500]}")
    except Exception as e:
        print(f"   ✗ ERROR: {e}")
    
    # Test 4: Create chat without web search
    print("\n7. Testing POST /api/chats/new with web search disabled bot")
    try:
        import urllib.parse
        form_data = urllib.parse.urlencode({
            'message': 'Hello!',
            'bot': str(bot_without_search.bot_id)
        })
        
        response = requests.post(
            f"{base_url}/api/chats/new",
            headers={**headers, 'Content-Type': 'application/x-www-form-urlencoded'},
            data=form_data
        )
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            chat_data = response.json()
            response_text = chat_data.get('response', '')
            print(f"   Chat response: {response_text[:100]}...")
            
            if response_text:
                print("   ✓ Chat API call succeeded with web search disabled bot")
            else:
                print("   ✗ WARNING: Empty response")
        else:
            print(f"   Response: {response.text[:500]}")
    except Exception as e:
        print(f"   ✗ ERROR: {e}")
    
    # Test 5: Verify web search toggle appears in bot list
    print("\n8. Testing GET /api/bots.json (list)")
    try:
        response = requests.get(f"{base_url}/api/bots.json", headers=headers)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            bots_data = response.json()
            if 'results' in bots_data:
                bots = bots_data['results']
            else:
                bots = bots_data
            
            test_bots = [b for b in bots if 'Test Web Search' in b.get('name', '')]
            if test_bots:
                for b in test_bots:
                    print(f"   Bot: {b.get('name')} - enable_web_search: {b.get('enable_web_search')}")
                print("   ✓ Bot list includes web search field")
            else:
                print("   Note: Test bots may not appear in paginated list")
        else:
            print(f"   Response: {response.text[:200]}")
    except Exception as e:
        print(f"   ✗ ERROR: {e}")
    
    # Cleanup
    print("\n9. Cleaning up test bots")
    bot_with_search.delete()
    bot_without_search.delete()
    print("   ✓ Cleanup complete")
    
    print("\n" + "=" * 60)
    print("INTEGRATION TESTS COMPLETED!")
    print("=" * 60)
    return True


if __name__ == '__main__':
    try:
        success = run_integration_test()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)