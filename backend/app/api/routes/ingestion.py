from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from typing import List, Any, Optional, Dict
from app.core.database import get_database
from app.api.routes.auth import get_current_user
from app.ingestion.parsers import parse_csv, parse_json, parse_txt, parse_pdf, parse_docx, parse_image
from app.services.rag_service import index_document
from datetime import datetime
from pydantic import BaseModel
from app.services.data_processing.pipeline import process_entity_data
from app.services.relationship_resolver import (
    find_entity,
    is_code_name,
    is_file_name,
    merge_case_duplicate_entities,
    resolve_case_relationships,
    sync_entity_involvement_descriptions
)

router = APIRouter()

async def process_file_background(db, case_id: str, contents: bytes, filename: str, current_user: dict, evidence_id: str):
    parsed_data = None
    is_supported_format = True
    try:
        if filename.endswith(".csv"):
            parsed_data = await parse_csv(contents)
        elif filename.endswith(".json"):
            parsed_data = await parse_json(contents)
        elif filename.endswith(".txt"):
            parsed_data = {"text": await parse_txt(contents)}
        elif filename.endswith(".pdf"):
            parsed_data = {"text": await parse_pdf(contents)}
        elif filename.endswith(".docx") or filename.endswith(".doc"):
            parsed_data = {"text": await parse_docx(contents)}
        elif filename.endswith(".png") or filename.endswith(".jpg") or filename.endswith(".jpeg") or filename.endswith(".webp"):
            parsed_data = {"text": await parse_image(contents)}
        else:
            is_supported_format = False
            parsed_data = {"text": "Binary file or unsupported format. No automated intelligence extraction available."}
    except Exception as e:
        is_supported_format = False
        parsed_data = {"text": f"Failed to parse file: {str(e)}"}

    # Update evidence record with parsed content now that it's parsed
    raw_content = str(parsed_data)[:5000]
    from bson import ObjectId
    try:
        await db["evidence"].update_one(
            {"_id": ObjectId(evidence_id)},
            {"$set": {"raw_content": raw_content}}
        )
    except Exception as e:
        print("Failed to update evidence content:", e)

    entities_created = 0
    relationships_created = 0
    
    # Auto-extract entities and relationships from CSV/JSON lists of dicts
    if isinstance(parsed_data, list):
        for record in parsed_data:
            if "name" in record and "type" in record:
                val_name = str(record["name"]).strip()
                if not val_name or is_file_name(val_name):
                    continue
                val_type = str(record["type"]).upper()
                val_id = str(record.get("entity_id") or record.get("Entity ID") or record.get("id") or record.get("code") or "").strip()
                val_desc = str(record.get("description") or record.get("Role / Description") or record.get("role") or "").strip()

                entity_doc = {
                    "case_id": case_id,
                    "type": val_type,
                    "name": val_name,
                    "description": val_desc,
                    "properties": {k: v for k, v in record.items() if k not in ["name", "type", "case_id"]},
                    "risk_score": float(record.get("risk_score", 0.0)),
                    "created_by": current_user["email"],
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
                if val_id:
                    entity_doc["properties"]["entity_id"] = val_id

                existing = await find_entity(db, case_id, val_name, val_type)
                if not existing and val_id:
                    existing = await find_entity(db, case_id, val_id, val_type)

                if not existing:
                    processed_ent = await process_entity_data(db, entity_doc, case_id, mode="APPLY")
                    await db["entities"].insert_one(processed_ent)
                    entities_created += 1
                else:
                    merged_props = {**existing.get("properties", {}), **entity_doc["properties"]}
                    update_fields = {"properties": merged_props, "updated_at": datetime.utcnow()}
                    if is_code_name(existing.get("name", "")) and not is_code_name(val_name):
                        update_fields["name"] = val_name
                        update_fields["normalizedName"] = val_name.lower().strip()
                    if val_desc and not existing.get("description"):
                        update_fields["description"] = val_desc
                    await db["entities"].update_one({"_id": existing["_id"]}, {"$set": update_fields})

            elif "source" in record and "target" in record and "type" in record:
                src_name = str(record["source"]).strip()
                tgt_name = str(record["target"]).strip()
                if not src_name or not tgt_name or is_file_name(src_name) or is_file_name(tgt_name):
                    continue

                src_ent = await find_entity(db, case_id, src_name)
                if not src_ent:
                    src_doc = {
                        "case_id": case_id, "type": "PERSON", "name": src_name,
                        "properties": {"entity_id": src_name} if is_code_name(src_name) else {},
                        "risk_score": 0.0, "created_by": current_user["email"],
                        "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()
                    }
                    processed_src = await process_entity_data(db, src_doc, case_id, mode="APPLY")
                    src_res = await db["entities"].insert_one(processed_src)
                    src_ent_id = str(src_res.inserted_id)
                    entities_created += 1
                else:
                    src_ent_id = str(src_ent["_id"])
                    
                tgt_ent = await find_entity(db, case_id, tgt_name)
                if not tgt_ent:
                    tgt_doc = {
                        "case_id": case_id, "type": "PERSON", "name": tgt_name,
                        "properties": {"entity_id": tgt_name} if is_code_name(tgt_name) else {},
                        "risk_score": 0.0, "created_by": current_user["email"],
                        "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()
                    }
                    processed_tgt = await process_entity_data(db, tgt_doc, case_id, mode="APPLY")
                    tgt_res = await db["entities"].insert_one(processed_tgt)
                    tgt_ent_id = str(tgt_res.inserted_id)
                    entities_created += 1
                else:
                    tgt_ent_id = str(tgt_ent["_id"])
                
                if src_ent_id != tgt_ent_id:
                    rel_type = str(record["type"]).upper().strip()
                    existing_rel = await db["relationships"].find_one({
                        "$or": [{"case_id": case_id}, {"caseId": case_id}],
                        "source_entity_id": src_ent_id,
                        "target_entity_id": tgt_ent_id,
                        "type": rel_type
                    })
                    if not existing_rel:
                        rel_doc = {
                            "case_id": case_id, "source_entity_id": src_ent_id,
                            "target_entity_id": tgt_ent_id, "type": rel_type,
                            "properties": {k: v for k, v in record.items() if k not in ["source", "target", "type", "case_id"]},
                            "evidence_ids": [evidence_id], "created_by": current_user["email"],
                            "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()
                        }
                        await db["relationships"].insert_one(rel_doc)
                        relationships_created += 1

    try:
        raw_text = ""
        if isinstance(parsed_data, dict) and "text" in parsed_data:
            raw_text = parsed_data["text"]
        elif isinstance(parsed_data, list):
            import json
            raw_text = json.dumps(parsed_data)
        elif isinstance(parsed_data, str):
            raw_text = parsed_data
            
        if raw_text and is_supported_format:
            index_document(case_id, evidence_id, raw_text)
            try:
                from app.ai.entity_extraction import extract_entities_and_relationships
                ai_results = await extract_entities_and_relationships(raw_text)
                if "error" not in ai_results:
                    entity_name_to_id = {}
                    for ent in ai_results.get("entities", []):
                        ent_name = ent.get("name", "").strip()
                        if not ent_name or is_file_name(ent_name):
                            continue
                        ent_type = str(ent.get("type", "PERSON")).upper()
                        val_ai_desc = ent.get("description", "").strip()
                        
                        existing = await find_entity(db, case_id, ent_name, ent_type)
                        norm_name = ent_name.lower().strip()
                        if existing:
                            entity_name_to_id[ent_name.lower()] = str(existing["_id"])
                            entity_name_to_id[norm_name] = str(existing["_id"])
                            if val_ai_desc and not existing.get("description"):
                                await db["entities"].update_one(
                                    {"_id": existing["_id"]},
                                    {"$set": {"description": val_ai_desc, "properties.description": val_ai_desc, "updated_at": datetime.utcnow()}}
                                )
                        else:
                            ent_doc = {
                                "case_id": case_id, "type": ent_type, "name": ent_name,
                                "description": val_ai_desc,
                                "properties": {"description": val_ai_desc},
                                "risk_score": float(ent.get("risk_score", 0.0)),
                                "source": "AI_EXTRACTED", "created_by": current_user["email"],
                                "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()
                            }
                            processed_ai_ent = await process_entity_data(db, ent_doc, case_id, mode="APPLY")
                            res = await db["entities"].insert_one(processed_ai_ent)
                            entity_name_to_id[ent_name.lower()] = str(res.inserted_id)
                            entity_name_to_id[norm_name] = str(res.inserted_id)
                            entities_created += 1
                            
                    for rel in ai_results.get("relationships", []):
                        raw_source = rel.get("source", "").strip()
                        raw_target = rel.get("target", "").strip()
                        if not raw_source or not raw_target:
                            continue
                        if is_file_name(raw_source) or is_file_name(raw_target):
                            continue

                        source_name = raw_source.lower()
                        target_name = raw_target.lower()
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
                                "target_entity_id": target_id, "type": rel_type
                            })
                            if not existing_rel:
                                rel_doc = {
                                    "case_id": case_id, "source_entity_id": source_id,
                                    "target_entity_id": target_id, "type": rel_type,
                                    "properties": {"description": rel.get("description", "")},
                                    "evidence_ids": [evidence_id], "source": "AI_EXTRACTED",
                                    "created_by": current_user["email"],
                                    "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()
                                }
                                await db["relationships"].insert_one(rel_doc)
                                relationships_created += 1

            except Exception as ai_e:
                print(f"AI Extraction pipeline failed: {ai_e}")

        # Post-processing: Merge duplicate entities, resolve pending relationships, and synchronize involvement descriptions
        try:
            await merge_case_duplicate_entities(db, case_id)
            await resolve_case_relationships(db, case_id)
            await sync_entity_involvement_descriptions(db, case_id)
        except Exception as post_e:
            print(f"Post-processing duplicate merge & relationship resolution failed: {post_e}")
    except Exception as e:
        print(f"Failed to process background tasks: {e}")
        
    print(f"Background processing completed for evidence {evidence_id}. Entities: {entities_created}, Relationships: {relationships_created}")

