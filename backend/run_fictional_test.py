import time
import requests
import os

BASE_URL = "http://localhost:8000/api"

# Test Content
TEST_DOCUMENT = """
On October 31st, 2026, Arthur Pendragon was seen exiting the Apex Tower located at 1500 Broadway. 
He was carrying a silver briefcase. Approximately 10 minutes later, he met with Morgana Le Fay at the Nexus Coffee Shop.
During this meeting, Arthur handed the briefcase to Morgana. 
Morgana later contacted a representative from ShadowCorp to confirm the receipt of the package.
"""

def main():
    print("1. Registering/Logging in...")
    res = requests.post(f"{BASE_URL}/auth/register", json={
        "email": "ai_test_runner@nexus.gov",
        "password": "Password123!",
        "full_name": "AI Test Runner",
        "department": "QA"
    })
    
    res = requests.post(f"{BASE_URL}/auth/login", data={
        "username": "ai_test_runner@nexus.gov",
        "password": "Password123!"
    })
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    print("2. Creating Fictional Case...")
    case_data = {
        "name": "CASE-FICTIONAL-ALPHA-004",
        "description": "Investigation into the silver briefcase exchange.",
        "priority": "HIGH"
    }
    res = requests.post(f"{BASE_URL}/cases/", json=case_data, headers=headers)
    case_id_a = res.json()["_id"]
    print(f"   Created Case: {case_id_a}")

    print("3. Uploading Evidence to Fictional Case...")
    files = {
        "file": ("fictional_evidence.txt", TEST_DOCUMENT.encode(), "text/plain")
    }
    data = {"case_id": case_id_a, "title": "Fictional Exchange Report"}
    res = requests.post(f"{BASE_URL}/ingestion/upload", files=files, data=data, headers=headers)
    print(f"   Upload result: {res.json()}")

    # Wait for entity extraction
    print("   Waiting for processing (polling entities)...")
    entities = []
    for _ in range(60):
        res = requests.get(f"{BASE_URL}/entities/?case_id={case_id_a}", headers=headers)
        if res.status_code == 200:
            entities = res.json()
            if len(entities) > 0:
                print(f"   Extraction complete! Found {len(entities)} entities.")
                break
        time.sleep(2)

    if not entities:
        print("   TIMEOUT: Entities were not extracted in time.")
        return

    print("4. Testing AI Queries (Fictional Case)...")
    def ask(q, cid):
        print(f"\n   Q: {q}")
        r = requests.post(f"{BASE_URL}/chat/?query={q}&case_id={cid}", headers=headers)
        if r.status_code == 200:
            print(f"   A: {r.json().get('answer')}")
        else:
            print(f"   Error: {r.text}")

    ask("Who is Arthur Pendragon?", case_id_a)
    ask("Who is Morgana Le Fay?", case_id_a)
    ask("How is Arthur Pendragon connected to Morgana Le Fay?", case_id_a)
    ask("Who is Lancelot?", case_id_a)

    print("\n5. Testing Empty RAG...")
    # This should answer based on MongoDB entity context despite ChromaDB possibly not returning it
    ask("What organization is mentioned?", case_id_a)

    print("\n6. Testing Case Isolation (Empty Case)...")
    case_data_b = {
        "name": "CASE-FICTIONAL-BETA-005",
        "description": "Empty case for isolation test",
        "priority": "LOW"
    }
    res_b = requests.post(f"{BASE_URL}/cases/", json=case_data_b, headers=headers)
    case_id_b = res_b.json()["_id"]
    print(f"   Created Case B: {case_id_b}")
    
    ask("Who is Arthur Pendragon?", case_id_b)

if __name__ == "__main__":
    main()
