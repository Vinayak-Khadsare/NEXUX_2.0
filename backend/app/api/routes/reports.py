from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.database import get_database
from app.api.routes.auth import get_current_user
import httpx
import os
import json
import re
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from app.ai.local_llm import generate

router = APIRouter()

@router.get("")
async def generate_report(
    case_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(get_current_user)
):
    if not case_id:
        raise HTTPException(status_code=400, detail="case_id is required")
        
    # Fetch case details
    try:
        case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    except Exception:
        case = await db["cases"].find_one({"_id": case_id})
        
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Handle variation in case ID storage
    query = {"$or": [{"case_id": case_id}, {"caseId": case_id}]}
    
    # Fetch entities
    cursor = db["entities"].find(query)
    entities = await cursor.to_list(length=1000)
    
    # Fetch relationships
    rel_cursor = db["relationships"].find(query)
    relationships = await rel_cursor.to_list(length=1000)
    
    # Fetch evidence
    ev_cursor = db["evidence"].find(query)
    evidence = await ev_cursor.to_list(length=100)
    
    # Section 1 & 4: Entities
    person_count = sum(1 for e in entities if e.get("type", "").upper() == "PERSON")
    org_count = sum(1 for e in entities if e.get("type", "").upper() == "ORGANIZATION")
    loc_count = sum(1 for e in entities if e.get("type", "").upper() == "LOCATION")
    veh_count = sum(1 for e in entities if e.get("type", "").upper() == "VEHICLE")
    
    important_entities = [
        {
            "name": e.get("name"),
            "type": e.get("type"),
            "risk_score": e.get("risk_score", 0),
            "description": e.get("description") or e.get("properties", {}).get("description") or e.get("properties", {}).get("Role / Description") or e.get("properties", {}).get("role") or ""
        }
        for e in sorted(entities, key=lambda x: x.get("risk_score", 0), reverse=True)[:15]
    ]
    
    high_risk_entities = [e for e in important_entities if e.get("risk_score", 0) > 0.7]
    medium_risk_entities = [e for e in important_entities if 0.4 <= e.get("risk_score", 0) <= 0.7]

    # Section 5 & 10: Relationships & Network Analysis
    relationship_types = {}
    for r in relationships:
        rtype = r.get("type", "UNKNOWN")
        relationship_types[rtype] = relationship_types.get(rtype, 0) + 1
        
    entity_map = {str(e["_id"]): e.get("name") for e in entities}
    important_relationships = []
    for r in relationships[:20]:
        src_id = str(r.get("source_entity_id", ""))
        tgt_id = str(r.get("target_entity_id", ""))
        src_name = entity_map.get(src_id, src_id if src_id and src_id != 'None' else "Unknown")
        tgt_name = entity_map.get(tgt_id, tgt_id if tgt_id and tgt_id != 'None' else "Unknown")
        important_relationships.append({
            "source": src_name,
            "target": tgt_name,
            "type": r.get("type", "UNKNOWN")
        })

    # Section 7: Chronological Sequence of Events
    MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']

    def format_display_date(date_str):
        if not date_str:
            return 'DATE UNSPECIFIED'
        m = re.search(r'(\d{4})-(\d{1,2})-(\d{1,2})', str(date_str))
        if m:
            yr = m.group(1)
            mo = int(m.group(2))
            day = int(m.group(3))
            if 1 <= mo <= 12:
                return f"{day} {MONTHS[mo-1]} {yr}"
        return str(date_str).upper()

    def format_display_time(time_str):
        if not time_str or not str(time_str).strip() or str(time_str).strip().lower() in ['none', 'null']:
            return 'Time: Not specified'
        s = str(time_str).strip()
        if 'not specified' in s.lower():
            return 'Time: Not specified'
        if re.search(r'\b(AM|PM)\b', s, re.I):
            return s.upper()
        m = re.search(r'(\d{1,2}):(\d{2})(?::\d{2})?', s)
        if m:
            hr = int(m.group(1))
            mn = m.group(2)
            ampm = 'PM' if hr >= 12 else 'AM'
            hr12 = hr % 12
            if hr12 == 0:
                hr12 = 12
            return f"{hr12:02d}:{mn} {ampm}"
        return s

    def parse_datetime_info(val):
        if not val:
            return None, None, None
        s = str(val).strip()
        m = re.search(r'(\d{4}-\d{2}-\d{2})(?:[T\s](\d{1,2}:\d{2})(?::\d{2})?)?', s)
        if m:
            d = m.group(1)
            t = m.group(2)
            tm_part = t if t else '00:00:00'
            sort_k = f"{d} {tm_part}"
            return sort_k, d, t
        # DD Month YYYY pattern
        m2 = re.search(r'(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})(?:[,\s]+(\d{1,2}:\d{2}(?:\s*[AP]M)?))?', s, re.I)
        if m2:
            day, mon, yr, tm = m2.group(1), m2.group(2)[:3].title(), m2.group(3), m2.group(4)
            try:
                dt = datetime.strptime(f"{day} {mon} {yr}", "%d %b %Y")
                d = dt.strftime("%Y-%m-%d")
                tm_part = tm if tm else '00:00:00'
                sort_k = f"{d} {tm_part}"
                return sort_k, d, tm
            except Exception:
                pass
        return None, None, None

    collected_events = []

    # 1. DB Timeline collection
    db_timelines = await db["timeline"].find({"case_id": case_id}).to_list(500)
    for t_item in db_timelines:
        raw_ts = t_item.get("timestamp") or t_item.get("date") or str(t_item.get("created_at", ""))
        sort_k, d, t = parse_datetime_info(raw_ts)
        if not d:
            continue
        props = t_item.get("properties") or {}
        ev_ref = props.get("Evidence") or props.get("evidence")
        source_type = props.get("Location / Source") or t_item.get("type") or "Record"
        if ev_ref:
            source_str = f"{ev_ref} — {source_type.title()} Record" if "record" not in source_type.lower() else f"{ev_ref} — {source_type}"
        else:
            source_str = f"{source_type}" if source_type else "Case Investigation Record"

        relevant_ents = []
        if props.get("Entity"):
            ent_id_or_name = str(props.get("Entity"))
            resolved = next((e.get("name") for e in entities if str(e.get("name", "")).lower() == ent_id_or_name.lower() or str(e.get("properties", {}).get("Entity ID", "")).lower() == ent_id_or_name.lower() or str(e.get("properties", {}).get("entity_id", "")).lower() == ent_id_or_name.lower()), ent_id_or_name)
            relevant_ents.append(resolved)

        desc = t_item.get("description") or t_item.get("title") or t_item.get("message") or ""
        collected_events.append({
            "date": d,
            "display_date": format_display_date(d),
            "time": format_display_time(t),
            "sort_key": sort_k,
            "description": desc.strip(),
            "entities": relevant_ents,
            "source": source_str if "Source:" in source_str else f"Source: {source_str}"
        })

    # 2. Case Relationships with timestamps/dates
    for r in relationships:
        r_props = r.get("properties") or {}
        raw_ts = r_props.get("timestamp") or r_props.get("date")
        if raw_ts:
            sort_k, d, t = parse_datetime_info(raw_ts)
            if d:
                src_id = str(r.get("source_entity_id", ""))
                tgt_id = str(r.get("target_entity_id", ""))
                src_name = entity_map.get(src_id, src_id if src_id and src_id != 'None' else "Unknown")
                tgt_name = entity_map.get(tgt_id, tgt_id if tgt_id and tgt_id != 'None' else "Unknown")
                rel_type = r.get("type", "CONNECTED_WITH").replace("_", " ").lower()
                desc = r_props.get("description") or f"{src_name} {rel_type} {tgt_name}."
                source_str = r_props.get("evidence") or r_props.get("source") or "Communication Record"
                collected_events.append({
                    "date": d,
                    "display_date": format_display_date(d),
                    "time": format_display_time(t),
                    "sort_key": sort_k,
                    "description": desc.strip(),
                    "entities": [ent for ent in [src_name, tgt_name] if ent and ent != "Unknown"],
                    "source": source_str if "Source:" in source_str else f"Source: {source_str}"
                })

    # 3. Case Entities with events/communications
    for e in entities:
        e_props = e.get("properties") or {}
        raw_ts = e_props.get("timestamp") or e_props.get("date")
        if raw_ts and e.get("type") in ["EVENT", "COMMUNICATION"]:
            sort_k, d, t = parse_datetime_info(raw_ts)
            if d:
                desc = e_props.get("description") or e.get("name") or "Event recorded."
                source_str = e_props.get("evidence") or e_props.get("source") or f"{e.get('type', 'Case').title()} Record"
                collected_events.append({
                    "date": d,
                    "display_date": format_display_date(d),
                    "time": format_display_time(t),
                    "sort_key": sort_k,
                    "description": desc.strip(),
                    "entities": [e.get("name")] if e.get("name") else [],
                    "source": source_str if "Source:" in source_str else f"Source: {source_str}"
                })

    # 4. Case AI narrative dated lines (parsed if present)
    if case.get("ai_narrative"):
        for line in case["ai_narrative"].split("\n"):
            line = line.strip().lstrip("-*• \t")
            if not line:
                continue
            sort_k, d, t = parse_datetime_info(line)
            if d:
                desc = re.sub(r'^(?:On\s+)?' + re.escape(d) + r'[:,]?\s*', '', line, flags=re.I).strip()
                if t:
                    desc = re.sub(r'^(?:at\s+)?' + re.escape(t) + r'(?:\s*[AP]M)?[:,]?\s*', '', desc, flags=re.I).strip()
                matched_ents = [ent.get("name") for ent in entities if ent.get("name") and ent.get("name").lower() in desc.lower()]
                collected_events.append({
                    "date": d,
                    "display_date": format_display_date(d),
                    "time": format_display_time(t),
                    "sort_key": sort_k,
                    "description": desc,
                    "entities": matched_ents[:3],
                    "source": "Source: Case Investigation Record"
                })

    # Combine multiple pieces of evidence describing the same event
    combined_events_map = {}
    for ev in collected_events:
        norm_desc = re.sub(r'[^\w\s]', '', ev["description"].lower())
        norm_words = tuple(sorted([w for w in norm_desc.split() if len(w) > 3])[:5])
        key = (ev["date"], ev["time"], norm_words)
        if key not in combined_events_map:
            combined_events_map[key] = ev
        else:
            existing = combined_events_map[key]
            existing_src = existing.get("source", "")
            new_src = ev.get("source", "")
            if new_src and new_src not in existing_src and existing_src not in new_src:
                clean_new_src = new_src.replace("Source: ", "").strip()
                existing["source"] = f"{existing_src}, {clean_new_src}"
            existing_ents = set(existing.get("entities") or [])
            for ent in (ev.get("entities") or []):
                existing_ents.add(ent)
            existing["entities"] = list(existing_ents)

    chronological_events = list(combined_events_map.values())
    chronological_events = sorted(chronological_events, key=lambda x: x["sort_key"])

    # Section 8: Geographic Intelligence
    geographic_locations = [
        {"name": e.get("name"), "coordinates": e.get("properties", {}).get("coordinates", "Unknown")}
        for e in entities if e.get("type", "").upper() == "LOCATION"
    ]

    # Compile the final report JSON structure
    report = {
        "case_overview": {
            "name": case.get("name"),
            "description": case.get("description"),
            "status": case.get("status"),
            "priority": case.get("priority", "MEDIUM"),
            "created_at": str(case.get("created_at")),
            "investigator": case.get("investigator") or case.get("created_by", "UNASSIGNED")
        },
        "ai_narrative": case.get("ai_narrative") or None,
        "narrative_generated_at": str(case.get("narrative_generated_at")) if case.get("narrative_generated_at") else None,
        "metadata_summary": {
            "total_entities": len(entities),
            "total_relationships": len(relationships),
            "total_evidence": len(evidence),
            "total_alerts": 0
        },
        "entity_intelligence": {
            "total": len(entities),
            "persons": person_count,
            "organizations": org_count,
            "locations": loc_count,
            "vehicles": veh_count,
            "high_risk_count": len(high_risk_entities),
            "important_entities": important_entities
        },
        "network_analysis": {
            "total_nodes": len(entities),
            "total_edges": len(relationships),
            "relationship_distribution": relationship_types
        },
        "risk_assessment": {
            "overall_risk": "HIGH" if len(high_risk_entities) > 3 else "MEDIUM",
            "critical_entities": high_risk_entities[:5],
            "medium_risk_entities": medium_risk_entities[:5]
        },
        "chronological_events": chronological_events,
        "timeline_summary": {
            "total_events": len(chronological_events),
            "earliest_event": chronological_events[0] if chronological_events else None,
            "latest_event": chronological_events[-1] if chronological_events else None,
            "events": chronological_events
        },
        "geographic_intelligence": {
            "total_locations": len(geographic_locations),
            "locations": geographic_locations
        },
        "evidence_summary": {
            "total": len(evidence),
            "files": [{"title": ev.get("title"), "type": ev.get("source_type"), "date": str(ev.get("created_at"))} for ev in evidence]
        },
        "relationship_analysis": {
            "important_relationships": important_relationships
        },
        "ai_assessment": {
            "overall_assessment": "Insufficient data to generate assessment.",
            "key_findings": [],
            "network_assessment": "No network assessment available.",
            "risk_assessment": "No risk assessment available.",
            "geographic_timeline_observations": "No geographic/timeline information available.",
            "investigative_leads": []
        }
    }

    # Generate AI insights based on factual data
    context = (
        f"Case: {case.get('name', 'Unknown')}. Desc: {case.get('description', 'No description')}.\n"
        f"Metrics: {len(entities)} entities, {len(relationships)} relationships, {len(evidence)} evidence files.\n"
        f"High Risk Entities ({len(high_risk_entities)}): {json.dumps([e['name'] for e in high_risk_entities[:5]])}\n"
        f"Geographic Locations ({len(geographic_locations)}): {json.dumps([e['name'] for e in geographic_locations[:5]])}\n"
        f"Timeline Events ({len(chronological_events)}): {json.dumps([e.get('description', '') for e in chronological_events[:5]])}\n"
        f"Important Relationships ({len(important_relationships)}): {json.dumps([str(r.get('source')) + ' ' + str(r.get('type')) + ' ' + str(r.get('target')) for r in important_relationships[:5]])}\n"
    )
    
    prompt = f"""Analyze the following factual case data and generate a professional AI Investigative Assessment.
Ground your response strictly in the provided data. DO NOT hallucinate. 
Never fabricate: people, organizations, accounts, transactions, relationships, locations, dates, evidence, criminal activity, investigative findings.
The AI must reason ONLY from this case context.
If evidence is 0, explicitly state that no evidence records are available.
If relationships is 0, explicitly state that no relationship records are available.
If locations or timeline events are 0, explicitly state that sufficient geographic/timeline information is unavailable.
Use professional investigative decision-support language (e.g., "The available case data indicates...").
Never state or imply legal guilt.

Data:
{context}

Format your response EXACTLY as JSON with the following structure:
{{
  "executive_summary": "string",
  "ai_insights": "string",
  "recommendations": "string",
  "overall_assessment": "string",
  "key_findings": ["string", "string"],
  "network_assessment": "string",
  "risk_assessment": "string",
  "geographic_timeline_observations": "string",
  "investigative_leads": ["string", "string"]
}}"""
    
    try:
        # Use a faster, smaller model (7B) for report generation to significantly increase generation speed
        ai_response = await generate("You are an expert investigation assistant.", prompt, format="json")
        if not ai_response:
            raise ValueError("AI returned an empty response. Falling back to rule-based summary.")
            
        # clean json
        ai_response = ai_response.replace("```json", "").replace("```", "").strip()
        # Find the first { and last } to handle extra text from LLM
        start_idx = ai_response.find("{")
        end_idx = ai_response.rfind("}")
        if start_idx != -1 and end_idx != -1:
            ai_response = ai_response[start_idx:end_idx+1]
            
        res_dict = json.loads(ai_response)
        
        # Restore backward compatibility fields at the top level
        report["executive_summary"] = res_dict.get("executive_summary", "Executive summary not available.")
        report["ai_insights"] = res_dict.get("ai_insights", "AI insights not available.")
        report["recommendations"] = res_dict.get("recommendations", "Recommendations not available.")
        
        report["ai_assessment"] = {
            "overall_assessment": res_dict.get("overall_assessment", "Failed to parse overall assessment."),
            "key_findings": res_dict.get("key_findings", []),
            "network_assessment": res_dict.get("network_assessment", "Failed to parse network assessment."),
            "risk_assessment": res_dict.get("risk_assessment", "Failed to parse risk assessment."),
            "geographic_timeline_observations": res_dict.get("geographic_timeline_observations", "Failed to parse observations."),
            "investigative_leads": res_dict.get("investigative_leads", [])
        }
    except Exception as e:
        print("AI generation failed or not configured, using fallback:", str(e))
        report["executive_summary"] = f"Executive summary for case '{case.get('name')}'. This case involves {len(entities)} entities and {len(relationships)} relationships."
        report["ai_insights"] = f"Initial analysis reveals {len(high_risk_entities)} high risk entities out of {len(entities)} total entities."
        report["recommendations"] = "Please review the high-risk entities and their relationships manually as AI generation is currently unavailable."
        report["ai_assessment"] = {
            "overall_assessment": f"This case '{case.get('name')}' contains {len(entities)} extracted entities and {len(relationships)} known relationships based on {len(evidence)} evidence files.",
            "key_findings": ["Review high-risk entities.", "Investigate heavily connected hubs.", "Verify geographic coordinates of known locations."],
            "network_assessment": "Fallback network assessment.",
            "risk_assessment": f"{len(high_risk_entities)} entities have been flagged as high risk.",
            "geographic_timeline_observations": "Geographic and timeline assessment could not be generated at this time.",
            "investigative_leads": ["Check evidence files manually."]
        }

    return report
