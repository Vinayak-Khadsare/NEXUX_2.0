from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from typing import List
from app.schemas.evidence import EvidenceCreate, EvidenceOut
from app.core.database import get_database
from app.api.routes.auth import get_current_user
from bson import ObjectId
from app.services.file_ingestion_service import ingest_file
from app.services.document_extraction_service import extract_text_from_file
from app.services.rag_service import index_document

router = APIRouter()

from bson import ObjectId

async def process_evidence_text_background(db, file_path: str, filename: str, case_id: str, evidence_id: str, current_user_email: str = "system"):
    try:
        from app.services.document_extraction_service import extract_text_from_file
        from app.services.rag_service import index_document
        from app.ai.entity_extraction import extract_entities_and_relationships
        from app.services.data_processing.pipeline import process_entity_data
        from datetime import datetime
        import re
        
        import os
        ext = os.path.splitext(filename)[1].lower()
        is_structured = False
        structured_text_preview = ""
        entities_created = 0
        relationships_created = 0
        timeline_events_created = 0
        
        def norm_col(c: str) -> str:
            s = str(c).strip().lower().replace(" ", "_").replace("/", "_").replace("-", "_")
            while "__" in s:
                s = s.replace("__", "_")
            return s.strip("_")

        def parse_risk_score(val) -> float:
            if val is None:
                return 0.0
            s = str(val).strip().lower()
            if s in ["critical", "severe"]:
                return 0.95
            elif s in ["high", "elevated"]:
                return 0.8
            elif s in ["medium", "moderate"]:
                return 0.5
            elif s in ["low", "minimal"]:
                return 0.2
            try:
                f = float(s)
                if f > 1.0 and f <= 10.0:
                    return f / 10.0
                elif f > 10.0 and f <= 100.0:
                    return f / 100.0
                return max(0.0, min(1.0, f))
            except (ValueError, TypeError):
                return 0.0

        # 1. Attempt structured schema detection
        if ext in [".csv", ".json"]:
            try:
                import pandas as pd
                if ext == ".csv":
                    try:
                        df = pd.read_csv(file_path, encoding="utf-8")
                    except UnicodeDecodeError:
                        df = pd.read_csv(file_path, encoding="latin-1")
                else:
                    df = pd.read_json(file_path)
                
                parsed_data = df.to_dict(orient="records")
                if parsed_data and isinstance(parsed_data, list) and len(parsed_data) > 0:
                    raw_columns = list(parsed_data[0].keys())
                    col_map = {norm_col(c): c for c in raw_columns}
                    
                    # Fuzzy / dynamic schema classification
                    src_key = next((col_map[k] for k in ["source", "source_id", "from", "src", "origin", "source_entity", "source_ref"] if k in col_map), None)
                    tgt_key = next((col_map[k] for k in ["target", "target_id", "to", "tgt", "destination", "target_entity", "target_ref"] if k in col_map), None)
                    rel_type_key = next((col_map[k] for k in ["relationship", "relationship_type", "type", "relation", "link_type", "predicate", "connection"] if k in col_map), None)
                    
                    date_key = next((col_map[k] for k in ["date", "time", "timestamp", "datetime", "date_time", "event_time", "date_occurred", "time_stamp"] if k in col_map), None)
                    event_key = next((col_map[k] for k in ["event", "activity", "incident", "description", "action", "message", "event_description", "summary", "log"] if k in col_map), None)

                    id_key = next((col_map[k] for k in ["entity_id", "location_id", "id", "identifier", "entity", "code", "node_id"] if k in col_map), None)
                    name_key = next((col_map[k] for k in ["name", "location_name", "name_identifier", "entity_name", "title", "label", "full_name", "subject"] if k in col_map), None)
                    type_key = next((col_map[k] for k in ["type", "category", "classification", "entity_type", "kind", "role"] if k in col_map), None)
                    risk_key = next((col_map[k] for k in ["risk", "risk_score", "threat_score", "threat_level", "risk_level", "priority"] if k in col_map), None)
                    desc_key = next((col_map[k] for k in ["description", "role_description", "desc", "role", "summary", "notes", "details", "involvement", "activity", "bio", "about", "context", "remarks"] if k in col_map), None)

                    is_rel_schema = bool(src_key and tgt_key)
                    is_timeline_schema = bool(not is_rel_schema and date_key and event_key)
                    is_entity_schema = bool(not is_rel_schema and not is_timeline_schema and (
                        (name_key and type_key) or
                        (id_key and type_key) or
                        (id_key and name_key) or
                        ("entit" in filename.lower()) or
                        ("locat" in filename.lower()) or
                        (id_key and "location" in id_key)
                    ))

                    alert_id_key = next((col_map[k] for k in ["alert_id", "alert", "alert_code"] if k in col_map), None)
                    alert_type_key = next((col_map[k] for k in ["alert_type", "severity", "threat_level"] if k in col_map), None)
                    is_alert_schema = bool(not is_rel_schema and not is_timeline_schema and not is_entity_schema and (alert_id_key or ("alert" in filename.lower() and alert_type_key)))

                    from app.services.relationship_resolver import find_entity, infer_type_from_id

                    if is_rel_schema:
                        is_structured = True
                        rel_col = rel_type_key if rel_type_key else "type"
                        for record in parsed_data:
                            try:
                                src_val = record.get(src_key)
                                tgt_val = record.get(tgt_key)
                                if not src_val or not tgt_val or str(src_val).lower() == "nan" or str(tgt_val).lower() == "nan":
                                    continue
                                src_val = str(src_val).strip()
                                tgt_val = str(tgt_val).strip()

                                rel_type = str(record.get(rel_col, "CONNECTED_TO")).upper().strip()
                                properties = {k: v for k, v in record.items() if k not in [src_key, tgt_key, rel_col, "case_id"] and str(v).lower() != "nan"}

                                src_ent = await find_entity(db, case_id, src_val)
                                tgt_ent = await find_entity(db, case_id, tgt_val)

                                if src_ent and tgt_ent and str(src_ent["_id"]) != str(tgt_ent["_id"]):
                                    existing_rel = await db["relationships"].find_one({
                                        "$or": [{"case_id": case_id}, {"caseId": case_id}],
                                        "source_entity_id": str(src_ent["_id"]),
                                        "target_entity_id": str(tgt_ent["_id"]),
                                        "type": rel_type
                                    })
                                    if not existing_rel:
                                        rel_doc = {
                                            "case_id": case_id, "caseId": case_id,
                                            "source_entity_id": str(src_ent["_id"]),
                                            "target_entity_id": str(tgt_ent["_id"]),
                                            "type": rel_type, "properties": properties,
                                            "evidence_ids": [evidence_id],
                                            "source": "STRUCTURED_IMPORT",
                                            "created_by": current_user_email,
                                            "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()
                                        }
                                        await db["relationships"].insert_one(rel_doc)
                                        relationships_created += 1
                                else:
                                    pending_doc = {
                                        "case_id": case_id, "caseId": case_id,
                                        "source_ref": src_val, "target_ref": tgt_val,
                                        "type": rel_type, "properties": properties,
                                        "evidence_id": evidence_id, "created_by": current_user_email,
                                        "status": "PENDING", "created_at": datetime.utcnow()
                                    }
                                    await db["pending_relationships"].insert_one(pending_doc)
                            except Exception as row_e:
                                print(f"Skipping invalid relationship row: {row_e}")
                                continue

                    elif is_timeline_schema:
                        is_structured = True
                        time_key = next((col_map[k] for k in ["time", "event_time", "time_stamp"] if k in col_map and col_map[k] != date_key), None)
                        tl_type_key = next((col_map[k] for k in ["type", "category", "event_type"] if k in col_map), None)
                        
                        for record in parsed_data:
                            try:
                                date_val = record.get(date_key)
                                if not date_val or str(date_val).lower() == "nan":
                                    continue
                                date_str = str(date_val).strip()

                                if time_key and record.get(time_key) and str(record.get(time_key)).lower() != "nan":
                                    timestamp_str = f"{date_str} {str(record.get(time_key)).strip()}".strip()
                                else:
                                    timestamp_str = date_str

                                event_val = record.get(event_key, "Investigation Event")
                                event_title = str(event_val).strip() if event_val and str(event_val).lower() != "nan" else "Event"
                                event_type = str(record.get(tl_type_key, "EVENT")).upper() if tl_type_key and record.get(tl_type_key) else "EVENT"
                                properties = {k: v for k, v in record.items() if k not in [date_key, time_key, event_key, tl_type_key, "case_id"] and str(v).lower() != "nan"}

                                existing_tl = await db["timeline"].find_one({
                                    "$or": [{"case_id": case_id}, {"caseId": case_id}],
                                    "timestamp": timestamp_str,
                                    "title": event_title
                                })
                                if not existing_tl:
                                    tl_doc = {
                                        "case_id": case_id, "caseId": case_id,
                                        "timestamp": timestamp_str,
                                        "title": event_title,
                                        "description": event_title,
                                        "message": event_title,
                                        "type": event_type,
                                        "category": "TIMELINE",
                                        "properties": properties,
                                        "evidence_ids": [evidence_id],
                                        "source": "STRUCTURED_IMPORT",
                                        "created_by": current_user_email,
                                        "created_at": datetime.utcnow()
                                    }
                                    await db["timeline"].insert_one(tl_doc)
                                    timeline_events_created += 1
                            except Exception as row_e:
                                print(f"Skipping invalid timeline row: {row_e}")
                                continue

                    elif is_entity_schema:
                        is_structured = True
                        for record in parsed_data:
                            try:
                                val_name = record.get(name_key) if name_key else record.get(id_key)
                                if not val_name or str(val_name).lower() == "nan":
                                    continue
                                val_name = str(val_name).strip()

                                val_id = str(record.get(id_key)).strip() if id_key and record.get(id_key) and str(record.get(id_key)).lower() != "nan" else None

                                val_type = "PERSON"
                                if "locat" in filename.lower() or (id_key and "location" in str(id_key).lower()) or "latitude" in col_map or (val_id and str(val_id).upper().startswith("L")):
                                    val_type = "LOCATION"
                                elif type_key and record.get(type_key) and str(record.get(type_key)).lower() != "nan":
                                    val_type = str(record.get(type_key)).strip().upper()
                                elif val_id:
                                    inferred = infer_type_from_id(val_id)
                                    if inferred:
                                        val_type = inferred

                                risk_score = parse_risk_score(record.get(risk_key)) if risk_key else 0.0

                                properties = {k: v for k, v in record.items() if k not in [name_key, type_key, "case_id"] and str(v).lower() != "nan"}
                                if val_id:
                                    properties["entity_id"] = val_id
                                    properties["identifier"] = val_id

                                if "latitude" in record and "longitude" in record:
                                    try:
                                        properties["latitude"] = float(record["latitude"])
                                        properties["longitude"] = float(record["longitude"])
                                    except Exception:
                                        pass

                                val_desc = ""
                                if desc_key and record.get(desc_key) and str(record.get(desc_key)).lower() != "nan":
                                    val_desc = str(record.get(desc_key)).strip()
                                elif record.get("description") and str(record.get("description")).lower() != "nan":
                                    val_desc = str(record.get("description")).strip()
                                elif record.get("role") and str(record.get("role")).lower() != "nan":
                                    val_desc = str(record.get("role")).strip()

                                if val_desc:
                                    properties["description"] = val_desc

                                ent_doc = {
                                    "case_id": case_id, "caseId": case_id,
                                    "type": val_type, "name": val_name,
                                    "description": val_desc,
                                    "properties": properties,
                                    "risk_score": risk_score,
                                    "created_by": current_user_email,
                                    "created_at": datetime.utcnow(), "updated_at": datetime.utcnow(),
                                    "source": "STRUCTURED_IMPORT"
                                }
                                processed_ent = await process_entity_data(db, ent_doc, case_id, mode="APPLY")
                                norm_name = processed_ent.get("normalizedName") or val_name.lower().strip()

                                or_queries = [{"normalizedName": norm_name}]
                                if val_id:
                                    or_queries.append({"properties.entity_id": val_id})
                                    or_queries.append({"entity_id": val_id})
                                    or_queries.append({"normalizedName": val_id.lower().strip()})
                                    or_queries.append({"name": {"$regex": f"^{re.escape(val_id)}$", "$options": "i"}})

                                existing = await db["entities"].find_one({
                                    "$and": [
                                        {"$or": [{"case_id": case_id}, {"caseId": case_id}]},
                                        {"$or": or_queries}
                                    ]
                                })
                                if not existing:
                                    await db["entities"].insert_one(processed_ent)
                                    entities_created += 1
                                else:
                                    from app.services.relationship_resolver import is_code_name
                                    merged_props = {**existing.get("properties", {}), **properties}
                                    update_fields = {"properties": merged_props, "updated_at": datetime.utcnow()}
                                    if is_code_name(existing.get("name", "")) and not is_code_name(val_name):
                                        update_fields["name"] = val_name
                                        update_fields["normalizedName"] = val_name.lower().strip()
                                    if val_desc and not existing.get("description"):
                                        update_fields["description"] = val_desc
                                    await db["entities"].update_one(
                                        {"_id": existing["_id"]},
                                        {"$set": update_fields}
                                    )
                            except Exception as row_e:
                                print(f"Skipping invalid entity row: {row_e}")
                                continue

                    elif is_alert_schema:
                        is_structured = True
                        for record in parsed_data:
                            try:
                                a_ent = str(record.get("entity_id", record.get("entity", ""))).strip()
                                a_type = str(record.get("alert_type", record.get("type", "ANOMALY"))).strip().upper()
                                a_sev = str(record.get("severity", "MEDIUM")).strip().upper()
                                a_msg = str(record.get("message", record.get("description", "System Alert"))).strip()
                                a_status = str(record.get("status", "ACTIVE")).strip().upper()
                                if a_status == "NEW":
                                    a_status = "ACTIVE"
                                
                                alert_doc = {
                                    "case_id": case_id,
                                    "caseId": case_id,
                                    "entity_id": a_ent,
                                    "type": a_type,
                                    "severity": a_sev,
                                    "message": a_msg,
                                    "status": a_status,
                                    "properties": {k: v for k, v in record.items() if str(v).lower() != "nan"},
                                    "created_by": current_user_email,
                                    "created_at": datetime.utcnow()
                                }
                                await db["alerts"].insert_one(alert_doc)
                            except Exception as alt_err:
                                print(f"Skipping invalid alert row: {alt_err}")
                                continue

                    if is_structured:
                        structured_text_preview = str(parsed_data)[:5000]
            except Exception as schema_e:
                print(f"Schema detection failed: {schema_e}")
                
        # 2. Extract Text
        if is_structured:
            extracted_text = structured_text_preview
            status = "SUCCESS"
        else:
            extracted_text = await extract_text_from_file(file_path, filename)
            
            if extracted_text == "UNSUPPORTED_MEDIA":
                status = "NOT_EXTRACTABLE"
                extracted_text = ""
            else:
                status = "SUCCESS" if extracted_text and not extracted_text.startswith("Error") else "FAILED"

        if status == "SUCCESS":
            try:
                import asyncio
                await asyncio.to_thread(index_document, case_id, evidence_id, extracted_text)
            except Exception as rag_err:
                print(f"[RAG_WARN] Vector index document non-fatal error: {rag_err}")
            
            if not is_structured:
                try:
                    ai_results = await extract_entities_and_relationships(extracted_text)
                    if "error" not in ai_results or ai_results.get("entities"):
                        entity_name_to_id = {}
                        
                        for ent in ai_results.get("entities", []):
                            ent_name = ent.get("name", "").strip()
                            if not ent_name: continue
                            
                            # Filter out file names like 01_entities.csv, README.txt, etc.
                            if re.search(r'\.(csv|tsv|json|txt|docx?|pdf|zip)$', ent_name, re.I):
                                continue

                            ent_type = str(ent.get("type", "PERSON")).upper()
                            val_ai_desc = ent.get("description", "").strip()
                            
                            # Check if entity already exists in this case by name, ID code, or alias
                            existing = await find_entity(db, case_id, ent_name, ent_type)
                            norm_name = ent_name.lower().strip()
                            
                            if not existing:
                                ent_doc = {
                                    "case_id": case_id,
                                    "type": ent_type,
                                    "name": ent_name,
                                    "description": val_ai_desc,
                                    "properties": {"description": val_ai_desc},
                                    "risk_score": float(ent.get("risk_score", 0.0)),
                                    "source": "AI_EXTRACTED",
                                    "created_by": current_user_email,
                                    "created_at": datetime.utcnow(),
                                    "updated_at": datetime.utcnow()
                                }
                                processed_ent = await process_entity_data(db, ent_doc, case_id, mode="APPLY")
                                res = await db["entities"].insert_one(processed_ent)
                                entity_name_to_id[ent_name.lower()] = str(res.inserted_id)
                                entity_name_to_id[norm_name] = str(res.inserted_id)
                                entities_created += 1
                            else:
                                entity_name_to_id[ent_name.lower()] = str(existing["_id"])
                                entity_name_to_id[norm_name] = str(existing["_id"])
                                if val_ai_desc and not existing.get("description"):
                                    await db["entities"].update_one(
                                        {"_id": existing["_id"]},
                                        {"$set": {"description": val_ai_desc, "properties.description": val_ai_desc, "updated_at": datetime.utcnow()}}
                                    )
    
                        for rel in ai_results.get("relationships", []):
                            raw_source = rel.get("source", "").strip()
                            raw_target = rel.get("target", "").strip()
                            if not raw_source or not raw_target:
                                continue
                            if re.search(r'\.(csv|tsv|json|txt|docx?|pdf|zip)$', raw_source, re.I) or re.search(r'\.(csv|tsv|json|txt|docx?|pdf|zip)$', raw_target, re.I):
                                continue

                            source_name = re.sub(r'\s+', ' ', raw_source).strip().lower()
                            target_name = re.sub(r'\s+', ' ', raw_target).strip().lower()
                            
                            source_id = entity_name_to_id.get(source_name)
                            target_id = entity_name_to_id.get(target_name)
                            
                            if not source_id:
                                s_doc = await find_entity(db, case_id, raw_source)
                                if s_doc: source_id = str(s_doc["_id"])
                                
                            if not target_id:
                                t_doc = await find_entity(db, case_id, raw_target)
                                if t_doc: target_id = str(t_doc["_id"])
                            
                            if source_id and target_id and source_id != target_id:
                                rel_type = str(rel.get("type", "ASSOCIATED_WITH")).upper()
                                existing_rel = await db["relationships"].find_one({
                                    "$or": [{"case_id": case_id}, {"caseId": case_id}],
                                    "source_entity_id": source_id,
                                    "target_entity_id": target_id,
                                    "type": rel_type
                                })
                                if not existing_rel:
                                    rel_doc = {
                                        "case_id": case_id,
                                        "caseId": case_id,
                                        "source_entity_id": source_id,
                                        "target_entity_id": target_id,
                                        "type": rel_type,
                                        "properties": {"description": rel.get("description", "")},
                                        "evidence_ids": [evidence_id],
                                        "source": "AI_EXTRACTED",
                                        "created_by": current_user_email,
                                        "created_at": datetime.utcnow(),
                                        "updated_at": datetime.utcnow()
                                    }
                                    await db["relationships"].insert_one(rel_doc)
                                    relationships_created += 1
    
                except Exception as ai_e:
                    print(f"AI Extraction during evidence background task failed: {ai_e}")

        await db["evidence"].update_one(
            {"_id": ObjectId(evidence_id)},
            {"$set": {
                "raw_content": extracted_text,
                "processing_status": "COMPLETED",
                "extraction_status": status
            }}
        )
        print(f"[EVIDENCE_BG] Evidence {evidence_id} processed. Entities created: {entities_created}, Relationships created: {relationships_created}, Timeline created: {timeline_events_created}")
        
        # Automatically resolve any pending relationships or ID references across this case
        try:
            from app.services.relationship_resolver import resolve_case_relationships, sync_entity_involvement_descriptions
            resolved_count = await resolve_case_relationships(db, case_id)
            if resolved_count > 0:
                print(f"[EVIDENCE_BG] Automatic resolution linked {resolved_count} relationships for case {case_id}")
            await sync_entity_involvement_descriptions(db, case_id)
        except Exception as res_err:
            print(f"[EVIDENCE_BG] Post-processing relationship resolver warning: {res_err}")
        
    except asyncio.CancelledError:
        print(f"[EVIDENCE_BG] Background extraction cancelled by system/fastapi for {evidence_id}")
        await db["evidence"].update_one(
            {"_id": ObjectId(evidence_id)},
            {"$set": {
                "processing_status": "COMPLETED",
                "extraction_status": "CLIENT_DISCONNECTED"
            }}
        )
    except Exception as e:
        print(f"Background extraction failed: {e}")
        status_msg = "LOCAL_AI_ERROR" if "LOCAL_AI" in str(e) else "PROCESSING_FAILED"
        await db["evidence"].update_one(
            {"_id": ObjectId(evidence_id)},
            {"$set": {
                "processing_status": "COMPLETED",
                "extraction_status": status_msg
            }}
        )

