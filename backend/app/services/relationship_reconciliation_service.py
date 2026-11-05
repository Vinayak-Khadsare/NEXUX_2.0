"""
===================================================================
NEXUS RELATIONSHIP RECONCILIATION SERVICE
===================================================================
Reconciles and resolves entity-relationship links across cases.
Fixes race conditions during concurrent batch evidence uploads where:
1. Relationships were parsed before target entities were inserted.
2. Existing entities were deduplicated without storing external entity_id.
3. MultiGraph edges need canonical endpoint resolution.
Guarantees zero cross-case leakage and read-only safety for non-case data.
===================================================================
"""
import ast
import re
from datetime import datetime
from typing import Dict, Any, List
from bson import ObjectId

async def reconcile_case_relationships(case_id: str, db) -> Dict[str, int]:
    """
    Scans the case for structured evidence files (e.g. entities.csv, relationships.csv)
    and ensures all valid relationships are resolved and persisted in MongoDB.
    """
    case_id_str = str(case_id).strip()
    case_filter = {"$or": [{"case_id": case_id_str}, {"caseId": case_id_str}]}
    
    # 1. Fetch current entities
    entities = await db["entities"].find(case_filter).to_list(1000)
    evidence_docs = await db["evidence"].find(case_filter).to_list(100)
    
    # 2. Extract external entity_id mappings from any entity schema files
    external_id_to_name: Dict[str, str] = {}
    external_id_to_type: Dict[str, str] = {}
    
    for ev in evidence_docs:
        raw = ev.get("raw_content") or ""
        fname = (ev.get("filename") or ev.get("title") or "").lower()
        if "entities" in fname or fname.endswith(".csv"):
            try:
                data = ast.literal_eval(raw) if raw.strip().startswith("[") else None
                if isinstance(data, list):
                    for rec in data:
                        if isinstance(rec, dict) and "entity_id" in rec and "name" in rec:
                            ext_id = str(rec["entity_id"]).strip()
                            name = str(rec["name"]).strip()
                            external_id_to_name[ext_id] = name
                            if "type" in rec:
                                external_id_to_type[ext_id] = str(rec["type"]).strip()
            except Exception:
                pass

    # 3. Synchronize external entity_id to matching entities in MongoDB
    for ent in entities:
        ent_name = str(ent.get("name", "")).strip().lower()
        ent_norm = str(ent.get("normalizedName", "")).strip().lower()
        ent_canon = str(ent.get("canonical_value", "")).strip().lower()
        ent_props = ent.get("properties", {}) or {}
        
        for ext_id, target_name in external_id_to_name.items():
            t_low = target_name.strip().lower()
            if t_low in [ent_name, ent_norm, ent_canon]:
                if ent_props.get("entity_id") != ext_id:
                    ent_props["entity_id"] = ext_id
                    await db["entities"].update_one(
                        {"_id": ent["_id"]},
                        {
                            "$set": {"properties.entity_id": ext_id},
                            "$addToSet": {"aliases": ext_id}
                        }
                    )
                    ent["properties"] = ent_props

    # Reload entities after ID sync
    entities = await db["entities"].find(case_filter).to_list(1000)

    # 4. Build comprehensive lookup mapping
    lookup: Dict[str, str] = {}
    for ent in entities:
        eid_str = str(ent["_id"])
        lookup[eid_str] = eid_str
        
        name = str(ent.get("name", "")).strip().lower()
        if name: lookup[name] = eid_str
        
        norm = str(ent.get("normalizedName", "")).strip().lower()
        if norm: lookup[norm] = eid_str
        
        canon = str(ent.get("canonical_value", "")).strip().lower()
        if canon: lookup[canon] = eid_str
        
        props = ent.get("properties", {})
        if isinstance(props, dict):
            ext_id = str(props.get("entity_id", "")).strip()
            if ext_id:
                lookup[ext_id] = eid_str
                lookup[ext_id.lower()] = eid_str
                
        aliases = ent.get("aliases", [])
        if isinstance(aliases, list):
            for a in aliases:
                a_str = str(a).strip().lower()
                if a_str: lookup[a_str] = eid_str

    # 5. Reconcile relationships from structured evidence files
    added_count = 0
    for ev in evidence_docs:
        raw = ev.get("raw_content") or ""
        fname = (ev.get("filename") or ev.get("title") or "").lower()
        if "relationship" in fname or "relation" in fname:
            try:
                rows = ast.literal_eval(raw) if raw.strip().startswith("[") else None
                if isinstance(rows, list):
                    for record in rows:
                        if not isinstance(record, dict): continue
                        src_raw = str(record.get("source_id") or record.get("source") or "").strip()
                        tgt_raw = str(record.get("target_id") or record.get("target") or "").strip()
                        rel_type = str(record.get("relationship_type") or record.get("type") or "CONNECTED_TO").upper()
                        
                        src_id = lookup.get(src_raw) or lookup.get(src_raw.lower())
                        if not src_id and src_raw in external_id_to_name:
                            src_id = lookup.get(external_id_to_name[src_raw].lower())
                            
                        tgt_id = lookup.get(tgt_raw) or lookup.get(tgt_raw.lower())
                        if not tgt_id and tgt_raw in external_id_to_name:
                            tgt_id = lookup.get(external_id_to_name[tgt_raw].lower())
                            
                        if src_id and tgt_id and src_id != tgt_id:
                            existing = await db["relationships"].find_one({
                                "$and": [
                                    case_filter,
                                    {"source_entity_id": src_id, "target_entity_id": tgt_id, "type": rel_type}
                                ]
                            })
                            if not existing:
                                src_ent = next((e for e in entities if str(e["_id"]) == src_id), None)
                                tgt_ent = next((e for e in entities if str(e["_id"]) == tgt_id), None)
                                src_name = src_ent.get("name") if src_ent else src_raw
                                tgt_name = tgt_ent.get("name") if tgt_ent else tgt_raw
                                
                                rel_doc = {
                                    "case_id": case_id_str,
                                    "caseId": case_id_str,
                                    "source_entity_id": src_id,
                                    "target_entity_id": tgt_id,
                                    "source": src_id,
                                    "target": tgt_id,
                                    "sourceName": src_name,
                                    "targetName": tgt_name,
                                    "type": rel_type,
                                    "relation": rel_type,
                                    "confidence": float(record.get("confidence", 0.90)),
                                    "properties": {k: v for k, v in record.items() if k not in ["source_id", "target_id", "relationship_type", "type"]},
                                    "evidence_ids": [str(ev["_id"])],
                                    "source_type": "STRUCTURED_IMPORT",
                                    "created_by": "system_reconcile",
                                    "created_at": datetime.utcnow(),
                                    "updated_at": datetime.utcnow()
                                }
                                await db["relationships"].insert_one(rel_doc)
                                added_count += 1
            except Exception as e:
                print(f"[RECONCILE] Error parsing relationship evidence {ev.get('_id')}: {e}")

    total_rels = await db["relationships"].count_documents(case_filter)
    return {"added_relationships": added_count, "total_relationships": total_rels}
