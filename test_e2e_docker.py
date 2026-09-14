import requests
import json
import time
import os

BASE_URL = "http://localhost:8000/api"

# We assume a test user exists or we bypass auth using a system token if auth is disabled for tests, 
# but wait! NEXUS requires JWT auth for /api/evidence/upload and /api/case/.
# I will just write a simple script to test backend health and AI first.

def test_health():
    res = requests.get(f"{BASE_URL}/health")
    print("Health:", res.status_code, res.json())

def test_ai_status():
    res = requests.get(f"{BASE_URL}/ai/status")
    print("AI Status:", res.status_code, res.json())

if __name__ == "__main__":
    test_health()
    test_ai_status()
