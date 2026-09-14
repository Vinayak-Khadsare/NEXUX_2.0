import time
import requests
import os

BASE_URL = "http://localhost:8000/api"

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

    print("2. Creating Case A...")
    res = requests.post(f"{BASE_URL}/cases/", json={
        "name": "TEST_CASE_A",
        "description": "Case A for isolation test",
        "priority": "HIGH"
    }, headers=headers)
    case_a_id = res.json()["_id"]
    print(f"   Created Case A: {case_a_id}")

    print("3. Uploading Evidence to Case A...")
    evidence_text = """
    On September 12, 2026, John Doe was observed meeting with Jane Smith at the Central Park Cafe.
    John Doe handed a suspicious package to Jane Smith.
    Later, Jane Smith transferred $50,000 to an offshore account owned by Blackwood Holdings.
    """
    
    # Save temp evidence file
    with open("temp_evidence.txt", "w") as f:
        f.write(evidence_text)
        
    with open("temp_evidence.txt", "rb") as f:
        res = requests.post(f"{BASE_URL}/ingestion/upload", 
                            data={"case_id": case_a_id}, 
                            files={"file": ("temp_evidence.txt", f, "text/plain")}, 
                            headers=headers)
    
    print("   Upload result:", res.json())
    
    # Wait for processing and extraction
    print("   Waiting for processing (polling entities)...")
    for _ in range(60): # wait up to 10 minutes (60 * 10s)
        res = requests.get(f"{BASE_URL}/entities/?case_id={case_a_id}", headers=headers)
        if res.status_code == 200 and len(res.json()) > 0:
            print(f"   Extraction complete! Found {len(res.json())} entities.")
            break
        time.sleep(10)
    else:
        print("   Warning: Extraction timed out or no entities found.")
    print("4. Testing AI Queries (Case A)...")
    
    def ask_ai(query, case_id):
        print(f"\n   Q: {query}")
        res = requests.post(f"{BASE_URL}/chat/?query={requests.utils.quote(query)}&case_id={case_id}", headers=headers)
        if res.status_code == 200:
            print(f"   A: {res.json().get('answer')}")
        else:
            print(f"   Error: {res.text}")

    ask_ai("Who is John Doe?", case_a_id)
    ask_ai("Who is Jane Smith?", case_a_id)
    ask_ai("How is John Doe connected to Jane Smith?", case_a_id)
    ask_ai("Who is Robert Baratheon?", case_a_id)
    
    print("\n5. Testing Empty RAG...")
    # Empty RAG test: ask a very specific question that ChromaDB won't match but MongoDB might, 
    # or just ask a general question about the entities.
    ask_ai("What organization is mentioned?", case_a_id)
    
    print("\n6. Testing Case Isolation (Case B)...")
    res = requests.post(f"{BASE_URL}/cases/", json={
        "name": "TEST_CASE_B",
        "description": "Case B for isolation test",
        "priority": "LOW"
    }, headers=headers)
    case_b_id = res.json()["_id"]
    print(f"   Created Case B: {case_b_id}")
    
    ask_ai("Who is John Doe?", case_b_id)

if __name__ == "__main__":
    main()