@router.post("/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    case_id: str = Form(...),
    file: UploadFile = File(...),
    db=Depends(get_database), 
    current_user=Depends(get_current_user)
):
    contents = await file.read()
    filename = file.filename.lower()
    
    ev_dict = {
        "case_id": case_id,
        "title": file.filename,
        "source_type": filename.split(".")[-1].upper(),
        "raw_content": "Processing file in background...",
        "created_by": current_user["email"],
        "created_at": datetime.utcnow(),
    }
    result = await db["evidence"].insert_one(ev_dict)
    
    background_tasks.add_task(
        process_file_background,
        db, case_id, contents, filename, current_user, str(result.inserted_id)
    )
    
    return {
        "message": f"File uploaded and processing in background.",
        "evidence_id": str(result.inserted_id),
        "entities_created": 0,
        "relationships_created": 0
    }

class ImportMappedRequest(BaseModel):
    case_id: str
    import_type: str
    data: List[Dict[str, Any]]
    mappings: Dict[str, str]
    filename: Optional[str] = "dataset.csv"

@router.post("/preview")
async def preview_file(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user)
):
    contents = await file.read()
    filename = file.filename.lower()
    
    parsed_data = None
    is_structured = False
    try:
        if filename.endswith(".csv"):
            parsed_data = await parse_csv(contents)
            is_structured = True
        elif filename.endswith(".json"):
            parsed_data = await parse_json(contents)
            is_structured = True
        elif filename.endswith(".txt"):
            text = await parse_txt(contents)
            parsed_data = [{"text": text[:1000] + ("..." if len(text) > 1000 else "")}]
        elif filename.endswith(".pdf"):
            text = await parse_pdf(contents)
            parsed_data = [{"text": text[:1000] + ("..." if len(text) > 1000 else "")}]
        elif filename.endswith(".docx") or filename.endswith(".doc"):
            text = await parse_docx(contents)
            parsed_data = [{"text": text[:1000] + ("..." if len(text) > 1000 else "")}]
        elif filename.endswith(".png") or filename.endswith(".jpg") or filename.endswith(".jpeg"):
            text = await parse_image(contents)
            parsed_data = [{"text": text[:1000] + ("..." if len(text) > 1000 else "")}]
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format for preview")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")
        
    if not parsed_data:
        raise HTTPException(status_code=400, detail="No data parsed from file")
        
    columns = []
    if is_structured and isinstance(parsed_data, list) and len(parsed_data) > 0:
        columns = list(parsed_data[0].keys())
        
    return {
        "filename": file.filename,
        "columns": columns,
        "preview": parsed_data[:10] if is_structured else parsed_data,
        "total_rows": len(parsed_data) if isinstance(parsed_data, list) else 1,
        "raw_data": parsed_data,
        "is_structured": is_structured
    }

