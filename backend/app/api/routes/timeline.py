from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any
from app.core.database import get_database
from app.api.routes.auth import get_current_user
from bson import ObjectId

router = APIRouter()

@router.get("/{case_id}", response_model=List[Dict[str, Any]])
@router.get("/{case_id}/", response_model=List[Dict[str, Any]], include_in_schema=False)
async def get_timeline(case_id: str, db=Depends(get_database), current_user=Depends(get_current_user)):
    events = []
    seen_event_keys = set()
    
    # 1. Fetch explicit timeline events stored in db["timeline"]
    db_timeline = await db["timeline"].find({"$or": [{"case_id": case_id}, {"caseId": case_id}]}).to_list(None)
    for tl in db_timeline:
        ts = str(tl.get("timestamp") or tl.get("date") or tl.get("created_at") or "")
        title = tl.get("title") or tl.get("event") or "Investigation Event"
        desc = tl.get("description") or tl.get("message") or tl.get("event") or ""
        tl_type = tl.get("type", "EVENT")
        
        events.append({
            "event_id": str(tl.get("_id", tl.get("id"))),
            "timestamp": ts,
            "type": f"TIMELINE_{tl_type}",
            "category": tl.get("category", "TIMELINE"),
            "title": title,
            "message": desc,
            "properties": tl.get("properties", {})
        })
        seen_event_keys.add((ts, title.lower()))
    
    # 2. Fetch entities and relationships for case
    entities = await db["entities"].find({"$or": [{"case_id": case_id}, {"caseId": case_id}]}).to_list(None)
    relationships = await db["relationships"].find({"$or": [{"case_id": case_id}, {"caseId": case_id}]}).to_list(None)
    
    # 3. Add relationships with timestamp/date properties
    entity_map = {str(e["_id"]): e for e in entities}
    for r in relationships:
        props = r.get("properties", {})
        t_str = props.get("timestamp") or props.get("date") or props.get("time")
        if t_str:
            src = entity_map.get(str(r["source_entity_id"]))
            tgt = entity_map.get(str(r["target_entity_id"]))
            src_name = src['name'] if src else 'Unknown'
            tgt_name = tgt['name'] if tgt else 'Unknown'
            title = f"{r['type']} Link Detected"
            if (str(t_str), title.lower()) not in seen_event_keys:
                events.append({
                    "event_id": str(r["_id"]),
                    "timestamp": str(t_str),
                    "type": f"RELATIONSHIP_{r['type']}",
                    "category": "RELATIONSHIP",
                    "title": title,
                    "message": f"'{src_name}' linked to '{tgt_name}' via {r['type']}.",
                    "properties": props
                })
                seen_event_keys.add((str(t_str), title.lower()))
            
    # 4. Add entities with temporal significance
    for ent in entities:
        props = ent.get("properties", {})
        t_str = props.get("timestamp") or props.get("date") or props.get("time")
        
        if t_str or ent.get("type") in ["EVENT", "COMMUNICATION"]:
            event_time = str(t_str) if t_str else (ent["created_at"].isoformat() if hasattr(ent["created_at"], "isoformat") else str(ent["created_at"]))
            
            ent_type = ent.get('type', 'UNKNOWN')
            title = f"{ent_type.capitalize()} Logged: {ent['name']}"
            if ent_type == "EVENT":
                title = ent['name']
            elif ent_type == "COMMUNICATION":
                title = f"Communication Intercept: {ent['name']}"
                
            desc = ent.get("description", "")
            if not desc:
                desc = f"Subject '{ent['name']}' was registered as a {ent_type.lower()} in the intelligence database."
                
            if (event_time, title.lower()) not in seen_event_keys:
                events.append({
                    "event_id": str(ent["_id"]),
                    "timestamp": event_time,
                    "type": f"ENTITY_{ent_type}",
                    "category": "ENTITY",
                    "title": title,
                    "message": desc,
                    "properties": {"risk_score": ent.get("risk_score", 0.0), **props}
                })
                seen_event_keys.add((event_time, title.lower()))
        
    # Sort events chronologically (ascending)
    def get_timestamp_key(evt):
        return str(evt["timestamp"])
        
    events.sort(key=get_timestamp_key, reverse=False)
    return events
