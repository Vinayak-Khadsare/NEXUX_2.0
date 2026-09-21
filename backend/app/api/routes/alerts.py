from fastapi import APIRouter, Depends, HTTPException
from app.core.database import get_database
from app.api.routes.auth import get_current_user
from app.schemas.alert import AlertOut, AlertResolveRequest, AlertReopenRequest
from app.graph.graph_builder import build_graph
from app.graph.centrality import calculate_centrality
from bson import ObjectId
from datetime import datetime
from typing import List, Optional

router = APIRouter()

@router.get("", response_model=List[AlertOut])
@router.get("/", response_model=List[AlertOut], include_in_schema=False)
async def get_alerts(case_id: str = None, status: str = None, db=Depends(get_database), current_user=Depends(get_current_user)):
    query = {}
    if case_id:
        query["case_id"] = case_id
    if status:
        query["status"] = status.upper()
    alerts = await db["alerts"].find(query).to_list(1000)
    return alerts

@router.post("/calculate-risk/{case_id}")
async def calculate_case_risk(case_id: str, db=Depends(get_database), current_user=Depends(get_current_user)):
    entities = await db["entities"].find({"case_id": case_id}).to_list(None)
    relationships = await db["relationships"].find({"case_id": case_id}).to_list(None)
    
    if not entities:
        return {"message": "No entities found to calculate risk score.", "alerts_created": 0}
        
    G = build_graph(entities, relationships)
    centrality = calculate_centrality(G)
    
    alerts_created = 0
    for entity in entities:
        entity_id_str = str(entity["_id"])
        properties = entity.get("properties", {}) or {}
        
        # Check if entity is cleared / innocent
        is_cleared = (
            properties.get("is_cleared") is True
            or entity.get("disposition") in ["CLEARED", "INNOCENT"]
            or properties.get("disposition") in ["INNOCENT", "CLEARED"]
            or properties.get("clearance_status") == "FREE_TO_GO"
        )
        if is_cleared:
            # Cleared entities must remain at 0.0 risk score and not generate new alerts
            if entity.get("risk_score", 0.0) != 0.0:
                await db["entities"].update_one(
                    {"_id": entity["_id"]},
                    {"$set": {"risk_score": 0.0, "updated_at": datetime.utcnow()}}
                )
            continue
        
        node_centrality = centrality.get(entity_id_str, {})
        degree = node_centrality.get("degree", 0.0)
        
        base_risk = 0.1
        if isinstance(properties, dict):
            if properties.get("suspicious") or properties.get("flagged") or properties.get("is_cooperative") == False:
                base_risk += 0.4
                
        risk_score = min(1.0, base_risk + (degree * 1.5))
        
        await db["entities"].update_one(
            {"_id": entity["_id"]},
            {"$set": {"risk_score": round(risk_score, 2), "updated_at": datetime.utcnow()}}
        )
        
        if risk_score > 0.5:
            severity = "HIGH" if risk_score > 0.8 else "MEDIUM"
            alert_type = "HIGH_RISK_ENTITY" if risk_score > 0.8 else "SUSPICIOUS_ENTITY"
            message = f"Entity '{entity['name']}' flagged with {severity} risk ({risk_score:.2f}) due to network centrality ({degree:.2f})."
            
            existing = await db["alerts"].find_one({
                "case_id": case_id,
                "entity_id": entity_id_str,
                "type": alert_type
            })
            
            if not existing:
                alert_doc = {
                    "case_id": case_id,
                    "entity_id": entity_id_str,
                    "type": alert_type,
                    "severity": severity,
                    "message": message,
                    "status": "ACTIVE",
                    "created_at": datetime.utcnow()
                }
                await db["alerts"].insert_one(alert_doc)
                alerts_created += 1
                
    return {
        "message": f"Risk calculation complete. Recalculated scores for {len(entities)} entities.",
        "alerts_created": alerts_created
    }

