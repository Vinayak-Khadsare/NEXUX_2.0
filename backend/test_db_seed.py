import asyncio
from app.core.database import connect_to_mongo, close_mongo_connection, get_database

async def run_test():
    print("Testing DB connection...")
    await connect_to_mongo()
    db = get_database()
    
    # Just check connectivity and collections
    collections = await db.list_collection_names()
    print("Available collections:", collections)
    
    case_count = await db["cases"].count_documents({})
    print("Total case count:", case_count)
    
    await close_mongo_connection()
    print("DB connection test passed.")

if __name__ == "__main__":
    asyncio.run(run_test())
