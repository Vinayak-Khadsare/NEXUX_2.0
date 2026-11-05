"""
===================================================================
NEXUS DEMO / SEED DATA INGESTION SCRIPT
===================================================================
This script is for DEVELOPMENT / DEMO SEEDING ONLY.
It inserts fictional presentation cases (Riverfront, Meridian, Vehicle Route)
into MongoDB when explicitly executed by a developer.

Usage:
    python seed_demo_data.py
===================================================================
"""
import asyncio
from app.core.database import connect_to_mongo, close_mongo_connection, get_database
from app.services.presentation_fallback_data import setup_presentation_cases

async def seed_demo():
    print("[NEXUS SEED SCRIPT] Connecting to MongoDB...")
    await connect_to_mongo()
    db = get_database()
    print("[NEXUS SEED SCRIPT] Seeding presentation/demo cases...")
    await setup_presentation_cases(db)
    
    riverfront_count = await db["cases"].count_documents({"_id": "CASE-RIVERFRONT-001"})
    meridian_count = await db["cases"].count_documents({"_id": "CASE-MERIDIAN-002"})
    vehicle_count = await db["cases"].count_documents({"_id": "CASE-VEHICLE-003"})
    
    print(f"[NEXUS SEED SCRIPT] Demo Seeding Complete.")
    print(f"  - Riverfront Incident ({riverfront_count} record)")
    print(f"  - Meridian Transfer Trail ({meridian_count} record)")
    print(f"  - Vehicle Route Investigation ({vehicle_count} record)")
    
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(seed_demo())