@router.post("/resolve")
async def resolve_alert(
    payload: AlertResolveRequest,
    db=Depends(get_database),
    current_user=Depends(get_current_user)
):
    case_id = payload.case_id
    alert_id = payload.alert_id
    entity_id = payload.entity_id
    disposition = (payload.disposition or "INNOCENT").upper()
    notes = payload.resolution_notes or "Entity cleared by investigator. Free to go."
    user_email = current_user.get("email", "investigator")
    now = datetime.utcnow()

    # Look up entity if provided or via alert
    entity = None
    if entity_id:
        try:
            entity = await db["entities"].find_one({"_id": ObjectId(entity_id), "case_id": case_id})
        except Exception:
            entity = None

    existing_alert = None
    if alert_id and not str(alert_id).startswith("generated_"):
        try:
            existing_alert = await db["alerts"].find_one({"_id": ObjectId(alert_id)})
            if existing_alert and not entity:
                alt_ent_id = existing_alert.get("entity_id")
                if alt_ent_id:
                    entity = await db["entities"].find_one({"_id": ObjectId(alt_ent_id), "case_id": case_id})
                    if not entity_id:
                        entity_id = alt_ent_id
        except Exception:
            pass

    # Clear Entity if requested and entity found
    if entity and payload.clear_entity:
        prev_risk = entity.get("risk_score", 0.0)
        ent_props = entity.get("properties", {}) or {}
        ent_props["is_cleared"] = True
        ent_props["disposition"] = disposition
        ent_props["clearance_status"] = "FREE_TO_GO" if disposition == "INNOCENT" else disposition
        ent_props["resolution_notes"] = notes
        ent_props["cleared_at"] = now.isoformat()
        ent_props["cleared_by"] = user_email
        if "previous_risk_score" not in ent_props or ent_props.get("previous_risk_score") == 0.0:
            ent_props["previous_risk_score"] = prev_risk
        ent_props["flagged"] = False
        ent_props["suspicious"] = False

        await db["entities"].update_one(
            {"_id": entity["_id"]},
            {
                "$set": {
                    "disposition": "CLEARED",
                    "risk_score": 0.0,
                    "properties": ent_props,
                    "updated_at": now
                }
            }
        )

        # Mark any active alerts for this entity as RESOLVED
        await db["alerts"].update_many(
            {"case_id": case_id, "entity_id": str(entity["_id"]), "status": "ACTIVE"},
            {
                "$set": {
                    "status": "RESOLVED",
                    "disposition": disposition,
                    "resolution_notes": notes,
                    "resolved_by": user_email,
                    "resolved_at": now
                }
            }
        )

    # Update or insert alert
    if existing_alert:
        await db["alerts"].update_one(
            {"_id": existing_alert["_id"]},
            {
                "$set": {
                    "status": "RESOLVED",
                    "disposition": disposition,
                    "resolution_notes": notes,
                    "resolved_by": user_email,
                    "resolved_at": now
                }
            }
        )
        resolved_id = str(existing_alert["_id"])
    else:
        ent_name = entity.get("name", "Unknown Entity") if entity else "Target"
        alert_doc = {
            "case_id": case_id,
            "entity_id": str(entity["_id"]) if entity else entity_id,
            "type": payload.type or ("CLEARED / INNOCENT" if disposition == "INNOCENT" else "RESOLVED_ALERT"),
            "severity": "LOW",
            "message": payload.message or f"Entity '{ent_name}' cleared ({disposition}): {notes}",
            "status": "RESOLVED",
            "disposition": disposition,
            "resolution_notes": notes,
            "resolved_by": user_email,
            "resolved_at": now,
            "created_at": now
        }
        res = await db["alerts"].insert_one(alert_doc)
        resolved_id = str(res.inserted_id)

    return {
        "success": True,
        "message": f"Entity resolved successfully as {disposition}.",
        "alert_id": resolved_id,
        "entity_id": str(entity["_id"]) if entity else entity_id,
        "disposition": disposition
    }

@router.post("/reopen")
async def reopen_alert(
    payload: AlertReopenRequest,
    db=Depends(get_database),
    current_user=Depends(get_current_user)
):
    case_id = payload.case_id
    alert_id = payload.alert_id
    entity_id = payload.entity_id
    now = datetime.utcnow()

    # If alert_id starts with resolved_ent_, extract entity_id
    if alert_id and str(alert_id).startswith("resolved_ent_") and not entity_id:
        entity_id = str(alert_id).replace("resolved_ent_", "")

    existing_alert = None
    if alert_id and not str(alert_id).startswith("generated_") and not str(alert_id).startswith("resolved_ent_"):
        try:
            existing_alert = await db["alerts"].find_one({"_id": ObjectId(alert_id)})
            if existing_alert and not entity_id and existing_alert.get("entity_id"):
                entity_id = existing_alert.get("entity_id")
        except Exception:
            pass

    if entity_id:
        try:
            entity = await db["entities"].find_one({"_id": ObjectId(entity_id), "case_id": case_id})
            if entity:
                ent_props = entity.get("properties", {}) or {}
                restored_risk = ent_props.get("previous_risk_score", 0.70)
                if not restored_risk or restored_risk <= 0.0:
                    restored_risk = 0.75

                ent_props["is_cleared"] = False
                ent_props["disposition"] = "ACTIVE"
                ent_props["clearance_status"] = "ACTIVE"
                ent_props.pop("resolution_notes", None)
                ent_props.pop("cleared_at", None)
                ent_props.pop("cleared_by", None)
                ent_props["reopened_at"] = now.isoformat()
                ent_props["reopened_by"] = current_user.get("email", "investigator")

                await db["entities"].update_one(
                    {"_id": entity["_id"]},
                    {
                        "$set": {
                            "disposition": "ACTIVE",
                            "risk_score": restored_risk,
                            "properties": ent_props,
                            "updated_at": now
                        }
                    }
                )

                # Update ALL alerts for this entity in db["alerts"] to ACTIVE
                await db["alerts"].update_many(
                    {"case_id": case_id, "entity_id": str(entity["_id"])},
                    {
                        "$set": {
                            "status": "ACTIVE",
                            "disposition": "ACTIVE",
                            "reopened_at": now,
                            "updated_at": now
                        },
                        "$unset": {
                            "resolution_notes": "",
                            "resolved_at": "",
                            "resolved_by": ""
                        }
                    }
                )
        except Exception as e:
            print("Error restoring entity:", e)

    if existing_alert:
        await db["alerts"].update_one(
            {"_id": existing_alert["_id"]},
            {
                "$set": {
                    "status": "ACTIVE",
                    "disposition": "ACTIVE",
                    "reopened_at": now,
                    "updated_at": now
                },
                "$unset": {
                    "resolution_notes": "",
                    "resolved_at": "",
                    "resolved_by": ""
                }
            }
        )

    return {"success": True, "message": "Alert and entity restored to ACTIVE investigation status."}

