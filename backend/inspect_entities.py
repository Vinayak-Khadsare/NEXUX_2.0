import os
import pymongo

client = pymongo.MongoClient("mongodb://localhost:27018/")
db = client["nexus"]

for name in ["Aarav Malhotra", "Neha Kapoor", "Apex Meridian Trading", "Operation Shadow Ledger"]:
    ent = db.entities.find_one({"name": name})
    if ent:
        print(f"Found {name} in case {ent.get('case_id')}")
    else:
        print(f"Could not find {name}")

