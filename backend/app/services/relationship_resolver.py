import re
import os
import ast
import json
import asyncio
from datetime import datetime
from bson import ObjectId
from typing import Optional, Dict, Any, List

def infer_type_from_id(val: str) -> Optional[str]:
    v = str(val).strip().upper()
    if v.startswith("P") and not v.startswith("PH") and v[1:].isdigit():
        return "PERSON"
    elif v.startswith("O") and v[1:].isdigit():
        return "ORGANIZATION"
    elif v.startswith("L") and v[1:].isdigit():
        return "LOCATION"
    elif v.startswith("V") and v[1:].isdigit():
        return "VEHICLE"
    elif v.startswith("A") and v[1:].isdigit():
        return "ACCOUNT"
    elif v.startswith("PH") and v[2:].isdigit():
        return "PHONE"
    elif v.startswith("EM") and v[2:].isdigit():
        return "EMAIL"
    return None

def is_code_name(name: str) -> bool:
    s = str(name).strip().upper()
    return bool(re.match(r'^[A-Z]{1,4}\d{1,5}[A-Z]?$', s))

def is_file_name(name: str) -> bool:
    s = str(name).strip().lower()
    return bool(re.search(r'\.(csv|tsv|json|txt|docx?|pdf|zip|xlsx?|pptx?)$', s, re.I))

def extract_parenthetical_code(name: str) -> Optional[str]:
    m = re.search(r'\(([A-Z]{1,4}\d{1,5}[A-Z]?)\)', str(name))
    return m.group(1).upper() if m else None

def clean_entity_name(name: str) -> str:
    return re.sub(r'\s*\([A-Z]{1,4}\d{1,5}[A-Z]?\)\s*', '', str(name)).strip()

async def find_entity(db, case_id: str, val: str, expected_type: Optional[str] = None):
    if not val or str(val).strip() == "" or str(val).lower() == "nan":
        return None
    val_clean = str(val).strip()
    val_lower = val_clean.lower()
    
    if not expected_type:
        expected_type = infer_type_from_id(val_clean)

    p_code = extract_parenthetical_code(val_clean)
    p_clean = clean_entity_name(val_clean)

    or_filters = [
        {"properties.entity_id": {"$regex": f"^{re.escape(val_clean)}$", "$options": "i"}},
        {"properties.Entity ID": {"$regex": f"^{re.escape(val_clean)}$", "$options": "i"}},
        {"properties.identifier": {"$regex": f"^{re.escape(val_clean)}$", "$options": "i"}},
        {"properties.code": {"$regex": f"^{re.escape(val_clean)}$", "$options": "i"}},
        {"properties.aliases": {"$regex": f"^{re.escape(val_clean)}$", "$options": "i"}},
        {"entity_id": {"$regex": f"^{re.escape(val_clean)}$", "$options": "i"}},
        {"normalizedName": val_lower},
        {"name": {"$regex": f"^{re.escape(val_clean)}$", "$options": "i"}}
    ]

    if p_code:
        or_filters.append({"properties.entity_id": {"$regex": f"^{re.escape(p_code)}$", "$options": "i"}},)
        or_filters.append({"properties.Entity ID": {"$regex": f"^{re.escape(p_code)}$", "$options": "i"}},)
        or_filters.append({"properties.identifier": {"$regex": f"^{re.escape(p_code)}$", "$options": "i"}},)
        or_filters.append({"entity_id": {"$regex": f"^{re.escape(p_code)}$", "$options": "i"}})
        or_filters.append({"name": {"$regex": f"^{re.escape(p_code)}$", "$options": "i"}})

    if p_clean and p_clean.lower() != val_lower:
        or_filters.append({"normalizedName": p_clean.lower()})
        or_filters.append({"name": {"$regex": f"^{re.escape(p_clean)}$", "$options": "i"}})

    if ObjectId.is_valid(val_clean):
        or_filters.append({"_id": ObjectId(val_clean)})

    base_query = {
        "$or": [{"case_id": case_id}, {"caseId": case_id}],
        "$and": [{"$or": or_filters}]
    }

    cursor = db["entities"].find(base_query)
    matches = await cursor.to_list(length=10)
    if not matches:
        return None

    # If expected_type is known, prefer type matches
    if expected_type:
        type_matches = [m for m in matches if str(m.get("type", "")).upper() == expected_type.upper()]
        if type_matches:
            matches = type_matches

    # Prioritize entities with real descriptive names over raw code names or parenthetical code names
    clean_named_matches = [m for m in matches if not is_code_name(m.get("name", "")) and not extract_parenthetical_code(m.get("name", ""))]
    if clean_named_matches:
        return clean_named_matches[0]

    non_code_matches = [m for m in matches if not is_code_name(m.get("name", ""))]
    if non_code_matches:
        return non_code_matches[0]

    return matches[0]