@router.put("/{alert_id}/status")
async def update_alert_status(
    alert_id: str,
    status: str,
    db=Depends(get_database),
    current_user=Depends(get_current_user)
):
    try:
        oid = ObjectId(alert_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid Alert ID format")
        
    existing = await db["alerts"].find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Alert not found")
        
    await db["alerts"].update_one({"_id": oid}, {"$set": {"status": status.upper(), "updated_at": datetime.utcnow()}})
    return {"message": f"Alert status updated to {status.upper()}"}


@router.get("/anomalies/{case_id}")
async def get_anomalies(case_id: str, db=Depends(get_database), current_user=Depends(get_current_user)):
    entities = await db["entities"].find({"case_id": case_id}).to_list(None)
    relationships = await db["relationships"].find({"case_id": case_id}).to_list(None)
    
    anomalies = []
    
    for rel in relationships:
        if rel.get("type") == "TRANSFERRED_MONEY":
            props = rel.get("properties", {})
            amount = props.get("amount", 0)
            if amount > 10000:
                src_ent = next((e for e in entities if str(e["_id"]) == str(rel["source_entity_id"])), None)
                tgt_ent = next((e for e in entities if str(e["_id"]) == str(rel["target_entity_id"])), None)
                src_name = src_ent["name"] if src_ent else "Unknown"
                tgt_name = tgt_ent["name"] if tgt_ent else "Unknown"
                
                anomalies.append({
                    "id": str(rel["_id"]),
                    "category": "Financial",
                    "severity": "HIGH" if amount > 50000 else "MEDIUM",
                    "entity": src_name,
                    "reason": f"High value fund transfer detected: {src_name} sent ${amount:,} to {tgt_name}.",
                    "timestamp": rel.get("created_at") or datetime.utcnow(),
                    "evidence": [f"Transaction ID: {rel['_id']}"]
                })
                
    for rel in relationships:
        if rel.get("type") in ["CALLED", "MESSAGED"]:
            props = rel.get("properties", {})
            duration = props.get("duration_seconds", 0)
            timestamp = props.get("timestamp")
            
            is_odd_hour = False
            time_str = ""
            if timestamp:
                try:
                    dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                    time_str = dt.strftime("%H:%M:%S")
                    if dt.hour < 6 or dt.hour > 22:
                        is_odd_hour = True
                except Exception:
                    pass
            
            if duration > 1800 or is_odd_hour:
                src_ent = next((e for e in entities if str(e["_id"]) == str(rel["source_entity_id"])), None)
                tgt_ent = next((e for e in entities if str(e["_id"]) == str(rel["target_entity_id"])), None)
                src_name = src_ent["name"] if src_ent else "Unknown"
                tgt_name = tgt_ent["name"] if tgt_ent else "Unknown"
                
                reason = ""
                if duration > 1800 and is_odd_hour:
                    reason = f"Extremely long call ({duration // 60} min) at odd hours ({time_str}) detected between {src_name} and {tgt_name}."
                elif duration > 1800:
                    reason = f"Extremely long call ({duration // 60} min) detected between {src_name} and {tgt_name}."
                else:
                    reason = f"Odd hour communication ({time_str}) detected between {src_name} and {tgt_name}."
                    
                anomalies.append({
                    "id": str(rel["_id"]),
                    "category": "Communication",
                    "severity": "HIGH" if duration > 3600 else "MEDIUM",
                    "entity": src_name,
                    "reason": reason,
                    "timestamp": rel.get("created_at") or datetime.utcnow(),
                    "evidence": [f"Call Record: {rel['_id']}"]
                })
                
    for ent in entities:
        props = ent.get("properties", {}) or {}
        if props.get("is_cleared") or ent.get("disposition") in ["CLEARED", "INNOCENT"] or props.get("clearance_status") == "FREE_TO_GO":
            continue
        risk = ent.get("risk_score", 0.0)
        if risk > 0.8:
            anomalies.append({
                "id": str(ent["_id"]),
                "category": "Activity",
                "severity": "HIGH",
                "entity": ent["name"],
                "reason": f"Suspect '{ent['name']}' has an elevated threat risk score of {risk:.2f}.",
                "timestamp": ent.get("updated_at") or datetime.utcnow(),
                "evidence": [f"Risk Assessment: {risk:.2f}"]
            })
            
    anomalies.sort(key=lambda x: x["timestamp"], reverse=True)
    return anomalies
