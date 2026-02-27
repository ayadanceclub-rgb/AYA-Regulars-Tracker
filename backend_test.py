#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class AYABackendTester:
    def __init__(self):
        # Get backend URL from frontend env file
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL'):
                    self.base_url = line.split('=', 1)[1].strip()
                    break
        else:
            self.base_url = "https://dance-pass-tracker.preview.emergentagent.com"
        
        self.admin_token = None
        self.instructor_token = None
        self.tests_run = 0
        self.tests_passed = 0
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/api{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        self.log(f"🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, params=data, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=30)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"✅ {name} - Status: {response.status_code}")
                try:
                    return True, response.json()
                except:
                    return True, {}
            else:
                self.log(f"❌ {name} - Expected {expected_status}, got {response.status_code}")
                try:
                    self.log(f"Response: {response.text}")
                except:
                    pass
                return False, {}

        except Exception as e:
            self.log(f"❌ {name} - Error: {str(e)}")
            return False, {}

    def test_seed_data(self):
        """First seed the database with demo data"""
        return self.run_test("Seed Database", "POST", "/seed", 200)

    def test_admin_login(self):
        """Test admin login"""
        success, response = self.run_test(
            "Admin Login",
            "POST", 
            "/auth/login",
            200,
            data={"email": "admin@aya.dance", "password": "admin123"}
        )
        if success and 'token' in response:
            self.admin_token = response['token']
            self.log(f"✅ Admin token obtained")
            return True
        return False

    def test_instructor_login(self):
        """Test instructor login"""
        success, response = self.run_test(
            "Instructor Login",
            "POST",
            "/auth/login", 
            200,
            data={"email": "prerrna@aya.dance", "password": "instructor123"}
        )
        if success and 'token' in response:
            self.instructor_token = response['token']
            self.log(f"✅ Instructor token obtained")
            return True
        return False

    def test_dashboard_stats(self):
        """Test dashboard stats endpoint"""
        if not self.admin_token:
            return False
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        success, response = self.run_test(
            "Dashboard Stats",
            "GET",
            "/dashboard/stats",
            200,
            headers=headers
        )
        
        if success:
            required_keys = ['active_batches', 'total_dancers', 'expiring_soon', 'expired', 'today_sessions']
            for key in required_keys:
                if key not in response:
                    self.log(f"❌ Missing key '{key}' in dashboard stats")
                    return False
            self.log(f"✅ Dashboard stats: {json.dumps(response, indent=2)}")
        return success

    def test_batches_list(self):
        """Test batches listing"""
        if not self.admin_token:
            return False
            
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        success, response = self.run_test(
            "List Batches",
            "GET", 
            "/batches",
            200,
            headers=headers
        )
        
        if success and isinstance(response, list) and len(response) > 0:
            batch = response[0]
            expected_keys = ['id', 'batch_name', 'studio_name', 'schedule_days', 'time_slot', 'dancer_count']
            for key in expected_keys:
                if key not in batch:
                    self.log(f"❌ Missing key '{key}' in batch data")
                    return False
            self.log(f"✅ Found {len(response)} batches")
        return success

    def test_dancers_list(self):
        """Test dancers listing"""
        if not self.admin_token:
            return False
            
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        success, response = self.run_test(
            "List Dancers",
            "GET",
            "/dancers", 
            200,
            headers=headers
        )
        
        if success and isinstance(response, list) and len(response) > 0:
            dancer = response[0]
            expected_keys = ['id', 'full_name', 'phone_number', 'active']
            for key in expected_keys:
                if key not in dancer:
                    self.log(f"❌ Missing key '{key}' in dancer data")
                    return False
            self.log(f"✅ Found {len(response)} dancers")
        return success

    def test_instructors_list(self):
        """Test instructors listing (users endpoint)"""
        if not self.admin_token:
            return False
            
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        success, response = self.run_test(
            "List Instructors",
            "GET",
            "/users",
            200,
            headers=headers
        )
        
        if success and isinstance(response, list) and len(response) > 0:
            instructor = response[0]
            expected_keys = ['id', 'name', 'email', 'role']
            for key in expected_keys:
                if key not in instructor:
                    self.log(f"❌ Missing key '{key}' in instructor data")
                    return False
            self.log(f"✅ Found {len(response)} instructors")
        return success

    def test_notifications(self):
        """Test notifications endpoint"""
        if not self.admin_token:
            return False
            
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        success, response = self.run_test(
            "Get Notifications", 
            "GET",
            "/notifications",
            200,
            headers=headers
        )
        
        if success:
            self.log(f"✅ Found {len(response)} notifications")
        return success

    def test_audit_log(self):
        """Test audit log endpoint"""
        if not self.admin_token:
            return False
            
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        success, response = self.run_test(
            "Get Audit Log",
            "GET", 
            "/audit-log",
            200,
            headers=headers
        )
        
        if success and 'logs' in response:
            self.log(f"✅ Found {len(response['logs'])} audit log entries")
        return success

    def test_settings(self):
        """Test settings endpoints"""
        if not self.admin_token:
            return False
            
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Test get settings
        success, response = self.run_test(
            "Get Settings",
            "GET",
            "/settings", 
            200,
            headers=headers
        )
        
        if not success:
            return False
            
        # Test update settings
        success, response = self.run_test(
            "Update Settings",
            "PUT",
            "/settings",
            200,
            data={"monthly_expiry_warning_days": 7},
            headers=headers
        )
        
        return success

    def test_instructor_batches(self):
        """Test instructor batch access"""
        if not self.instructor_token:
            return False
            
        headers = {"Authorization": f"Bearer {self.instructor_token}"}
        success, response = self.run_test(
            "Instructor Batches",
            "GET",
            "/batches", 
            200,
            headers=headers
        )
        
        if success and isinstance(response, list):
            self.log(f"✅ Instructor can access {len(response)} batches")
        return success

    def test_today_session(self):
        """Test getting today's session"""
        if not self.instructor_token:
            return False
            
        # First get batches to get a batch_id
        headers = {"Authorization": f"Bearer {self.instructor_token}"}
        success, batches = self.run_test(
            "Get Batches for Session",
            "GET",
            "/batches",
            200,
            headers=headers
        )
        
        if not success or not batches or len(batches) == 0:
            self.log("❌ No batches available for session test")
            return False
            
        batch_id = batches[0]['id']
        
        success, response = self.run_test(
            "Get Today Session",
            "GET", 
            "/sessions/today",
            200,
            data={"batch_id": batch_id},
            headers=headers
        )
        
        if success and 'id' in response:
            self.log(f"✅ Today session created/retrieved: {response['date']}")
        return success

    def run_all_tests(self):
        """Run all backend tests"""
        self.log("🚀 Starting AYA Regulars Manager Backend Tests")
        self.log(f"Backend URL: {self.base_url}")
        
        # Critical path tests
        tests = [
            self.test_seed_data,
            self.test_admin_login,
            self.test_instructor_login,
            self.test_dashboard_stats,
            self.test_batches_list,
            self.test_dancers_list,
            self.test_instructors_list,
            self.test_notifications,
            self.test_audit_log,
            self.test_settings,
            self.test_instructor_batches,
            self.test_today_session,
        ]
        
        self.log(f"\n📋 Running {len(tests)} backend tests...\n")
        
        for test in tests:
            try:
                test()
            except Exception as e:
                self.log(f"❌ Test {test.__name__} failed with exception: {e}")
                
        self.log(f"\n📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed < self.tests_run:
            self.log("❌ Some backend tests failed!")
            return False
        else:
            self.log("✅ All backend tests passed!")
            return True

def main():
    tester = AYABackendTester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())