def parse_records_from_content_or_file(raw_content: str, file_path: str) -> List[Dict[str, Any]]:
    # 1. Try JSON / python ast literal parse of raw_content
    if raw_content and raw_content.strip():
        text = raw_content.strip()
        if (text.startswith("[") and text.endswith("]")) or (text.startswith("{") and text.endswith("}")):
            try:
                data = json.loads(text)
                if isinstance(data, list): return data
            except Exception:
                try:
                    data = ast.literal_eval(text)
                    if isinstance(data, list): return data
                except Exception:
                    pass

    # 2. Try reading file directly
    if file_path and os.path.exists(file_path):
        ext = os.path.splitext(file_path)[1].lower()
        try:
            import pandas as pd
            if ext == ".csv":
                try:
                    df = pd.read_csv(file_path, encoding="utf-8")
                except UnicodeDecodeError:
                    df = pd.read_csv(file_path, encoding="latin-1")
                return df.to_dict(orient="records")
            elif ext == ".json":
                df = pd.read_json(file_path)
                return df.to_dict(orient="records")
        except Exception as e:
            print(f"[REL_RESOLVER] Error reading file {file_path}: {e}")

    return []

async def resolve_case_relationships(db, case_id: str) -> int:
    """
    Scans pending_relationships and structured relationship evidence in this case.
    Resolves source and target entity references against existing entities in db['entities'].
    Inserts newly resolved relationships into db['relationships'].
    Returns count of newly inserted relationships.
    """
    if not case_id:
        return 0

    # 0. Automatically merge duplicate entities (e.g. 'P01' code node into 'Arjun Mehta' canonical entity)
    await merge_case_duplicate_entities(db, case_id)

    resolved_count = 0

    # A. Check pending_relationships collection
    pending_cursor = db["pending_relationships"].find({
        "$or": [{"case_id": case_id}, {"caseId": case_id}],
        "status": {"$ne": "RESOLVED"}
    })
    pending_list = await pending_cursor.to_list(length=500)

    for p in pending_list:
        try:
            s_val = p.get("source_ref") or p.get("src_val")
            t_val = p.get("target_ref") or p.get("tgt_val")
            rel_type = str(p.get("type") or p.get("rel_type") or "CONNECTED_TO").upper().strip()
            
            src_ent = await find_entity(db, case_id, str(s_val))
            tgt_ent = await find_entity(db, case_id, str(t_val))

            if src_ent and tgt_ent and str(src_ent["_id"]) != str(tgt_ent["_id"]):
                existing_rel = await db["relationships"].find_one({
                    "$or": [{"case_id": case_id}, {"caseId": case_id}],
                    "source_entity_id": str(src_ent["_id"]),
                    "target_entity_id": str(tgt_ent["_id"]),
                    "type": rel_type
                })
                if not existing_rel:
                    rel_doc = {
                        "case_id": case_id,
                        "caseId": case_id,
                        "source_entity_id": str(src_ent["_id"]),
                        "target_entity_id": str(tgt_ent["_id"]),
                        "type": rel_type,
                        "properties": p.get("properties", {}),
                        "evidence_ids": [p.get("evidence_id")] if p.get("evidence_id") else [],
                        "source": "STRUCTURED_IMPORT",
                        "created_by": p.get("created_by", "system"),
                        "created_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow()
                    }
                    await db["relationships"].insert_one(rel_doc)
                    resolved_count += 1
                
                await db["pending_relationships"].update_one(
                    {"_id": p["_id"]},
                    {"$set": {"status": "RESOLVED", "updated_at": datetime.utcnow()}}
                )
        except Exception as pe:
            print(f"[REL_RESOLVER] Error resolving pending item: {pe}")

    # B. Check evidence collection for relationship CSV/JSON files
    ev_cursor = db["evidence"].find({
        "$or": [{"case_id": case_id}, {"caseId": case_id}],
        "$or": [
            {"title": {"$regex": "relat|link|edge", "$options": "i"}},
            {"file_path": {"$regex": r"\.(csv|json)$", "$options": "i"}},
            {"file_type": {"$in": ["text/csv", "application/json"]}}
        ]
    })
    evidence_list = await ev_cursor.to_list(length=100)

    for ev in evidence_list:
        raw_content = ev.get("raw_content", "")
        file_path = ev.get("file_path", "")
        records = parse_records_from_content_or_file(raw_content, file_path)
        if not records or not isinstance(records, list) or len(records) == 0:
            continue

        raw_columns = list(records[0].keys())
        def norm_col(c: str) -> str:
            s = str(c).strip().lower().replace(" ", "_").replace("/", "_").replace("-", "_")
            while "__" in s:
                s = s.replace("__", "_")
            return s
        
        col_map = {norm_col(c): c for c in raw_columns}
        src_key = next((col_map[k] for k in ["source", "source_id", "from", "src", "origin"] if k in col_map), None)
        tgt_key = next((col_map[k] for k in ["target", "target_id", "to", "tgt", "destination"] if k in col_map), None)
        rel_type_key = next((col_map[k] for k in ["relationship", "relationship_type", "type", "relation", "link_type"] if k in col_map), None)

        if not src_key or not tgt_key:
            continue

        rel_col = rel_type_key if rel_type_key else "relationship"

        for record in records:
            try:
                s_val = record.get(src_key)
                t_val = record.get(tgt_key)
                if not s_val or not t_val or str(s_val).lower() == "nan" or str(t_val).lower() == "nan":
                    continue

                src_ent = await find_entity(db, case_id, str(s_val))
                tgt_ent = await find_entity(db, case_id, str(t_val))

                rel_type = str(record.get(rel_col, "CONNECTED_TO")).upper().strip()
                if not rel_type or rel_type == "NAN":
                    rel_type = "CONNECTED_TO"

                properties = {k: v for k, v in record.items() if k not in [src_key, tgt_key, rel_col, "case_id", "caseId"]}

                if src_ent and tgt_ent and str(src_ent["_id"]) != str(tgt_ent["_id"]):
                    existing_rel = await db["relationships"].find_one({
                        "$or": [{"case_id": case_id}, {"caseId": case_id}],
                        "source_entity_id": str(src_ent["_id"]),
                        "target_entity_id": str(tgt_ent["_id"]),
                        "type": rel_type
                    })
                    if not existing_rel:
                        rel_doc = {
                            "case_id": case_id,
                            "caseId": case_id,
                            "source_entity_id": str(src_ent["_id"]),
                            "target_entity_id": str(tgt_ent["_id"]),
                            "type": rel_type,
                            "properties": properties,
                            "evidence_ids": [str(ev["_id"])],
                            "source": "STRUCTURED_IMPORT",
                            "created_by": ev.get("created_by", "system"),
                            "created_at": datetime.utcnow(),
                            "updated_at": datetime.utcnow()
                        }
                        await db["relationships"].insert_one(rel_doc)
                        resolved_count += 1
                else:
                    # Save to pending_relationships so it can be resolved as soon as entities are added
                    await db["pending_relationships"].update_one(
                        {
                            "case_id": case_id,
                            "source_ref": str(s_val).strip(),
                            "target_ref": str(t_val).strip(),
                            "type": rel_type
                        },
                        {"$set": {
                            "case_id": case_id,
                            "caseId": case_id,
                            "source_ref": str(s_val).strip(),
                            "target_ref": str(t_val).strip(),
                            "type": rel_type,
                            "properties": properties,
                            "evidence_id": str(ev["_id"]),
                            "status": "PENDING",
                            "created_by": ev.get("created_by", "system"),
                            "updated_at": datetime.utcnow()
                        }},
                        upsert=True
                    )
            except Exception as row_e:
                print(f"[REL_RESOLVER] Error processing record: {row_e}")

    if resolved_count > 0:
        print(f"[REL_RESOLVER] Resolved and inserted {resolved_count} new relationships for case {case_id}")

    # Synchronize 1-2 line involvement descriptions for all entities in the case
    await sync_entity_involvement_descriptions(db, case_id)
    return resolved_count

