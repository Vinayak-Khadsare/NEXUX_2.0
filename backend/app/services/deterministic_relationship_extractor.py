"""
===================================================================
DETERMINISTIC RELATIONSHIP EXTRACTION ENGINE (NON-LLM)
===================================================================
Pure deterministic NLP, proximity, regex, and grammatical rule-based 
relationship extraction without any LLM dependency. 
Supports full provenance and auditable relationship schemas.
===================================================================
"""
import re
from typing import List, Dict, Any, Optional, Tuple

def extract_relationships_from_chunk(
    chunk: Dict[str, Any], 
    extracted_entities: List[Dict[str, Any]], 
    case_id: str
) -> List[Dict[str, Any]]:
    """
    Deterministically extracts evidence-backed relationships between extracted entities
    found in the same chunk / sentence context.
    
    CRITICAL RULE:
    Do NOT connect every pair of entities. Relationships are only produced if:
    1. An explicit grammatical verb/action pattern connects the two entities.
    2. A structured CDR / financial / ownership pattern binds them.
    3. A lineage/familial construct (S/o, D/o, W/o) links them.
    4. Proximity + explicit interaction verbs are satisfied within a localized sentence.
    """
    text = chunk.get("text", "")
    if not text or not extracted_entities:
        return []

    evidence_id = chunk.get("evidence_id", "")
    source_loc = chunk.get("source_location", "Unknown Location")
    timestamp = chunk.get("timestamp") or None
    
    relationships: List[Dict[str, Any]] = []
    seen_rel_keys = set()

    # Create quick lookups
    entities_by_type: Dict[str, List[Dict[str, Any]]] = {}
    for ent in extracted_entities:
        t = ent.get("type", "UNKNOWN").upper()
        entities_by_type.setdefault(t, []).append(ent)

    def add_relationship(
        src_name: str,
        tgt_name: str,
        rel_type: str,
        confidence: float,
        evidence_excerpt: str,
        properties: Optional[Dict[str, Any]] = None
    ):
        s_clean = src_name.strip()
        t_clean = tgt_name.strip()
        if not s_clean or not t_clean or s_clean.lower() == t_clean.lower():
            return

        key = (s_clean.lower(), t_clean.lower(), rel_type.upper())
        if key in seen_rel_keys:
            return
        seen_rel_keys.add(key)

        props = properties.copy() if properties else {}
        props.update({
            "source_location": source_loc,
            "evidence_text": evidence_excerpt[:250],
            "extraction_method": "DETERMINISTIC_RULE"
        })
        if timestamp:
            props["timestamp"] = timestamp

        relationships.append({
            "case_id": case_id,
            "caseId": case_id,
            "source_name": s_clean,
            "target_name": t_clean,
            "type": rel_type.upper(),
            "confidence": confidence,
            "evidence_id": evidence_id,
            "evidence_ids": [evidence_id] if evidence_id else [],
            "source_text": evidence_excerpt[:250],
            "source_location": source_loc,
            "timestamp": timestamp,
            "extraction_method": "DETERMINISTIC_RULE",
            "properties": props
        })

    # Split chunk into sentences/lines for localized context
    lines = [line.strip() for line in re.split(r'[\r\n.]+', text) if len(line.strip()) > 5]

    # 1. CDR / COMMUNICATION PATTERNS (CALLED, MESSAGED)
    # Pattern: Call from <Phone/Person> to <Phone/Person> or <A> called <B>
    call_patterns = [
        r'(?:Call|Call\s+from|SMS\s+from|Incoming\s+call\s+from|Outgoing\s+call\s+to)\s+([^\n,]+?)\s+(?:to|with|and)\s+([^\n,.]+)',
        r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*|\+?\d{10,12})\s+(?:called|phoned|dialed|contacted|messaged|texted)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*|\+?\d{10,12})'
    ]
    for pattern in call_patterns:
        for m in re.finditer(pattern, text, re.IGNORECASE):
            raw_s = m.group(1).strip()
            raw_t = m.group(2).strip()
            # Verify if raw_s and raw_t correspond to extracted entities
            match_s = next((e["name"] for e in extracted_entities if e["name"].lower() in raw_s.lower() or raw_s.lower() in e["name"].lower()), None)
            match_t = next((e["name"] for e in extracted_entities if e["name"].lower() in raw_t.lower() or raw_t.lower() in e["name"].lower()), None)
            if match_s and match_t and match_s.lower() != match_t.lower():
                rel_t = "MESSAGED" if any(k in m.group(0).lower() for k in ["sms", "messaged", "texted"]) else "CALLED"
                add_relationship(match_s, match_t, rel_t, 0.95, m.group(0))

    # 2. FINANCIAL TRANSACTIONS (TRANSFERRED_TO, PAID)
    # Pattern: <A> transferred/paid <amount> to <B> or Transfer from <A> to <B>
    fin_patterns = [
        r'([A-Z][a-zA-Z\s]{2,25}?)\s+(?:transferred|remitted|sent|paid)\s+(?:₹|Rs\.?|INR|\$)?\s*[\d,]+(?:\.\d{2})?\s+(?:to|into\s+account\s+of)\s+([A-Z][a-zA-Z\s]{2,25})',
        r'(?:Transfer|Payment|Remittance)\s+(?:of\s+(?:₹|Rs\.?|INR|\$)?\s*[\d,]+(?:\.\d{2})?)?\s*from\s+([A-Z][a-zA-Z\s]{2,25}?)\s+to\s+([A-Z][a-zA-Z\s]{2,25})'
    ]
    for pattern in fin_patterns:
        for m in re.finditer(pattern, text, re.IGNORECASE):
            raw_s = m.group(1).strip()
            raw_t = m.group(2).strip()
            match_s = next((e["name"] for e in extracted_entities if e["name"].lower() in raw_s.lower() or raw_s.lower() in e["name"].lower()), None)
            match_t = next((e["name"] for e in extracted_entities if e["name"].lower() in raw_t.lower() or raw_t.lower() in e["name"].lower()), None)
            if match_s and match_t and match_s.lower() != match_t.lower():
                # Extract amount if present in excerpt
                amt_match = re.search(r'(?:₹|Rs\.?|INR|\$)\s*[\d,]+(?:\.\d{2})?', m.group(0))
                props = {"amount": amt_match.group(0)} if amt_match else {}
                add_relationship(match_s, match_t, "TRANSFERRED_TO", 0.95, m.group(0), props)

    # 3. OWNERSHIP / ASSET LINKS (OWNS, DRIVES, USES)
    # Pattern: <Person> owns/drives <Vehicle/Account> or registered owner of <Plate> is <Person>
    owner_patterns = [
        r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:owns|drives|operates|registered\s+owner\s+of|using|used)\s+([A-Z0-9\-\s]{4,20})',
        r'(?:registered\s+owner\s+of|vehicle\s+bearing\s+number)\s+([A-Z0-9\-\s]{4,20})\s+(?:is|belongs\s+to|registered\s+to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})'
    ]
    for pattern in owner_patterns:
        for m in re.finditer(pattern, text, re.IGNORECASE):
            g1, g2 = m.group(1).strip(), m.group(2).strip()
            # Determine which is person and which is asset
            p_cand = next((e["name"] for e in extracted_entities if e["type"] == "PERSON" and (e["name"].lower() in g1.lower() or e["name"].lower() in g2.lower())), None)
            v_cand = next((e["name"] for e in extracted_entities if e["type"] in ["VEHICLE", "BANK_ACCOUNT", "PHONE_NUMBER"] and (e["name"].lower() in g1.lower() or e["name"].lower() in g2.lower())), None)
            if p_cand and v_cand:
                add_relationship(p_cand, v_cand, "OWNS", 0.90, m.group(0))

    # 4. EMPLOYMENT / CORPORATE (WORKS_FOR, DIRECTOR_OF, ASSOCIATED_WITH)
    emp_patterns = [
        r'(?:(?:Suspect|Accused|Witness|Victim|Inspector|Officer|Mr\.|Ms\.)\s+)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,2})\s+(?:(?:stated|reported|confessed|admitted|testified)\s+(?:that\s+)?(?:he|she)\s+)?(?:works\s+for|employed\s+by|director\s+of|manager\s+at|partner\s+at)\s+([A-Z][a-zA-Z0-9&.\-\s]{2,40})',
        r'([A-Z][a-zA-Z0-9&.\-\s]{2,40})\s+(?:employed|appointed|engaged)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,2})'
    ]
    for pattern in emp_patterns:
        for m in re.finditer(pattern, text, re.IGNORECASE):
            g1, g2 = m.group(1).strip(), m.group(2).strip()
            p_cand = next((e["name"] for e in extracted_entities if e["type"] == "PERSON" and (e["name"].lower() in g1.lower() or g1.lower() in e["name"].lower())), None)
            o_cand = next((e["name"] for e in extracted_entities if e["type"] == "ORGANIZATION" and (e["name"].lower() in g2.lower() or g2.lower() in e["name"].lower())), None)
            if p_cand and o_cand:
                add_relationship(p_cand, o_cand, "WORKS_FOR", 0.92, m.group(0))

    # 5. LINEAGE / FAMILY (FAMILY_RELATION)
    lineage_matches = re.finditer(r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:S/o|D/o|W/o)\s+(?:Late\s+)?(?:Sh\.|Smt\.|Mr\.|Ms\.)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)', text)
    for m in lineage_matches:
        p1 = m.group(1).strip()
        p2 = m.group(2).strip()
        add_relationship(p1, p2, "FAMILY_RELATION", 0.95, m.group(0), {"detail": "Parent/Guardian/Spouse relation"})

    # 6. PHYSICAL MEETINGS / SIGHTINGS (MET, VISITED, LOCATED_AT)
    # e.g., "Arvind Saxena met Vikram Malhotra at City Center Mall"
    meeting_patterns = [
        r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:met|conferred\s+with|visited)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})(?:\s+at\s+([A-Z][a-zA-Z0-9\s]{2,30}))?',
        r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:was\s+seen\s+at|travelled\s+to|arrived\s+at|located\s+at|fled\s+to)\s+([A-Z][a-zA-Z0-9\s]{2,30})'
    ]
    for pattern in meeting_patterns:
        for m in re.finditer(pattern, text, re.IGNORECASE):
            groups = m.groups()
            if len(groups) >= 2 and groups[0] and groups[1]:
                p1_match = next((e["name"] for e in extracted_entities if e["name"].lower() in groups[0].lower() or groups[0].lower() in e["name"].lower()), None)
                p2_match = next((e["name"] for e in extracted_entities if e["name"].lower() in groups[1].lower() or groups[1].lower() in e["name"].lower()), None)
                if p1_match and p2_match and p1_match.lower() != p2_match.lower():
                    # Check if p2_match is Location
                    e2_obj = next((e for e in extracted_entities if e["name"].lower() == p2_match.lower()), None)
                    if e2_obj and e2_obj["type"] == "LOCATION":
                        add_relationship(p1_match, p2_match, "LOCATED_AT", 0.88, m.group(0))
                    else:
                        add_relationship(p1_match, p2_match, "MET", 0.88, m.group(0))
                
                # Check 3rd group if present (location)
                if len(groups) >= 3 and groups[2] and p1_match:
                    loc_match = next((e["name"] for e in extracted_entities if e["type"] == "LOCATION" and (e["name"].lower() in groups[2].lower() or groups[2].lower() in e["name"].lower())), None)
                    if loc_match:
                        add_relationship(p1_match, loc_match, "LOCATED_AT", 0.85, m.group(0))

    # 7. CRIMINAL ACTIONS (KILLED, THREATENED, ORDERED)
    crime_patterns = [
        r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:killed|shot|murdered|stabbed|attacked|threatened|extorted|ordered)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})'
    ]
    for pattern in crime_patterns:
        for m in re.finditer(pattern, text, re.IGNORECASE):
            g1, g2 = m.group(1).strip(), m.group(2).strip()
            p1 = next((e["name"] for e in extracted_entities if e["name"].lower() in g1.lower() or g1.lower() in e["name"].lower()), None)
            p2 = next((e["name"] for e in extracted_entities if e["name"].lower() in g2.lower() or g2.lower() in e["name"].lower()), None)
            if p1 and p2 and p1.lower() != p2.lower():
                verb = "KILLED" if any(w in m.group(0).lower() for w in ["killed", "shot", "murdered", "stabbed"]) else "ATTACKED"
                add_relationship(p1, p2, verb, 0.90, m.group(0))

    # 8. LOCALIZED SENTENCE PROXIMITY WITH VERB REASONING
    # Semantic compatibility constraints: non-actors (amounts, dates, documents) cannot act as source/target
    ALLOWED_SEMANTICS = {
        "CALLED": ({"PERSON", "PHONE_NUMBER"}, {"PERSON", "PHONE_NUMBER"}),
        "MESSAGED": ({"PERSON", "PHONE_NUMBER"}, {"PERSON", "PHONE_NUMBER"}),
        "CONTACTED": ({"PERSON", "PHONE_NUMBER"}, {"PERSON", "PHONE_NUMBER"}),
        "MET": ({"PERSON"}, {"PERSON"}),
        "ACCOMPANIED_BY": ({"PERSON"}, {"PERSON"}),
        "TRAVELLED_WITH": ({"PERSON"}, {"PERSON"}),
        "TRANSFERRED_TO": ({"PERSON", "ORGANIZATION", "ACCOUNT"}, {"PERSON", "ORGANIZATION", "ACCOUNT"}),
        "PAID": ({"PERSON", "ORGANIZATION", "ACCOUNT"}, {"PERSON", "ORGANIZATION", "ACCOUNT"}),
        "WORKS_FOR": ({"PERSON"}, {"ORGANIZATION"}),
        "HIRED": ({"PERSON", "ORGANIZATION"}, {"PERSON"}),
        "OWNS": ({"PERSON", "ORGANIZATION"}, {"VEHICLE", "ACCOUNT", "PHONE_NUMBER", "ORGANIZATION"}),
        "DRIVES": ({"PERSON"}, {"VEHICLE"}),
    }

    INTERACTION_VERBS = {
        "called": "CALLED",
        "messaged": "MESSAGED",
        "contacted": "CONTACTED",
        "met": "MET",
        "transferred": "TRANSFERRED_TO",
        "paid": "PAID",
        "drives": "DRIVES",
        "owns": "OWNS",
        "hired": "HIRED",
        "employed": "WORKS_FOR",
        "accompanied": "ACCOMPANIED_BY",
        "travelled with": "TRAVELLED_WITH",
        "spoke with": "CONTACTED"
    }
    
    for line in lines:
        words = line.split()
        if len(words) > 35: 
            continue
        line_lower = line.lower()
        
        # Check if any interaction verb exists in this sentence
        active_rel = None
        for verb, rel_type in INTERACTION_VERBS.items():
            if f" {verb} " in f" {line_lower} ":
                active_rel = rel_type
                break
                
        if active_rel and active_rel in ALLOWED_SEMANTICS:
            allowed_src_types, allowed_tgt_types = ALLOWED_SEMANTICS[active_rel]
            
            # Find eligible entities in this sentence matching allowed types
            present_entities = [
                e for e in extracted_entities 
                if e["name"].lower() in line_lower and e["type"] in (allowed_src_types | allowed_tgt_types)
            ]
            
            if len(present_entities) >= 2:
                for i in range(len(present_entities)):
                    for j in range(i + 1, len(present_entities)):
                        e1, e2 = present_entities[i], present_entities[j]
                        if e1["name"].lower() != e2["name"].lower():
                            pos1 = line_lower.find(e1["name"].lower())
                            pos2 = line_lower.find(e2["name"].lower())
                            src, tgt = (e1, e2) if pos1 < pos2 else (e2, e1)
                            
                            # Validate semantic direction
                            if src["type"] in allowed_src_types and tgt["type"] in allowed_tgt_types:
                                add_relationship(src["name"], tgt["name"], active_rel, 0.85, line)

    return relationships