@router.post("", response_model=EvidenceOut, include_in_schema=False)
@router.post("/", response_model=EvidenceOut)
async def create_evidence(evidence: EvidenceCreate, db=Depends(get_database), current_user=Depends(get_current_user)):
    ev_dict = evidence.dict()
    ev_dict["created_by"] = current_user["email"]
    from datetime import datetime
    ev_dict["created_at"] = datetime.utcnow()
    
    result = await db["evidence"].insert_one(ev_dict)
    created_ev = await db["evidence"].find_one({"_id": result.inserted_id})
    return created_ev

from app.api.dependencies import verify_case_access

@router.post("/upload", response_model=EvidenceOut)
async def upload_evidence(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    case_id: str = Form(...),
    title: str = Form(...),
    db=Depends(get_database),
    current_user=Depends(get_current_user)
):
    await verify_case_access(case_id, db, current_user)
    # 1. Ingest File
    file_path, content_type, size = await ingest_file(file, case_id)
    
    # 2. Create Initial Evidence Record
    from datetime import datetime
    ev_dict = {
        "case_id": case_id,
        "title": title,
        "source_type": "FILE",
        "file_type": content_type,
        "file_path": file_path,
        "raw_content": "Processing in background...",
        "processing_status": "PROCESSING",
        "extraction_status": "PENDING",
        "created_by": current_user["email"],
        "created_at": datetime.utcnow()
    }
    
    result = await db["evidence"].insert_one(ev_dict)
    evidence_id = str(result.inserted_id)
    
    # 3. Add Background Task
    background_tasks.add_task(
        process_evidence_text_background,
        db, file_path, file.filename, case_id, evidence_id, current_user["email"]
    )
    
    created_ev = await db["evidence"].find_one({"_id": result.inserted_id})
    return created_ev