async def merge_case_duplicate_entities(db, case_id: str) -> int:
    """
    Merges duplicate entities within a case (e.g. 'P01' code node into 'Arjun Mehta' canonical entity).
    Rewires all relationship references from duplicate to canonical entity.
    Cleans up self-loops, duplicate edges, and bogus file-name entities.
    Removes duplicate entity documents.
    Returns the count of merged duplicate entities.
    """
    if not case_id:
        return 0

    entities_cursor = db["entities"].find({"$or": [{"case_id": case_id}, {"caseId": case_id}]})
    entities = await entities_cursor.to_list(length=1000)
    if not entities or len(entities) < 2:
        return 0

    # 1. Clean up bogus file-name entities (e.g. 01_entities.csv) created erroneously by AI extraction
    deleted_files = 0
    for ent in list(entities):
        if is_file_name(ent.get("name", "")) and ent.get("source") == "AI_EXTRACTED":
            ent_id_str = str(ent["_id"])
            await db["relationships"].delete_many({
                "$or": [{"case_id": case_id}, {"caseId": case_id}],
                "$or": [{"source_entity_id": ent_id_str}, {"target_entity_id": ent_id_str}]
            })
            await db["entities"].delete_one({"_id": ent["_id"]})
            entities.remove(ent)
            deleted_files += 1

    # 2. Map codes/identifiers to canonical entities
    code_to_canonical = {}
    name_to_canonical = {}

    for ent in entities:
        name = str(ent.get("name", "")).strip()
        props = ent.get("properties", {}) or {}
        
        ent_id = props.get("entity_id") or props.get("Entity ID") or props.get("identifier") or props.get("code") or ent.get("entity_id")
        if ent_id and str(ent_id).strip():
            code_clean = str(ent_id).strip().upper()
            if not is_code_name(name):
                if code_clean not in code_to_canonical or extract_parenthetical_code(code_to_canonical[code_clean].get("name", "")):
                    code_to_canonical[code_clean] = ent

        aliases = props.get("aliases", [])
        if isinstance(aliases, list):
            for a in aliases:
                if str(a).strip() and not is_code_name(name):
                    code_to_canonical[str(a).strip().upper()] = ent

        p_code = extract_parenthetical_code(name)
        if p_code and not is_code_name(name):
            if p_code not in code_to_canonical:
                code_to_canonical[p_code] = ent

        norm_key = (ent.get("normalizedName") or name.lower()).strip()
        clean_key = clean_entity_name(name).lower().strip()

        for key in filter(None, [clean_key, norm_key]):
            if key not in name_to_canonical:
                name_to_canonical[key] = ent
            else:
                existing_can = name_to_canonical[key]
                if (is_code_name(existing_can.get("name", "")) or extract_parenthetical_code(existing_can.get("name", ""))) and not is_code_name(name) and not extract_parenthetical_code(name):
                    name_to_canonical[key] = ent

    merged_count = 0
    merged_ids = set()

    for ent in list(entities):
        if str(ent["_id"]) in merged_ids:
            continue

        name = str(ent.get("name", "")).strip()
        name_clean = name.upper()
        props = ent.get("properties", {}) or {}
        canonical = None

        # Check A: Name is a short code (e.g. 'P01') and matches a canonical entity's entity_id
        if is_code_name(name) and name_clean in code_to_canonical:
            can_candidate = code_to_canonical[name_clean]
            if str(can_candidate["_id"]) != str(ent["_id"]):
                canonical = can_candidate

        # Check B: Name has parenthetical code e.g. 'Sameer Khan (P02)'
        if not canonical:
            p_code = extract_parenthetical_code(name)
            p_clean = clean_entity_name(name).lower().strip()
            if p_code and p_code in code_to_canonical:
                can_candidate = code_to_canonical[p_code]
                if str(can_candidate["_id"]) != str(ent["_id"]):
                    canonical = can_candidate
            if not canonical and p_clean and p_clean in name_to_canonical:
                can_candidate = name_to_canonical[p_clean]
                if str(can_candidate["_id"]) != str(ent["_id"]):
                    canonical = can_candidate

        # Check C: Same entity_id as another entity, but this one is a code name or parenthetical name
        if not canonical:
            ent_id = props.get("entity_id") or props.get("Entity ID") or props.get("identifier") or props.get("code")
            if ent_id and str(ent_id).strip().upper() in code_to_canonical:
                can_candidate = code_to_canonical[str(ent_id).strip().upper()]
                if str(can_candidate["_id"]) != str(ent["_id"]):
                    if is_code_name(name) or extract_parenthetical_code(name) or not is_code_name(can_candidate.get("name", "")):
                        canonical = can_candidate

        # Check D: Duplicate by exact normalized or cleaned name
        if not canonical:
            clean_key = clean_entity_name(name).lower().strip()
            norm_key = (ent.get("normalizedName") or name.lower()).strip()
            for key in [clean_key, norm_key]:
                if key and key in name_to_canonical:
                    can_candidate = name_to_canonical[key]
                    if str(can_candidate["_id"]) != str(ent["_id"]):
                        canonical = can_candidate
                        break

        if canonical and str(canonical["_id"]) not in merged_ids:
            c_id_str = str(canonical["_id"])
            d_id_str = str(ent["_id"])

            can_props = canonical.get("properties", {}) or {}
            dup_props = ent.get("properties", {}) or {}
            merged_props = {**dup_props, **can_props}
            
            aliases = list(can_props.get("aliases", []))
            for a_cand in [name, ent.get("name", "")]:
                if a_cand and a_cand not in aliases and a_cand.lower() != canonical.get("name", "").lower():
                    aliases.append(a_cand)
            merged_props["aliases"] = aliases

            p_code = extract_parenthetical_code(name) or extract_parenthetical_code(canonical.get("name", ""))
            if is_code_name(name) and not merged_props.get("entity_id"):
                merged_props["entity_id"] = name_clean
            elif p_code and not merged_props.get("entity_id"):
                merged_props["entity_id"] = p_code

            # Determine best canonical name: clean name without parenthetical codes or raw IDs
            best_name = canonical.get("name", "")
            if (is_code_name(best_name) or extract_parenthetical_code(best_name)) and not is_code_name(name) and not extract_parenthetical_code(name):
                best_name = name
            elif extract_parenthetical_code(best_name):
                best_name = clean_entity_name(best_name)

            # Determine best description
            can_desc = str(canonical.get("description") or can_props.get("description") or "").strip()
            dup_desc = str(ent.get("description") or dup_props.get("description") or "").strip()
            best_desc = can_desc
            if (not can_desc or "identified in case evidence" in can_desc.lower()) and dup_desc:
                best_desc = dup_desc
            elif dup_desc and "involvement:" in dup_desc.lower() and "involvement:" not in can_desc.lower():
                best_desc = f"{can_desc} {dup_desc}".strip()

            if best_desc:
                merged_props["description"] = best_desc

            higher_risk = max(float(canonical.get("risk_score", 0.0)), float(ent.get("risk_score", 0.0)))

            update_dict = {
                "name": best_name,
                "normalizedName": best_name.lower().strip(),
                "properties": merged_props,
                "risk_score": higher_risk,
                "updated_at": datetime.utcnow()
            }
            if best_desc:
                update_dict["description"] = best_desc

            await db["entities"].update_one(
                {"_id": canonical["_id"]},
                {"$set": update_dict}
            )

            # Rewire relationships
            await db["relationships"].update_many(
                {"$or": [{"case_id": case_id}, {"caseId": case_id}], "source_entity_id": d_id_str},
                {"$set": {"source_entity_id": c_id_str}}
            )
            await db["relationships"].update_many(
                {"$or": [{"case_id": case_id}, {"caseId": case_id}], "target_entity_id": d_id_str},
                {"$set": {"target_entity_id": c_id_str}}
            )

            # Rewire pending relationships
            await db["pending_relationships"].update_many(
                {"$or": [{"case_id": case_id}, {"caseId": case_id}], "source_ref": ent.get("name")},
                {"$set": {"source_ref": canonical.get("name")}}
            )
            await db["pending_relationships"].update_many(
                {"$or": [{"case_id": case_id}, {"caseId": case_id}], "target_ref": ent.get("name")},
                {"$set": {"target_ref": canonical.get("name")}}
            )

            # Delete the duplicate entity
            await db["entities"].delete_one({"_id": ent["_id"]})
            merged_ids.add(d_id_str)
            merged_count += 1

    # 3. Clean up self-loops and duplicate edges in relationships
    await db["relationships"].delete_many({
        "$or": [{"case_id": case_id}, {"caseId": case_id}],
        "$expr": {"$eq": ["$source_entity_id", "$target_entity_id"]}
    })

    case_rels = await db["relationships"].find({"$or": [{"case_id": case_id}, {"caseId": case_id}]}).to_list(2000)
    seen_edges = set()
    for rel in case_rels:
        edge_key = (str(rel.get("source_entity_id")), str(rel.get("target_entity_id")), str(rel.get("type")))
        if edge_key in seen_edges:
            await db["relationships"].delete_one({"_id": rel["_id"]})
        else:
            seen_edges.add(edge_key)

    if merged_count > 0 or deleted_files > 0:
        print(f"[ENTITY_MERGER] Merged {merged_count} duplicate entities and removed {deleted_files} file nodes for case {case_id}")

    return merged_count

