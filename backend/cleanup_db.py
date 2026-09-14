import pymongo
import chromadb
from chromadb.config import Settings

MONGO_URI = "mongodb://localhost:27018/"
TARGET_CASES = ["CASE-RIVERFRONT-001", "CASE-MERIDIAN-002", "CASE-VEHICLE-003"]

def clean_mongodb():
    client = pymongo.MongoClient(MONGO_URI)
    db = client["nexus"]
    
    collections_to_clean = ["cases", "entities", "relationships", "evidence", "anomalies", "reports", "alerts", "timeline"]
    
    print("--- MONGODB CLEANUP ---")
    for case_id in TARGET_CASES:
        print(f"\nProcessing {case_id}...")
        
        # Check if case exists in 'cases' collection
        # Note: In cases collection, the id might be '_id' or 'id'. In the earlier script we matched '_id'.
        # Wait, the earlier script printed ID as CASE-RIVERFRONT-001 which is the '_id'.
        case_doc = db.cases.find_one({"_id": case_id})
        if not case_doc:
            case_doc = db.cases.find_one({"id": case_id})
            
        if not case_doc:
            print(f"Case {case_id} not found in 'cases' collection.")
        else:
            res = db.cases.delete_one({"_id": case_doc["_id"]})
            print(f"Deleted {res.deleted_count} case record.")
            
        # Delete from other collections based on 'case_id'
        for coll in collections_to_clean:
            if coll == "cases": continue
            if coll in db.list_collection_names():
                res = db[coll].delete_many({"case_id": case_id})
                if res.deleted_count > 0:
                    print(f"Deleted {res.deleted_count} records from {coll}")

def clean_chromadb():
    print("\n--- CHROMADB CLEANUP ---")
    try:
        # Connect to ChromaDB. In docker-compose, chroma volume is mapped to ./data/chroma
        chroma_path = "../data/chroma"
        if not __import__('os').path.exists(chroma_path):
            chroma_path = "./data/chroma"
        
        client = chromadb.PersistentClient(path=chroma_path)
        collections = client.list_collections()
        
        if not collections:
            print("No ChromaDB collections found.")
            return

        for coll_meta in collections:
            coll = client.get_collection(coll_meta.name)
            # Check if ChromaDB supports case-scoped deletion
            # We can delete by where clause
            for case_id in TARGET_CASES:
                try:
                    coll.delete(where={"case_id": case_id})
                    print(f"Deleted vectors for {case_id} in {coll_meta.name} successfully.")
                except Exception as e:
                    print(f"Failed to delete case vectors in {coll_meta.name}: {e}")
                    print("NOT SAFE TO PERFORM OR NOT SUPPORTED")
    except Exception as e:
        print(f"ChromaDB connection or operation failed: {e}")

if __name__ == "__main__":
    clean_mongodb()
    clean_chromadb()
    print("\nCleanup Script Finished.")