@router.get("", response_model=List[EvidenceOut])
@router.get("/", response_model=List[EvidenceOut], include_in_schema=False)
@router.get("/case/{case_id}", response_model=List[EvidenceOut], include_in_schema=False)
async def get_case_evidence(
    case_id: str, 
    db=Depends(get_database), 
    current_user=Depends(get_current_user)
):
    await verify_case_access(case_id, db, current_user)
    cursor = db["evidence"].find({"$or": [{"case_id": case_id}, {"caseId": case_id}]})
    evidence_list = await cursor.to_list(length=200)
    return evidence_list

@router.get("/{evidence_id}", response_model=EvidenceOut)
async def get_evidence(evidence_id: str, db=Depends(get_database), current_user=Depends(get_current_user)):
    try:
        ev = await db["evidence"].find_one({"_id": ObjectId(evidence_id)})
    except:
        raise HTTPException(status_code=400, detail="Invalid Evidence ID")
    
    if not ev:
        raise HTTPException(status_code=404, detail="Evidence not found")
        
    await verify_case_access(str(ev.get("case_id")), db, current_user)
    return ev

@router.post("/case/{case_id}/reprocess")
async def reprocess_case_evidence(
    case_id: str,
    background_tasks: BackgroundTasks,
    db=Depends(get_database),
    current_user=Depends(get_current_user)
):
    await verify_case_access(case_id, db, current_user)
    ev_list = await db["evidence"].find({"$or": [{"case_id": case_id}, {"caseId": case_id}]}).to_list(length=100)
    # Process structured files first (entities/locations then relationships/timeline)
    def priority(ev):
        t = (ev.get("title") or "").lower()
        if "entit" in t or "locat" in t:
            return 0
        if "relat" in t or "edge" in t or "link" in t:
            return 1
        if "time" in t:
            return 2
        return 3

    sorted_ev = sorted(ev_list, key=priority)
    for ev in sorted_ev:
        file_path = ev.get("file_path", "")
        filename = ev.get("title", "")
        ev_id = str(ev["_id"])
        background_tasks.add_task(
            process_evidence_text_background,
            db, file_path, filename, case_id, ev_id, current_user.get("email", "system")
        )
    return {"message": f"Reprocessing scheduled for {len(sorted_ev)} evidence files in case {case_id}"}