def generate_entity_involvement(ent: Dict[str, Any], outgoing_rels: List[Dict[str, Any]], incoming_rels: List[Dict[str, Any]], ent_map: Dict[str, str]) -> str:
    ent_type = str(ent.get("type", "UNKNOWN")).upper()
    props = ent.get("properties", {}) or {}
    base_desc = props.get("raw_description") or ent.get("description") or props.get("description") or props.get("Role / Description") or props.get("role") or props.get("notes") or ""
    base_desc = str(base_desc).strip()
    if "involvement:" in base_desc.lower():
        base_desc = re.split(r'\s*\.?\s*involvement:\s*', base_desc, flags=re.IGNORECASE)[0].strip()
    if base_desc.lower() in ["nan", "none", "-", "null", ""]:
        base_desc = ""

    phrases = []

    # Analyze outgoing actions
    for r in outgoing_rels[:3]:
        rtype = str(r.get("type", "")).strip().lower()
        t_id = str(r.get("target_entity_id", ""))
        t_name = ent_map.get(t_id, "")
        if rtype and t_name:
            if "communicat" in rtype or "contact" in rtype:
                phrases.append(f"communicates with {t_name}")
            elif "control" in rtype:
                phrases.append(f"controls {t_name}")
            elif "work" in rtype:
                phrases.append(f"works for {t_name}")
            elif "partner" in rtype:
                phrases.append(f"partners with {t_name}")
            elif "associat" in rtype:
                phrases.append(f"associated with {t_name}")
            elif "visit" in rtype:
                phrases.append(f"visited {t_name}")
            elif "locat" in rtype:
                phrases.append(f"located at {t_name}")
            elif "operat" in rtype:
                phrases.append(f"operates in {t_name}")
            elif "link" in rtype:
                phrases.append(f"linked to {t_name}")
            elif "consult" in rtype:
                phrases.append(f"consults for {t_name}")
            elif "initiat" in rtype or "transfer" in rtype:
                phrases.append(f"initiates transfer to {t_name}")
            elif "paid" in rtype or "pay" in rtype:
                phrases.append(f"payment to {t_name}")
            elif "use" in rtype:
                phrases.append(f"uses {t_name}")
            else:
                phrases.append(f"{rtype.replace('_', ' ')} {t_name}")

    # Analyze incoming actions
    for r in incoming_rels[:2]:
        rtype = str(r.get("type", "")).strip().lower()
        s_id = str(r.get("source_entity_id", ""))
        s_name = ent_map.get(s_id, "")
        if rtype and s_name:
            if "control" in rtype:
                phrases.append(f"controlled by {s_name}")
            elif "communicat" in rtype or "contact" in rtype:
                phrases.append(f"contacted by {s_name}")
            elif "work" in rtype:
                phrases.append(f"employs {s_name}")
            elif "partner" in rtype:
                phrases.append(f"partnered with {s_name}")
            elif "associat" in rtype:
                phrases.append(f"associated with {s_name}")
            elif "visit" in rtype:
                phrases.append(f"visited by {s_name}")
            elif "locat" in rtype:
                phrases.append(f"premises of {s_name}")
            elif "operat" in rtype:
                phrases.append(f"operational hub for {s_name}")
            elif "link" in rtype:
                phrases.append(f"linked to {s_name}")
            elif "consult" in rtype:
                phrases.append(f"consulted by {s_name}")
            elif "initiat" in rtype:
                phrases.append(f"initiated by {s_name}")
            elif "transfer" in rtype:
                phrases.append(f"received transfer from {s_name}")
            elif "paid" in rtype or "pay" in rtype:
                phrases.append(f"received payment from {s_name}")
            elif "use" in rtype:
                phrases.append(f"utilized by {s_name}")
            else:
                phrases.append(f"connected with {s_name} ({rtype.replace('_', ' ')})")

    seen = set()
    unique_phrases = []
    for p in phrases:
        p_clean = p.strip()
        if p_clean and p_clean.lower() not in seen:
            seen.add(p_clean.lower())
            unique_phrases.append(p_clean)

    involvement_str = "; ".join(unique_phrases[:3])

    if base_desc and involvement_str:
        if not base_desc.endswith("."):
            base_desc += "."
        desc = f"{base_desc} Involvement: {involvement_str}."
    elif involvement_str:
        desc = f"{ent_type.capitalize()} entity. Involvement: {involvement_str}."
    elif base_desc:
        desc = f"{base_desc} identified in case evidence."
    else:
        desc = f"Key {ent_type.lower()} entity identified in case records."

    return desc

