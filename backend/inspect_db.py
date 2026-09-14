import os
import pymongo

client = pymongo.MongoClient("mongodb://localhost:27018/")
db = client["nexus"]

cases = list(db.cases.find())
print(f"Total Cases: {len(cases)}")

for case in cases:
    case_id = str(case.get("_id"))
    name = case.get("name", case.get("title", "Unknown"))
    
    entities_count = db.entities.count_documents({"case_id": case_id})
    relationships_count = db.relationships.count_documents({"case_id": case_id})
    evidence_count = db.evidence.count_documents({"case_id": case_id})
    
    print(f"\nCASE: {name}")
    print(f"ID: {case_id}")
    print(f"Entities: {entities_count}")
    print(f"Relationships: {relationships_count}")
    print(f"Evidence: {evidence_count}")
