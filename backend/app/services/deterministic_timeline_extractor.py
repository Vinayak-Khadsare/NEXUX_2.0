"""
===================================================================
DETERMINISTIC TIMELINE & EVENT EXTRACTION SERVICE
===================================================================
Extracts chronological events deterministically from text chunks,
entity metadata, and relationship interactions without LLM intervention.
===================================================================
"""
import re
from typing import List, Dict, Any, Optional
from datetime import datetime

# Regex date and time extractors
DATE_PATTERNS = [
    r'\b(\d{4}[-/.]\d{2}[-/.]\d{2})\b',              # 2026-03-12, 2026/03/12
    r'\b(\d{2}[-/.]\d{2}[-/.]\d{4})\b',              # 12/03/2026, 12-03-2026
    r'\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b', # 12 March 2026
    r'\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b' # March 12, 2026
]

TIME_PATTERNS = [
    r'\b(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\b',
    r'\b(\d{4}\s*hrs)\b'
]

def extract_timeline_events_from_chunk(
    chunk: Dict[str, Any],
    extracted_entities: List[Dict[str, Any]],
    extracted_relationships: List[Dict[str, Any]],
    case_id: str
) -> List[Dict[str, Any]]:
    """
    Deterministically constructs timeline event records from structured chunk content,
    associated dates/times, and interaction events.
    """
    text = chunk.get("text", "")
    if not text:
        return []

    evidence_id = chunk.get("evidence_id", "")
    source_loc = chunk.get("source_location", "Unknown Location")
    timestamp = chunk.get("timestamp") or None
    
    events: List[Dict[str, Any]] = []
    seen_event_keys = set()

    # 1. Parse text lines to detect dated sentences
    lines = [l.strip() for l in re.split(r'[\r\n.]+', text) if len(l.strip()) > 8]

    for line in lines:
        matched_date = None
        for dp in DATE_PATTERNS:
            dm = re.search(dp, line, re.IGNORECASE)
            if dm:
                matched_date = dm.group(1).strip()
                break

        matched_time = None
        for tp in TIME_PATTERNS:
            tm = re.search(tp, line, re.IGNORECASE)
            if tm:
                matched_time = tm.group(1).strip()
                break

        if matched_date or timestamp:
            event_time = f"{matched_date} {matched_time}".strip() if matched_date else (timestamp or "")
            
            # Check if this sentence involves entities
            involved_entities = [e["name"] for e in extracted_entities if e["name"].lower() in line.lower()]
            
            if involved_entities:
                # Classify category
                line_lower = line.lower()
                category = "MOVEMENT" if any(w in line_lower for w in ["seen", "travelled", "arrived", "left", "visited"]) else \
                           "COMMUNICATION" if any(w in line_lower for w in ["call", "sms", "messaged", "phone", "contacted"]) else \
                           "FINANCIAL" if any(w in line_lower for w in ["transferred", "paid", "remitted", "rs", "inr"]) else \
                           "CRIMINAL" if any(w in line_lower for w in ["killed", "murder", "shot", "attacked", "extorted"]) else \
                           "INCIDENT"
                
                title = f"{category.capitalize()} Event: {', '.join(involved_entities[:2])}"
                key = (event_time, title.lower(), involved_entities[0].lower() if involved_entities else "")
                
                if key not in seen_event_keys:
                    seen_event_keys.add(key)
                    events.append({
                        "case_id": case_id,
                        "caseId": case_id,
                        "date": event_time,
                        "timestamp": event_time,
                        "name": title,
                        "title": title,
                        "description": line[:250],
                        "summary": line[:250],
                        "category": category,
                        "entities": involved_entities,
                        "evidence_id": evidence_id,
                        "source_location": source_loc,
                        "created_at": datetime.utcnow()
                    })

    # 2. Add events from explicit extracted relationships that carry timestamps
    for rel in extracted_relationships:
        r_props = rel.get("properties", {})
        r_time = rel.get("timestamp") or r_props.get("timestamp") or r_props.get("date")
        if r_time:
            key = (str(r_time), rel.get("type", ""), rel.get("source_name", ""), rel.get("target_name", ""))
            if key not in seen_event_keys:
                seen_event_keys.add(key)
                events.append({
                    "case_id": case_id,
                    "caseId": case_id,
                    "date": str(r_time),
                    "timestamp": str(r_time),
                    "name": f"{rel.get('type')} Link: {rel.get('source_name')} -> {rel.get('target_name')}",
                    "title": f"{rel.get('type')} Link",
                    "description": rel.get("source_text", ""),
                    "summary": rel.get("source_text", ""),
                    "category": "RELATIONSHIP",
                    "entities": [rel.get("source_name"), rel.get("target_name")],
                    "evidence_id": rel.get("evidence_id"),
                    "source_location": rel.get("source_location"),
                    "created_at": datetime.utcnow()
                })

    return events