async def sync_entity_involvement_descriptions(db, case_id: str) -> int:
    """
    Synthesizes and updates 1-2 line involvement descriptions for all entities in a case.
    Runs dynamically for any uploaded case file.
    """
    if not case_id:
        return 0

    entities_cursor = db["entities"].find({"$or": [{"case_id": case_id}, {"caseId": case_id}]})
    entities = await entities_cursor.to_list(length=1000)
    if not entities:
        return 0

    ent_map = {str(e["_id"]): e.get("name", "Unknown") for e in entities}
    rels_cursor = db["relationships"].find({"$or": [{"case_id": case_id}, {"caseId": case_id}]})
    relationships = await rels_cursor.to_list(length=2000)

    updated_count = 0
    for ent in entities:
        ent_id = str(ent["_id"])
        out_r = [r for r in relationships if str(r.get("source_entity_id")) == ent_id]
        in_r = [r for r in relationships if str(r.get("target_entity_id")) == ent_id]
        
        involvement_desc = generate_entity_involvement(ent, out_r, in_r, ent_map)
        
        current_desc = ent.get("description", "")
        if current_desc != involvement_desc:
            await db["entities"].update_one(
                {"_id": ent["_id"]},
                {"$set": {
                    "description": involvement_desc,
                    "properties.description": involvement_desc,
                    "updated_at": datetime.utcnow()
                }}
            )
            updated_count += 1

    if updated_count > 0:
        print(f"[REL_RESOLVER] Updated involvement descriptions for {updated_count} entities in case {case_id}")
    return updated_count