async def process_mapped_import_background(db, case_id: str, import_type: str, data: List[Dict[str, Any]], mappings: Dict[str, str], current_user: dict, evidence_id: str):
    entities_created = 0
    relationships_created = 0
    
    if import_type == "ENTITIES":
        name_key = mappings.get("name")
        type_key = mappings.get("type")
        
        for record in data:
            val_name = str(record.get(name_key) or "").strip()
            if not val_name or is_file_name(val_name):
                continue
            
            val_type = str(record.get(type_key, "PERSON")).upper() if type_key else "PERSON"
            properties = {k: v for k, v in record.items() if k not in [name_key, type_key]}
            val_id = str(record.get("entity_id") or record.get("Entity ID") or record.get("id") or record.get("code") or "").strip()
            if val_id:
                properties["entity_id"] = val_id

            val_desc = str(record.get("description") or record.get("Role / Description") or record.get("role") or "").strip()
            
            entity_doc = {
                "case_id": case_id, "type": val_type, "name": val_name,
                "description": val_desc, "properties": properties,
                "risk_score": float(record.get("risk_score", 0.0)), "created_by": current_user["email"],
                "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()
            }

            existing = await find_entity(db, case_id, val_name, val_type)
            if not existing and val_id:
                existing = await find_entity(db, case_id, val_id, val_type)

            if not existing:
                processed_ent = await process_entity_data(db, entity_doc, case_id, mode="APPLY")
                await db["entities"].insert_one(processed_ent)
                entities_created += 1
            else:
                merged_props = {**existing.get("properties", {}), **properties}
                update_fields = {"properties": merged_props, "updated_at": datetime.utcnow()}
                if is_code_name(existing.get("name", "")) and not is_code_name(val_name):
                    update_fields["name"] = val_name
                    update_fields["normalizedName"] = val_name.lower().strip()
                if val_desc and not existing.get("description"):
                    update_fields["description"] = val_desc
                await db["entities"].update_one({"_id": existing["_id"]}, {"$set": update_fields})
                
    elif import_type == "RELATIONSHIPS":
        src_key = mappings.get("source")
        tgt_key = mappings.get("target")
        type_key = mappings.get("type")
        
        for record in data:
            src_name = str(record.get(src_key) or "").strip()
            tgt_name = str(record.get(tgt_key) or "").strip()
            if not src_name or not tgt_name or is_file_name(src_name) or is_file_name(tgt_name):
                continue
            
            src_ent = await find_entity(db, case_id, src_name)
            if not src_ent:
                src_doc = {
                    "case_id": case_id, "type": "PERSON", "name": src_name,
                    "properties": {"entity_id": src_name} if is_code_name(src_name) else {},
                    "risk_score": 0.0, "created_by": current_user["email"],
                    "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()
                }
                processed_src = await process_entity_data(db, src_doc, case_id, mode="APPLY")
                src_res = await db["entities"].insert_one(processed_src)
                src_ent_id = str(src_res.inserted_id)
                entities_created += 1
            else:
                src_ent_id = str(src_ent["_id"])
                
            tgt_ent = await find_entity(db, case_id, tgt_name)
            if not tgt_ent:
                tgt_doc = {
                    "case_id": case_id, "type": "PERSON", "name": tgt_name,
                    "properties": {"entity_id": tgt_name} if is_code_name(tgt_name) else {},
                    "risk_score": 0.0, "created_by": current_user["email"],
                    "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()
                }
                processed_tgt = await process_entity_data(db, tgt_doc, case_id, mode="APPLY")
                tgt_res = await db["entities"].insert_one(processed_tgt)
                tgt_ent_id = str(tgt_res.inserted_id)
                entities_created += 1
            else:
                tgt_ent_id = str(tgt_ent["_id"])
                
            if src_ent_id != tgt_ent_id:
                rel_type = str(record.get(type_key, "CONNECTED_TO")).upper() if type_key else "CONNECTED_TO"
                properties = {k: v for k, v in record.items() if k not in [src_key, tgt_key, type_key]}
                
                existing_rel = await db["relationships"].find_one({
                    "$or": [{"case_id": case_id}, {"caseId": case_id}],
                    "source_entity_id": src_ent_id,
                    "target_entity_id": tgt_ent_id, "type": rel_type
                })
                
                if not existing_rel:
                    rel_doc = {
                        "case_id": case_id, "source_entity_id": src_ent_id,
                        "target_entity_id": tgt_ent_id, "type": rel_type,
                        "properties": properties, "evidence_ids": [evidence_id],
                        "created_by": current_user["email"], "created_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow()
                    }
                    await db["relationships"].insert_one(rel_doc)
                    relationships_created += 1

    try:
        await merge_case_duplicate_entities(db, case_id)
        await resolve_case_relationships(db, case_id)
        await sync_entity_involvement_descriptions(db, case_id)
    except Exception as post_e:
        print(f"Mapped import post-processing failed: {post_e}")
    
    print(f"Mapped import background task completed. Entities: {entities_created}, Relationships: {relationships_created}")

@router.post("/import-mapped")
async def import_mapped_data(
    req: ImportMappedRequest,
    background_tasks: BackgroundTasks,
    db=Depends(get_database),
    current_user=Depends(get_current_user)
):
    ev_dict = {
        "case_id": req.case_id,
        "title": req.filename,
        "source_type": req.filename.split(".")[-1].upper() if req.filename else "CSV",
        "raw_content": f"Imported {req.import_type} with custom mapping. Records count: {len(req.data)}",
        "created_by": current_user["email"],
        "created_at": datetime.utcnow(),
    }
    ev_result = await db["evidence"].insert_one(ev_dict)
    
    background_tasks.add_task(
        process_mapped_import_background,
        db, req.case_id, req.import_type.upper(), req.data, req.mappings, current_user, str(ev_result.inserted_id)
    )
    
    return {
        "message": f"Mapped import processed successfully. Ingestion running in background.",
        "evidence_id": str(ev_result.inserted_id),
        "entities_created": 0,
        "relationships_created": 0
    }
