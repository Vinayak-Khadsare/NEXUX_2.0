import re
import json
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
import networkx as nx
from bson import ObjectId

from app.graph.graph_builder import build_graph
from app.graph.path_finder import find_shortest_path
from app.services.rag_service import query_case_context

# ==============================================================================
# 1. HONORIFICS, NORMALIZATION & UTILITIES
# ==============================================================================

HONORIFICS = [
    r"\bmr\.?\b", r"\bmrs\.?\b", r"\bms\.?\b", r"\bdr\.?\b", r"\bprof\.?\b",
    r"\bsh\.?\b", r"\bshri\.?\b", r"\bsmt\.?\b",
    r"\bofficer\b", r"\binspector\b", r"\bconstable\b", r"\basi\b", r"\bct\.?\b",
    r"\bagent\b", r"\bdetective\b"
]

STOP_PHRASES = [
    r"^who is\s+", r"^who are\s+", r"^tell me about\s+", r"^what do you know about\s+",
    r"^who is\s+", r"^what is\s+", r"^details (?:of|for|on)\s+", r"^profile (?:of|for|on)\s+",
    r"^information (?:of|for|on|about)\s+", r"^search for\s+", r"^lookup\s+",
    r"^who does\s+", r"^how is\s+", r"^connection between\s+", r"^path between\s+",
    r"^why is\s+", r"^explain risk (?:of|for)\s+", r"^risk of\s+",
    r"^what evidence mentions\s+", r"^evidence (?:for|linking|linked to|on)\s+",
    r"^what happened to\s+", r"^timeline of\s+", r"^where has\s+",
    r"^locations? (?:of|for|associated with)\s+", r"^where was\s+"
]

def clean_query_text(text: str) -> str:
    """Removes honorifics, punctuation, and extra whitespace."""
    s = text.lower()
    for h in HONORIFICS:
        s = re.sub(h, "", s, flags=re.IGNORECASE)
    s = re.sub(r"[^\w\s\-+@/]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def extract_target_name(query: str) -> str:
    """Strips common questioning prefixes to isolate the subject/entity query."""
    q = query.strip()
    # Remove trailing question marks, periods, exclamation marks
    q = re.sub(r"[\?\.\!]+$", "", q).strip()
    
    # Strip question prefixes
    for p in STOP_PHRASES:
        match = re.search(p, q, flags=re.IGNORECASE)
        if match:
            q = q[match.end():].strip()
            break
            
    # Clean out "in this case", "in the active case", "in the case"
    q = re.sub(r"\s+in\s+(?:this|the|our)\s+case\b", "", q, flags=re.IGNORECASE)
    q = re.sub(r"\s+in\s+the\s+investigation\b", "", q, flags=re.IGNORECASE)

    # Strip date expressions like "on 17 august", "on 12 aug 2026", "on 12-08-2026"
    q = re.sub(r"\s+on\s+\d{1,2}(?:st|nd|rd|th)?\s+[a-zA-Z]+(?:\s+\d{2,4})?", "", q, flags=re.IGNORECASE)
    q = re.sub(r"\s+on\s+[a-zA-Z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+\d{2,4})?", "", q, flags=re.IGNORECASE)
    q = re.sub(r"\s+on\s+\d{4}-\d{2}-\d{2}", "", q, flags=re.IGNORECASE)
    q = re.sub(r"\s+on\s+\d{1,2}[/-]\d{1,2}[/-]\d{2,4}", "", q, flags=re.IGNORECASE)


    # Clean honorifics
    for h in HONORIFICS:
        q = re.sub(h, "", q, flags=re.IGNORECASE).strip()

    # Strip trailing question words
    TRAILING_PATTERNS = [
        r"\s+been$", r"\s+gone$", r"\s+visited$", r"\s+seen$",
        r"\s+high risk$", r"\s+marked as high risk$", r"\s+risk score$",
        r"\s+communicate with$", r"\s+communicates with$", r"\s+talk to$", r"\s+talks to$",
        r"\s+connected to$", r"\s+linked to$", r"\s+related to$", r"\s+meet$", r"\s+meets$"
    ]
    for tp in TRAILING_PATTERNS:
        q = re.sub(tp, "", q, flags=re.IGNORECASE).strip()
        
    return clean_query_text(q)


def get_risk_level(score: float) -> str:
    """Converts a numerical risk score into a standardized risk level."""
    if score >= 0.7:
        return "HIGH"
    elif score >= 0.4:
        return "MEDIUM"
    return "LOW"

def format_entity_link(entity: Dict[str, Any]) -> str:
    """Creates an interactive markdown entity link with the entity ID."""
    name = entity.get("name", "Unknown Entity")
    ent_id = str(entity.get("_id", entity.get("id", "")))
    return f"[{name}](entity:{ent_id})"

# ==============================================================================
# 2. CHAT MEMORY & PRONOUN RESOLUTION
# ==============================================================================

PRONOUN_PATTERNS = [
    r"\bhe\b", r"\bhim\b", r"\bhis\b",
    r"\bshe\b", r"\bher\b", r"\bhers\b",
    r"\bthey\b", r"\bthem\b", r"\btheir\b",
    r"\bthis person\b", r"\bthis suspect\b", r"\bthis entity\b",
    r"\bthis organization\b", r"\bthat person\b", r"\bthe suspect\b"
]

def resolve_subject_from_history(query: str, history: List[Dict[str, str]], entities: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Inspects previous conversation history working backwards to resolve pronouns
    or context carryover to the most recently discussed entity in the active case.
    """
    query_lower = query.lower()
    has_pronoun = any(re.search(p, query_lower) for p in PRONOUN_PATTERNS)
    
    # Also check if it's a direct contextual follow-up like "What about connections?"
    is_follow_up = has_pronoun or any(query_lower.startswith(w) for w in [
        "what about", "and his", "and her", "and their", "his connections", "her connections",
        "who does he", "who does she", "where did he", "where did she", "why is he", "why is she",
        "what evidence supports that", "show timeline", "what about connections"
    ])
    
    if not is_follow_up and not has_pronoun:
        return None

    # Search backward in history messages
    for msg in reversed(history):
        text = msg.get("text", "")
        # Check against all entities in active case
        for ent in entities:
            ent_name = ent.get("name", "")
            if not ent_name or len(ent_name) < 3:
                continue
            # Check if entity was mentioned in previous turn
            if ent_name.lower() in text.lower():
                return ent
            # Check entity id/code
            code = ent.get("properties", {}).get("entity_id") or ent.get("properties", {}).get("Entity ID")
            if code and str(code).lower() in text.lower():
                return ent

    return None

# ==============================================================================
# 3. ENTITY FUZZY SEARCH, ALIASES & DISAMBIGUATION
# ==============================================================================

def search_entities_fuzzy(
    entities: List[Dict[str, Any]], 
    query_name: str
) -> Tuple[List[Dict[str, Any]], bool]:
    """
    Searches case entities using multi-tiered normalized matching.
    Returns: (matched_entities, is_ambiguous)
    """
    if not query_name or not entities:
        return [], False

    norm_query = clean_query_text(query_name)
    if not norm_query:
        return [], False

    tier1_exact = []
    tier2_word_boundary = []
    tier3_prefix = []
    tier4_substring = []

    for ent in entities:
        name = ent.get("name", "")
        norm_name = clean_query_text(name)
        props = ent.get("properties", {}) or {}

        # Collect possible aliases & codes
        identifiers = [
            str(ent.get("_id", "")),
            str(props.get("entity_id", "")),
            str(props.get("Entity ID", "")),
            str(props.get("identifier", "")),
            str(props.get("code", "")),
            str(props.get("phone", "")),
            str(props.get("email", ""))
        ]
        aliases = []
        raw_aliases = props.get("aliases") or props.get("alias") or props.get("aka") or props.get("code_name")
        if isinstance(raw_aliases, list):
            aliases.extend([clean_query_text(str(a)) for a in raw_aliases])
        elif isinstance(raw_aliases, str):
            aliases.extend([clean_query_text(a) for a in raw_aliases.split(",")])

        clean_identifiers = [clean_query_text(i) for i in identifiers if i]

        # Tier 1: Exact matches on name, code, or alias, or exact phone/email
        if norm_query == norm_name or norm_query in clean_identifiers or norm_query in aliases:
            tier1_exact.append(ent)
            continue

        # Tier 2: Word boundary matching (e.g. surname "mehta" matching "Arjun Mehta" or "Arjun" matching both)
        query_words = norm_query.split()
        name_words = norm_name.split()

        # If user typed one word (e.g. "Arjun" or "Mehta")
        if len(query_words) == 1 and any(query_words[0] == w for w in name_words):
            tier2_word_boundary.append(ent)
            continue
        # If user typed multiple words and all match individual words in name
        elif len(query_words) > 1 and all(qw in name_words for qw in query_words):
            tier2_word_boundary.append(ent)
            continue

        # Tier 3: Prefix / Initial match (e.g. "Arjun M" -> "Arjun Mehta")
        if len(query_words) == 2 and len(name_words) >= 2:
            if query_words[0] == name_words[0] and (name_words[1].startswith(query_words[1]) or query_words[1].startswith(name_words[1])):
                tier3_prefix.append(ent)
                continue

        # Tier 4: Substring matching on name or identifiers (e.g. partial email or phone)
        if len(norm_query) >= 3 and (norm_query in norm_name or norm_name in norm_query or any(norm_query in i for i in clean_identifiers)):
            tier4_substring.append(ent)


    # Resolution prioritization
    if tier1_exact:
        # Check if multiple distinct entities have exact match (e.g. Person vs Organization)
        if len(tier1_exact) > 1:
            return tier1_exact, True
        return tier1_exact, False

    if tier2_word_boundary:
        if len(tier2_word_boundary) > 1:
            return tier2_word_boundary, True
        return tier2_word_boundary, False

    if tier3_prefix:
        if len(tier3_prefix) > 1:
            return tier3_prefix, True
        return tier3_prefix, False

    if tier4_substring:
        if len(tier4_substring) > 1:
            return tier4_substring, True
        return tier4_substring, False

    return [], False

# ==============================================================================
# 4. INTENT DETECTION
# ==============================================================================

def detect_request_intent(query: str) -> str:
    """
    Accurately classifies the user's investigation question into one of 11 supported request types.
    """
    q_lower = query.lower().strip()
    q_clean = clean_query_text(query)

    # 1. OUT_OF_SCOPE
    out_of_scope = [r"\b(?:weather|sports|celebrity|gossip|movie|recipe|dinner|cooking|homework)\b"]
    if any(re.search(p, q_lower) for p in out_of_scope):
        return "OUT_OF_SCOPE"

    # 2. GREETINGS & SYSTEM HELP
    greeting_patterns = [
        r"^(?:hi|hello|hey|greetings|good\s+morning|good\s+afternoon|good\s+evening)(?:\s+nexus)?$",
        r"^(?:who are you|what are you)\??$",
        r"^(?:what can you do|how can you help|help me|system help)\??$"
    ]
    if any(re.match(p, q_lower) for p in greeting_patterns):
        return "GENERAL_KNOWLEDGE"

    # 3. DATE/TIME
    if any(re.match(p, q_lower) for p in [r"^what day is today\??$", r"^what is the date\??$", r"^current date\??$", r"^what time is it\??$"]):
        return "CURRENT_DATE_TIME"

    # 4. CASE SUMMARY & CASE STATUS
    case_summary_patterns = [
        r"summarize (?:this|the|current|active)?\s*(?:case|investigation)",
        r"what is this case about",
        r"case summary",
        r"overview of this case",
        r"what is the case status",
        r"tell me about this case"
    ]
    if any(re.search(p, q_lower) for p in case_summary_patterns):
        return "CASE_SUMMARY"

    # 5. MISSING EVIDENCE / INTELLIGENCE GAPS
    gap_patterns = [
        r"missing evidence", r"intelligence gaps?", r"evidence gaps?",
        r"unverified leads?", r"prioritize for further investigation",
        r"highlight missing evidence", r"blind spots?"
    ]
    if any(re.search(p, q_lower) for p in gap_patterns):
        return "EVIDENCE_GAP"

    # 6. CONNECTION PATH / SHORTEST PATH
    path_patterns = [
        r"shortest (?:known )?path",
        r"connection between",
        r"path between",
        r"link between",
        r"how is .+ connected to",
        r"how is .+ linked to",
        r"how is .+ related to",
        r"trace (?:the )?shortest"
    ]
    if any(re.search(p, q_lower) for p in path_patterns):
        return "CONNECTION_PATH"

    # 7. RISK ANALYSIS
    risk_patterns = [
        r"highest[- ]risk", r"most dangerous", r"top threats?", r"critical entities",
        r"why is .+ high risk", r"why is .+ marked as high risk", r"explain risk (?:score )?(?:of|for)",
        r"risk factors?", r"risk analysis", r"threat assessment"
    ]
    if any(re.search(p, q_lower) for p in risk_patterns):
        return "RISK_ANALYSIS"

    # 8. EVIDENCE LOOKUP
    evidence_patterns = [
        r"what evidence mentions", r"evidence linked to", r"evidence linking",
        r"evidence for", r"what evidence supports", r"forensic evidence",
        r"records mention"
    ]
    if any(re.search(p, q_lower) for p in evidence_patterns):
        return "EVIDENCE_LOOKUP"

    # 9. TIMELINE LOOKUP
    timeline_patterns = [
        r"what happened to .+ on", r"what happened on", r"timeline of",
        r"show .+ timeline", r"chronological", r"sequence of events",
        r"event history", r"itinerary"
    ]
    if any(re.search(p, q_lower) for p in timeline_patterns):
        return "TIMELINE_LOOKUP"

    # 10. GEOGRAPHIC / LOCATION
    location_patterns = [
        r"where has .+ been", r"known locations?", r"locations? (?:associated with|of)",
        r"where was .+ seen", r"geographic", r"travel history"
    ]
    if any(re.search(p, q_lower) for p in location_patterns):
        return "GEOGRAPHIC_INFO"

    # 11. ENTITY RELATIONSHIPS
    rel_patterns = [
        r"who is .+ connected to", r"who does .+ communicate with",
        r"who does .+ talk to", r"who does .+ meet",
        r"what organizations? (?:are|is) connected to",
        r"relationships? of", r"connections? of", r"what about (?:his|her|their) connections"
    ]
    if any(re.search(p, q_lower) for p in rel_patterns):
        return "ENTITY_RELATIONSHIPS"

    # 12. NETWORK ANALYSIS / CENTRALITY
    network_patterns = [
        r"most central", r"centrality", r"network analysis", r"graph density",
        r"central hub", r"node degree"
    ]
    if any(re.search(p, q_lower) for p in network_patterns):
        return "NETWORK_ANALYSIS"

    # 13. GENERAL INVESTIGATION QUESTIONS
    general_concepts = [
        r"what is a 2-hop", r"what does a high-risk entity mean", r"why is network analysis useful",
        r"what does this relationship mean", r"what does .+ mean in investigation",
        r"what is centrality", r"what is a link chart"
    ]
    if any(re.search(p, q_lower) for p in general_concepts):
        return "GENERAL_KNOWLEDGE"

    # 14. ENTITY PROFILE / IDENTIFICATION (Default for queries with named entities)
    profile_patterns = [
        r"^who is\s+", r"^tell me about\s+", r"^what do you know about\s+",
        r"^who is .+ in this case", r"^profile of\s+", r"^identify\s+"
    ]
    if any(re.search(p, q_lower) for p in profile_patterns):
        return "ENTITY_PROFILE"

    # Fallback to general inquiry
    return "GENERAL_INQUIRY"

# ==============================================================================
# 5. RESPONSE BUILDERS & FORMATTERS (STRICT ZERO-HALLUCINATION)
# ==============================================================================

def format_disambiguation_response(matches: List[Dict[str, Any]]) -> str:
    """Renders the required disambiguation prompt when multiple entities match."""
    lines = [f"I found {len(matches)} possible matches:\n"]
    for i, ent in enumerate(matches, 1):
        name = ent.get("name", "Unknown")
        ent_type = ent.get("type", "ENTITY").upper()
        lines.append(f"{i}. {name} — {ent_type}")
    lines.append("\nWhich one do you mean?")
    return "\n".join(lines)

def format_entity_not_found_response(query_name: str) -> str:
    """Renders the standardized not-found response without hallucination."""
    display_name = query_name if query_name else "the requested entity"
    # Capitalize for display if possible
    words = [w.capitalize() for w in display_name.split()]
    display_name_formatted = " ".join(words)

    return (
        f"I couldn't find an entity named '{display_name_formatted}' in the active case.\n\n"
        f"I searched the available case entities and evidence.\n\n"
        f"You can try:\n"
        f"• a different spelling\n"
        f"• surname only\n"
        f"• entity ID\n"
        f"• phone/email\n"
        f"• another identifier"
    )

def format_entity_profile_response(
    entity: Dict[str, Any],
    relationships: List[Dict[str, Any]],
    evidence_docs: List[Dict[str, Any]],
    timeline_events: List[Dict[str, Any]],
    entity_map: Dict[str, Dict[str, Any]]
) -> str:
    """
    Formats the complete Entity Profile strictly according to section 5 of instructions.
    Only shows sections and fields for which actual data exists in the active case.
    """
    lines = ["ENTITY PROFILE", "────────────────\n"]
    
    # Header fields
    name = entity.get("name", "Unknown")
    ent_type = entity.get("type", "ENTITY").upper()
    ent_id = str(entity.get("_id", entity.get("id", "")))
    props = entity.get("properties", {}) or {}

    lines.append(f"Name: {format_entity_link(entity)}")
    lines.append(f"Type: {ent_type}")
    code = props.get("entity_id") or props.get("Entity ID") or props.get("identifier") or props.get("code")
    if code:
        lines.append(f"Entity ID: {code}")

    # Check clearance status
    is_cleared = (
        props.get("is_cleared") is True
        or entity.get("disposition") in ["CLEARED", "INNOCENT"]
        or props.get("disposition") in ["INNOCENT", "CLEARED"]
        or props.get("clearance_status") == "FREE_TO_GO"
    )

    if is_cleared:
        lines.append("\nDISPOSITION / STATUS")
        lines.append("Status: CLEARED / INNOCENT (Free to Go)")
        if props.get("resolution_notes"):
            lines.append(f"Clearance Note: {props.get('resolution_notes')}")
        prev_risk = props.get("previous_risk_score")
        if prev_risk is not None:
            lines.append(f"Risk Score: 0.00 — Cleared (Prior Risk: {float(prev_risk):.2f})")
        else:
            lines.append("Risk Score: 0.00 — Cleared of suspicion")
        lines.append("Risk Level: CLEARED (Free to Go)")
    else:
        # Risk
        risk_score = float(entity.get("risk_score", 0.0))
        risk_level = get_risk_level(risk_score)
        lines.append("\nRISK")
        lines.append(f"Risk Score: {risk_score:.2f} — {risk_level.capitalize()}")
        lines.append(f"Risk Level: {risk_level}")

    # Known Information
    known_info = []
    role = props.get("role") or props.get("Role / Description") or props.get("description") or entity.get("description")
    if role and str(role).strip():
        known_info.append(f"• Role: {role}")
    org = props.get("associated_organization") or props.get("organization") or props.get("company")
    if org and str(org).strip():
        known_info.append(f"• Associated organization: {org}")
    loc = props.get("city") or props.get("known_location") or props.get("location")
    if loc and str(loc).strip():
        known_info.append(f"• Known location: {loc}")
    phone = props.get("phone") or props.get("phone_number")
    if phone and str(phone).strip():
        known_info.append(f"• Phone: {phone}")
    email = props.get("email")
    if email and str(email).strip():
        known_info.append(f"• Email: {email}")

    for k, v in props.items():
        if k.lower() not in ["role", "role / description", "description", "associated_organization", "organization", "company", "city", "known_location", "location", "phone", "phone_number", "email", "entity_id", "entity id", "code", "identifier", "aliases", "alias", "aka"]:
            if v and str(v).strip():
                known_info.append(f"• {k.capitalize()}: {v}")

    if known_info:
        lines.append("\nKNOWN INFORMATION")
        lines.extend(known_info)

    # Relationships involving this entity
    rel_lines = []
    connected_entity_ids = set()
    for r in relationships:
        src_id = str(r.get("source_entity_id", ""))
        tgt_id = str(r.get("target_entity_id", ""))
        rel_type = r.get("type", "CONNECTED_TO").replace("_", " ").upper()
        
        if src_id == ent_id:
            tgt_ent = entity_map.get(tgt_id)
            if tgt_ent:
                rel_lines.append(f"• {format_entity_link(tgt_ent)} — {rel_type}")
                connected_entity_ids.add(tgt_id)
        elif tgt_id == ent_id:
            src_ent = entity_map.get(src_id)
            if src_ent:
                rel_lines.append(f"• {format_entity_link(src_ent)} — {rel_type}")
                connected_entity_ids.add(src_id)

    if rel_lines:
        lines.append("\nRELATIONSHIPS")
        lines.extend(rel_lines[:15])

    # Evidence linking to entity
    ev_lines = []
    for ev in evidence_docs:
        ev_title = ev.get("title", "Evidence")
        raw_text = ev.get("raw_content", "") or ""
        # Check if entity name or code is in evidence text/title
        if name.lower() in raw_text.lower() or name.lower() in ev_title.lower() or (code and str(code).lower() in raw_text.lower()):
            desc = ev.get("summary") or ev_title
            ev_lines.append(f"• {ev_title} — {desc[:80]}")

    # Also check relationships evidence_ids
    for r in relationships:
        if str(r.get("source_entity_id")) == ent_id or str(r.get("target_entity_id")) == ent_id:
            for ev_id in r.get("evidence_ids", []):
                ev_match = next((e for e in evidence_docs if str(e.get("_id", "")) == str(ev_id)), None)
                if ev_match:
                    item = f"• {ev_match.get('title', 'Evidence')} — Corroborates relationship"
                    if item not in ev_lines:
                        ev_lines.append(item)

    if ev_lines:
        lines.append("\nEVIDENCE")
        lines.extend(ev_lines[:8])

    # Timeline events
    tl_lines = []
    for tl in timeline_events:
        t_title = tl.get("title", "")
        t_msg = tl.get("message", "")
        if name.lower() in t_title.lower() or name.lower() in t_msg.lower() or (code and str(code).lower() in t_msg.lower()):
            ts = tl.get("timestamp", "")
            time_part = str(ts)[:16] if ts else "Recorded Date"
            tl_lines.append(f"• {time_part} — {t_title or t_msg}")

    if tl_lines:
        lines.append("\nTIMELINE")
        lines.extend(tl_lines[:6])

    # Locations
    loc_lines = []
    for cid in connected_entity_ids:
        connected = entity_map.get(cid)
        if connected and connected.get("type", "").upper() == "LOCATION":
            loc_lines.append(f"• {connected.get('name')}")
    if loc and str(loc).strip() and f"• {loc}" not in loc_lines:
        loc_lines.append(f"• {loc}")

    if loc_lines:
        lines.append("\nLOCATIONS")
        lines.extend(loc_lines)

    # Investigation Notes
    notes = entity.get("notes") or props.get("notes")
    if notes and str(notes).strip():
        lines.append("\nINVESTIGATION NOTES")
        lines.append(f"• {notes}")

    # Auditable Source & Confidence
    if is_cleared:
        lines.append("\nThe entity is currently classified as CLEARED / INNOCENT (Free to Go).")
    else:
        lines.append(f"\nThe entity is currently classified as {risk_level} RISK.")
    lines.append("\nSource:\nEntity Database → Active Case Graph")
    lines.append("Confidence:\nHIGH")

    return "\n".join(lines)

def format_relationships_response(
    entity: Dict[str, Any],
    relationships: List[Dict[str, Any]],
    all_entities_map: Dict[str, Dict[str, Any]],
    G: nx.Graph,
    filter_type: Optional[str] = None
) -> str:
    """Formats direct connections and calculated 2-hop connections."""
    name = entity.get("name", "Unknown")
    ent_id = str(entity.get("_id", entity.get("id", "")))

    direct_connections = []
    direct_ids = set()

    for r in relationships:
        src_id = str(r.get("source_entity_id", ""))
        tgt_id = str(r.get("target_entity_id", ""))
        rel_type = r.get("type", "CONNECTED_TO").upper()

        if src_id == ent_id:
            other = all_entities_map.get(tgt_id)
            if other:
                if not filter_type or other.get("type", "").upper() == filter_type.upper() or filter_type.upper() in rel_type:
                    direct_connections.append((other, rel_type))
                    direct_ids.add(tgt_id)
        elif tgt_id == ent_id:
            other = all_entities_map.get(src_id)
            if other:
                if not filter_type or other.get("type", "").upper() == filter_type.upper() or filter_type.upper() in rel_type:
                    direct_connections.append((other, rel_type))
                    direct_ids.add(src_id)

    if not direct_connections:
        spec_text = f" of type {filter_type}" if filter_type else ""
        return (
            f"No direct connections{spec_text} were found for {format_entity_link(entity)} in the current case data.\n\n"
            f"Source:\nCase Relationship Graph\nConfidence:\nHIGH"
        )

    lines = ["DIRECT CONNECTIONS\n"]
    for i, (other, rel_type) in enumerate(direct_connections, 1):
        lines.append(f"{i}. {format_entity_link(other)}")
        lines.append(f"   Relationship: {rel_type}\n")

    # Calculate 2-hop connections from actual graph data
    two_hop_items = []
    if ent_id in G:
        for intermediate_id in G.neighbors(ent_id):
            inter_ent = all_entities_map.get(intermediate_id)
            for hop2_id in G.neighbors(intermediate_id):
                if hop2_id != ent_id and hop2_id not in direct_ids:
                    hop2_ent = all_entities_map.get(hop2_id)
                    if hop2_ent and inter_ent:
                        item = f"• {format_entity_link(hop2_ent)} via {inter_ent.get('name')}"
                        if item not in two_hop_items:
                            two_hop_items.append(item)

    if two_hop_items:
        lines.append("2-hop connections:")
        lines.extend(two_hop_items[:8])

    lines.append("\nSource:\nCase Relationship Graph")
    lines.append("Confidence:\nHIGH")
    return "\n".join(lines)

def format_connection_path_response(
    ent1: Dict[str, Any],
    ent2: Dict[str, Any],
    path: List[str],
    relationships: List[Dict[str, Any]],
    all_entities_map: Dict[str, Dict[str, Any]]
) -> str:
    """Formats topological path traversal with vertical arrows and relationship chains."""
    if not path or len(path) < 2:
        return (
            f"No known connection was found between {format_entity_link(ent1)} and {format_entity_link(ent2)} in the current case data.\n\n"
            f"Source:\nNetwork Graph Traversal\nConfidence:\nHIGH"
        )

    chain_entities = [all_entities_map.get(nid) for nid in path if all_entities_map.get(nid)]
    if len(chain_entities) < 2:
        return "No known connection was found between these entities in the current case data."

    lines = ["CONNECTION FOUND\n"]
    
    # Vertical visual diagram
    for i, ent in enumerate(chain_entities):
        lines.append(format_entity_link(ent))
        if i < len(chain_entities) - 1:
            lines.append("↓")

    lines.append("\nRelationship chain:\n")
    
    rel_types = []
    for i in range(len(chain_entities) - 1):
        src = chain_entities[i]
        tgt = chain_entities[i+1]
        src_id = str(src.get("_id", src.get("id", "")))
        tgt_id = str(tgt.get("_id", tgt.get("id", "")))

        # Find relationship edge
        matched_rel = next(
            (r for r in relationships if 
             (str(r.get("source_entity_id")) == src_id and str(r.get("target_entity_id")) == tgt_id) or
             (str(r.get("source_entity_id")) == tgt_id and str(r.get("target_entity_id")) == src_id)),
            None
        )
        r_type = matched_rel.get("type", "CONNECTED_TO").upper() if matched_rel else "LINKED_TO"
        rel_types.append(r_type)

        lines.append(format_entity_link(src))
        lines.append(f"→ {r_type}")
        lines.append(f"→ {format_entity_link(tgt)}\n")

    lines.append(f"Path length: {len(chain_entities) - 1} relationships")
    lines.append("\nSource:\nNetwork Graph Traversal")
    lines.append("Confidence:\nHIGH")
    return "\n".join(lines)

def format_risk_analysis_response(
    entity: Dict[str, Any],
    relationships: List[Dict[str, Any]],
    evidence_docs: List[Dict[str, Any]],
    all_entities_map: Dict[str, Dict[str, Any]]
) -> str:
    """Explains risk factors strictly supported by actual case data."""
    name = entity.get("name", "Unknown")
    ent_id = str(entity.get("_id", entity.get("id", "")))
    score = float(entity.get("risk_score", 0.0))
    level = get_risk_level(score)
    props = entity.get("properties", {}) or {}

    is_cleared = (
        props.get("is_cleared") is True
        or entity.get("disposition") in ["CLEARED", "INNOCENT"]
        or props.get("disposition") in ["INNOCENT", "CLEARED"]
        or props.get("clearance_status") == "FREE_TO_GO"
    )
    if is_cleared:
        lines = [f"{name.upper()} — RISK ANALYSIS\n"]
        lines.append("Risk Score: 0.00")
        lines.append("Risk Level: CLEARED / INNOCENT\n")
        lines.append("Contributing factors:")
        lines.append("• Subject was investigated and cleared as INNOCENT (Free to Go) by investigator.")
        if props.get("resolution_notes"):
            lines.append(f"• Resolution finding: {props.get('resolution_notes')}")
        prev_risk = props.get("previous_risk_score")
        if prev_risk:
            lines.append(f"• Prior calculated risk was {float(prev_risk):.2f} (now nullified).")
        lines.append("• Entity is excluded from active threat monitoring and alerts.")
        lines.append("\nSource:\nInvestigator Intelligence Clearance Log")
        lines.append("Confidence:\nHIGH")
        return "\n".join(lines)

    lines = [f"{name.upper()} — RISK ANALYSIS\n"]
    lines.append(f"Risk Score: {score:.2f}")
    lines.append(f"Risk Level: {level}\n")

    contributing_factors = []

    # 1. High-risk connections
    high_risk_neighbors = []
    for r in relationships:
        src_id = str(r.get("source_entity_id"))
        tgt_id = str(r.get("target_entity_id"))
        if src_id == ent_id:
            other = all_entities_map.get(tgt_id)
            if other and float(other.get("risk_score", 0)) >= 0.7:
                high_risk_neighbors.append(other.get("name"))
        elif tgt_id == ent_id:
            other = all_entities_map.get(src_id)
            if other and float(other.get("risk_score", 0)) >= 0.7:
                high_risk_neighbors.append(other.get("name"))

    if high_risk_neighbors:
        contributing_factors.append(f"• Connected to {len(high_risk_neighbors)} high-risk entities ({', '.join(high_risk_neighbors[:3])})")

    # 2. Evidence appearances
    matched_ev = []
    code = props.get("entity_id") or props.get("Entity ID")
    for ev in evidence_docs:
        text = (ev.get("raw_content") or "") + " " + (ev.get("title") or "")
        if name.lower() in text.lower() or (code and str(code).lower() in text.lower()):
            matched_ev.append(ev.get("title", "Evidence"))

    if matched_ev:
        contributing_factors.append(f"• Appears in {len(matched_ev)} investigation records")

    # 3. Specific role or notes flags
    role = props.get("role") or props.get("Role / Description")
    if role:
        contributing_factors.append(f"• Recorded operational role: {role}")

    # 4. Association with flagged entities/organizations
    flagged_orgs = [
        all_entities_map.get(str(r.get("target_entity_id") if str(r.get("source_entity_id")) == ent_id else r.get("source_entity_id")))
        for r in relationships if (str(r.get("source_entity_id")) == ent_id or str(r.get("target_entity_id")) == ent_id)
    ]
    for fo in flagged_orgs:
        if fo and fo.get("type", "").upper() == "ORGANIZATION" and float(fo.get("risk_score", 0)) >= 0.6:
            contributing_factors.append(f"• Associated with flagged organization '{fo.get('name')}'")
            break

    if not contributing_factors:
        contributing_factors.append("• Elevated threat metric assigned based on intelligence indicators.")

    lines.append("Contributing factors:")
    lines.extend(contributing_factors)

    if matched_ev:
        lines.append("\nEvidence:")
        for ev_title in matched_ev[:5]:
            lines.append(f"• {ev_title}")

    lines.append("\nSource:\nEntity Database → Active Risk Analysis")
    lines.append("Confidence:\nHIGH")
    return "\n".join(lines)

def format_highest_risk_entities_response(
    entities: List[Dict[str, Any]],
    relationships: List[Dict[str, Any]]
) -> str:
    """Lists and ranks highest-risk entities in active case."""
    active_ents = [
        e for e in entities
        if not (
            (e.get("properties", {}) or {}).get("is_cleared") is True
            or e.get("disposition") in ["CLEARED", "INNOCENT"]
            or (e.get("properties", {}) or {}).get("clearance_status") == "FREE_TO_GO"
        )
    ]
    sorted_ents = sorted(active_ents, key=lambda e: float(e.get("risk_score", 0.0)), reverse=True)
    high_threats = [e for e in sorted_ents if float(e.get("risk_score", 0.0)) >= 0.7]

    if not high_threats:
        high_threats = sorted_ents[:5]

    lines = ["HIGHEST-RISK ENTITIES IN ACTIVE CASE\n"]
    for i, ent in enumerate(high_threats[:6], 1):
        score = float(ent.get("risk_score", 0.0))
        level = get_risk_level(score)
        role = ent.get("properties", {}).get("role") or ent.get("properties", {}).get("Role / Description") or ent.get("type", "Entity")
        lines.append(f"{i}. {format_entity_link(ent)} — {ent.get('type')}")
        lines.append(f"   Risk Score: {score:.2f} ({level})")
        if role:
            lines.append(f"   Role: {role}")
        lines.append("")

    lines.append("Source:\nActive Risk Assessment Engine")
    lines.append("Confidence:\nHIGH")
    return "\n".join(lines)

def format_case_summary_response(
    case_doc: Optional[Dict[str, Any]],
    entities: List[Dict[str, Any]],
    relationships: List[Dict[str, Any]],
    evidence_docs: List[Dict[str, Any]]
) -> str:
    """Formats complete structured case summary."""
    case_name = case_doc.get("name", "Active Investigation") if case_doc else "Active Investigation"
    case_id = str(case_doc.get("_id", "ACTIVE")) if case_doc else "ACTIVE"
    case_status = case_doc.get("status", "OPEN") if case_doc else "OPEN"
    created_date = str(case_doc.get("created_at", ""))[:10] if case_doc and case_doc.get("created_at") else datetime.utcnow().strftime("%Y-%m-%d")
    desc = case_doc.get("description", "Active multi-entity investigation.") if case_doc else "Active investigation."

    lines = ["CASE SUMMARY\n"]
    lines.append(f"Case: {case_name}")
    lines.append(f"Case ID: {case_id}")
    lines.append(f"Status: {case_status}")
    lines.append(f"Date: {created_date}\n")

    lines.append("Overview:")
    lines.append(f"{desc}\n")

    persons = [format_entity_link(e) for e in entities if e.get("type", "").upper() == "PERSON"]
    if persons:
        lines.append(f"KEY ENTITIES:\n• " + "\n• ".join(persons[:6]) + "\n")

    orgs = [format_entity_link(e) for e in entities if e.get("type", "").upper() == "ORGANIZATION"]
    if orgs:
        lines.append(f"KEY ORGANIZATIONS:\n• " + "\n• ".join(orgs[:5]) + "\n")

    locs = [format_entity_link(e) for e in entities if e.get("type", "").upper() == "LOCATION"]
    if locs:
        lines.append(f"KEY LOCATIONS:\n• " + "\n• ".join(locs[:5]) + "\n")

    high_risk = [f"{format_entity_link(e)} ({e.get('risk_score', 0):.2f})" for e in entities if float(e.get("risk_score", 0)) >= 0.7]
    if high_risk:
        lines.append(f"HIGH-RISK ENTITIES:\n• " + "\n• ".join(high_risk[:5]) + "\n")

    if relationships:
        ent_map = {str(e["_id"]): e.get("name", "Unknown") for e in entities}
        imp_rels = []
        for r in relationships[:5]:
            s_name = ent_map.get(str(r.get("source_entity_id")), "Unknown")
            t_name = ent_map.get(str(r.get("target_entity_id")), "Unknown")
            imp_rels.append(f"• {s_name} — {r.get('type')} → {t_name}")
        lines.append("IMPORTANT RELATIONSHIPS:\n" + "\n".join(imp_rels) + "\n")

    if evidence_docs:
        ev_items = [f"• {ev.get('title', 'Evidence Record')}" for ev in evidence_docs[:5]]
        lines.append("EVIDENCE:\n" + "\n".join(ev_items) + "\n")

    lines.append("CURRENT INVESTIGATION STATUS:")
    lines.append(f"Active intelligence graph contains {len(entities)} verified entities, {len(relationships)} linkages, and {len(evidence_docs)} evidence records under active forensic review.\n")
    lines.append("Source:\nActive Case Intelligence Dossier\nConfidence:\nHIGH")

    return "\n".join(lines)

def format_evidence_response(entity: Dict[str, Any], evidence_docs: List[Dict[str, Any]], relationships: List[Dict[str, Any]]) -> str:
    """Formats evidence records linked to a specific entity."""
    name = entity.get("name", "Unknown")
    ent_id = str(entity.get("_id", entity.get("id", "")))
    props = entity.get("properties", {}) or {}
    code = props.get("entity_id") or props.get("Entity ID")

    matched_evidence = []
    for ev in evidence_docs:
        title = ev.get("title", "Evidence Record")
        text = (ev.get("raw_content") or "") + " " + title
        if name.lower() in text.lower() or (code and str(code).lower() in text.lower()):
            matched_evidence.append(ev)

    if not matched_evidence:
        return (
            f"No evidence currently links to {format_entity_link(entity)} in the available case files.\n\n"
            f"Source:\nCase Evidence Repository\nConfidence:\nHIGH"
        )

    lines = [f"EVIDENCE LINKED TO {name.upper()}\n"]
    for ev in matched_evidence[:6]:
        title = ev.get("title", "Evidence Record")
        ev_type = ev.get("source_type") or ev.get("file_type") or "Case Document"
        created_at = str(ev.get("created_at", ""))[:10]
        content_preview = (ev.get("raw_content") or "").strip()
        finding = content_preview[:120] + "..." if len(content_preview) > 120 else (content_preview or "Evidentiary record indexed.")

        lines.append(f"{title}")
        lines.append(f"Type: {ev_type}")
        if created_at:
            lines.append(f"Date: {created_at}")
        lines.append(f"Finding: {finding}\n")

    lines.append("Source:\nCase Evidence Repository\nConfidence:\nHIGH")
    return "\n".join(lines)

MONTH_MAP = {
    "jan": "01", "january": "01",
    "feb": "02", "february": "02",
    "mar": "03", "march": "03",
    "apr": "04", "april": "04",
    "may": "05",
    "jun": "06", "june": "06",
    "jul": "07", "july": "07",
    "aug": "08", "august": "08",
    "sep": "09", "september": "09",
    "oct": "10", "october": "10",
    "nov": "11", "november": "11",
    "dec": "12", "december": "12"
}

def match_date_in_event(query_date: str, event_text: str) -> bool:
    if not query_date or not event_text:
        return False
    qd = clean_query_text(query_date)
    et = clean_query_text(event_text)
    if qd in et:
        return True

    m = re.search(r"(\d{1,2})\s+([a-zA-Z]+)|([a-zA-Z]+)\s+(\d{1,2})", query_date)
    if m:
        day = m.group(1) or m.group(4)
        month_name = (m.group(2) or m.group(3)).lower()
        month_num = MONTH_MAP.get(month_name)
        if month_num and day:
            day_padded = day.zfill(2)
            patterns = [
                f"-{month_num}-{day_padded}",
                f"/{month_num}/{day_padded}",
                f"{day_padded}/{month_num}",
                f"{month_name[:3]} {day}",
                f"{day} {month_name[:3]}"
            ]
            if any(p.lower() in event_text.lower() for p in patterns):
                return True

    return False

def format_timeline_response(entity: Optional[Dict[str, Any]], timeline_events: List[Dict[str, Any]], query_date: Optional[str] = None) -> str:
    """Formats chronological timeline for an entity or the overall case."""
    if entity:
        name = entity.get("name", "Unknown")
        props = entity.get("properties", {}) or {}
        code = props.get("entity_id") or props.get("Entity ID")
        filtered_events = [
            ev for ev in timeline_events
            if name.lower() in (ev.get("title", "") + " " + ev.get("message", "")).lower() or
            (code and str(code).lower() in (ev.get("message", "")).lower())
        ]
        heading = f"{name.upper()} — TIMELINE"
    else:
        filtered_events = timeline_events
        heading = "CASE TIMELINE"

    if query_date:
        date_filtered = [
            ev for ev in filtered_events
            if match_date_in_event(query_date, str(ev.get("timestamp", "")) + " " + ev.get("title", "") + " " + ev.get("message", ""))
        ]
        if date_filtered:
            filtered_events = date_filtered
        else:
            ent_str = f" for {entity.get('name')}" if entity else ""
            return (
                f"No chronological timeline events are recorded{ent_str} on '{query_date}' in the active case data.\n\n"
                f"Source:\nChronological Event Logs\nConfidence:\nHIGH"
            )


    if not filtered_events:
        ent_str = f" for {entity.get('name')}" if entity else ""
        return (
            f"No chronological timeline events are currently recorded{ent_str} in the active case data.\n\n"
            f"Source:\nChronological Event Logs\nConfidence:\nHIGH"
        )

    lines = [f"{heading}\n"]
    for ev in filtered_events[:12]:
        ts = str(ev.get("timestamp", ""))
        date_str = ts[:10] if len(ts) >= 10 else "Recorded Date"
        time_str = ts[11:16] if len(ts) >= 16 else ""
        title = ev.get("title") or ev.get("message") or "Investigation Event"
        
        lines.append(date_str)
        if time_str:
            lines.append(time_str)
        lines.append(f"{title}\n")

    lines.append("Source:\nChronological Event Logs\nConfidence:\nHIGH")
    return "\n".join(lines)


def format_locations_response(
    entity: Dict[str, Any],
    relationships: List[Dict[str, Any]],
    evidence_docs: List[Dict[str, Any]],
    all_entities_map: Dict[str, Dict[str, Any]]
) -> str:
    """Formats locations associated with an entity."""
    name = entity.get("name", "Unknown")
    ent_id = str(entity.get("_id", entity.get("id", "")))
    props = entity.get("properties", {}) or {}
    
    locations = []
    
    # 1. Connected LOCATION entities
    for r in relationships:
        src_id = str(r.get("source_entity_id"))
        tgt_id = str(r.get("target_entity_id"))
        other_id = tgt_id if src_id == ent_id else src_id if tgt_id == ent_id else None
        if other_id:
            other = all_entities_map.get(other_id)
            if other and other.get("type", "").upper() == "LOCATION":
                ev_id = r.get("evidence_ids", [None])[0] if r.get("evidence_ids") else "Relationship Graph"
                locations.append((other.get("name"), ev_id))

    # 2. Entity city / location property
    city = props.get("city") or props.get("known_location") or props.get("location")
    if city and str(city).strip():
        if not any(loc[0].lower() == str(city).lower() for loc in locations):
            locations.append((str(city), "Entity Dossier"))

    if not locations:
        return (
            f"No location information is currently available for {format_entity_link(entity)} in the active case data.\n\n"
            f"Source:\nLocation Intelligence & Travel Records\nConfidence:\nHIGH"
        )

    lines = [f"KNOWN LOCATIONS FOR {name.upper()}\n"]
    for i, (loc_name, src) in enumerate(locations, 1):
        lines.append(f"{i}. {loc_name}")
        lines.append(f"   Source: {src}\n")

    lines.append("Source:\nLocation Intelligence & Travel Records\nConfidence:\nHIGH")
    return "\n".join(lines)

def format_intelligence_gaps_response(
    case_doc: Optional[Dict[str, Any]],
    entities: List[Dict[str, Any]],
    relationships: List[Dict[str, Any]],
    evidence_docs: List[Dict[str, Any]]
) -> str:
    """Analyzes real active case data to identify priority intelligence gaps and uncorroborated leads."""
    case_name = case_doc.get("name", "Active Case") if case_doc else "Active Case"

    lines = ["INTELLIGENCE GAPS & MISSING EVIDENCE", "──────────────────────────────────────\n"]
    lines.append(f"Case: {case_name}\n")

    gaps = []
    # Check high-risk entities with single connection
    ent_degrees = {}
    for r in relationships:
        s = str(r.get("source_entity_id"))
        t = str(r.get("target_entity_id"))
        ent_degrees[s] = ent_degrees.get(s, 0) + 1
        ent_degrees[t] = ent_degrees.get(t, 0) + 1

    for ent in entities:
        score = float(ent.get("risk_score", 0.0))
        eid = str(ent.get("_id", ent.get("id", "")))
        deg = ent_degrees.get(eid, 0)
        if score >= 0.7 and deg <= 1:
            gaps.append(f"• High-risk entity {format_entity_link(ent)} has only {deg} recorded connection. Additional communication & associate records needed.")

    # Check unverified / low-confidence relationships
    unverified = [r for r in relationships if float(r.get("confidence", 1.0)) < 0.7]
    if unverified:
        gaps.append(f"• {len(unverified)} relationship links have confidence below 70% and require corroboration from secondary evidence.")

    # Check entities lacking location data
    unlocated_persons = [e for e in entities if e.get("type", "").upper() == "PERSON" and not e.get("properties", {}).get("city")]
    if len(unlocated_persons) >= 3:
        sample_names = ", ".join([e.get("name") for e in unlocated_persons[:3]])
        gaps.append(f"• Geographic gap: Key persons ({sample_names}) currently have no verified base of operations or residential logs.")

    if not gaps:
        gaps.append("• No critical gaps detected. Corroborate high-traffic communication hubs against physical access logs.")

    lines.append("PRIORITY GAPS IDENTIFIED:")
    lines.extend(gaps)

    lines.append("\nRECOMMENDED INVESTIGATIVE ACTIONS:")
    lines.append("1. Subpoena communication detail records (CDRs) for key suspects.")
    lines.append("2. Cross-reference warehouse access timestamps against automated license plate recognition (ALPR).")
    lines.append("3. Verify beneficial ownership of linked accounts and corporate entities.")

    lines.append("\nSource:\nAutomated Gap Analysis Engine\nConfidence:\nHIGH")
    return "\n".join(lines)

def format_network_analysis_response(
    entities: List[Dict[str, Any]],
    relationships: List[Dict[str, Any]],
    G: nx.Graph
) -> str:
    """Computes real NetworkX network analytics for active case."""
    lines = ["NETWORK ANALYSIS REPORT", "───────────────────────\n"]
    lines.append(f"Total Nodes (Entities): {len(entities)}")
    lines.append(f"Total Edges (Relationships): {len(relationships)}")

    if len(G) > 0 and len(relationships) > 0:
        density = nx.density(G)
        lines.append(f"Network Density: {density:.3f}\n")

        degrees = dict(G.degree())
        top_hubs = sorted(degrees.items(), key=lambda x: x[1], reverse=True)[:5]

        ent_map = {str(e["_id"]): e for e in entities}
        lines.append("CENTRAL HUBS (BY DEGREE CONNECTIVITY):")
        for i, (nid, deg) in enumerate(top_hubs, 1):
            ent = ent_map.get(nid)
            if ent:
                lines.append(f"{i}. {format_entity_link(ent)} ({ent.get('type')}) — {deg} direct connections")

    lines.append("\nSource:\nNetworkX Topological Graph Engine\nConfidence:\nHIGH")
    return "\n".join(lines)

def format_general_knowledge_response(query: str) -> str:
    """Answers general investigative and conceptual questions with explicit distinction."""
    q = query.lower()
    
    lines = ["GENERAL KNOWLEDGE\n"]
    if "2-hop" in q or "two-hop" in q:
        lines.append(
            "A **2-hop connection** refers to an indirect link between two entities mediated by an intermediate entity (A → B → C).\n\n"
            "In intelligence and criminal network analysis, 2-hop links are vital for uncovering coordinators, cut-outs, financial intermediaries, and concealed conduits between masterminds and operational agents."
        )
    elif "high-risk" in q or "risk score" in q:
        lines.append(
            "A **high-risk entity** is an individual, account, vehicle, or organization that exhibits critical threat metrics (typically a risk index ≥ 0.70).\n\n"
            "Risk scores are determined by factors such as: graph centrality, association with known criminal nodes, frequency of appearance in forensic evidence, and involvement in suspicious financial or logistical anomalies."
        )
    elif "network analysis" in q or "link analysis" in q:
        lines.append(
            "**Network analysis** is the practice of mapping topological structures and communication pathways between suspects, organizations, locations, and assets.\n\n"
            "It reveals key operational hubs, bottlenecks, single points of failure, and covert syndicates that are not obvious through isolated document review."
        )
    elif "who are you" in q or "what are you" in q:
        lines.append(
            "I am the **NEXUS AI Agent**, an intelligence investigation assistant.\n\n"
            "I analyze active case data, cross-examine evidence, trace shortest relationship paths, calculate threat risk scores, and reconstruct chronological timelines."
        )
    elif "what can you do" in q or "help" in q:
        lines.append(
            "I can assist you with the active investigation by performing:\n"
            "• **Entity Profiles**: Ask 'Who is [Name]?' to inspect dossiers.\n"
            "• **Relationship Tracing**: Ask 'Who is [Name] connected to?' or 'Find path between A and B'.\n"
            "• **Risk Analysis**: Ask 'Why is [Name] high risk?' or 'Who are the highest-risk entities?'.\n"
            "• **Evidence Lookup**: Ask 'What evidence mentions [Name]?'.\n"
            "• **Timeline Queries**: Ask 'Show timeline of [Name]'.\n"
            "• **Case Summaries**: Ask 'Summarize this case'."
        )
    else:
        lines.append(
            "Hello! I am the **NEXUS AI Agent**. I am connected to your active investigation case.\n\n"
            "Ask me about any suspect, organization, relationship path, risk score, or evidence record in this case."
        )

    lines.append("\nNote: This is a general investigative methodology explanation, not specific case findings.")
    return "\n".join(lines)

# ==============================================================================
# 6. MAIN INVESTIGATOR ORCHESTRATOR
# ==============================================================================

async def run_ai_investigator(
    query: str, 
    case_id: str, 
    db, 
    current_user, 
    history_context: str = "",
    history_list: Optional[List[Dict[str, str]]] = None
) -> Dict[str, Any]:
    """
    Main entry point for NEXUS AI Agent.
    Strictly follows 'Retrieve First, Answer Second'.
    """
    query_str = query.strip()
    if not query_str:
        return {"answer": "Please enter an investigation question.", "actions": [], "supporting_evidence": []}

    # Normalize history
    if history_list is None:
        history_list = []
        if history_context:
            for line in history_context.split("\n"):
                if line.startswith("User: "):
                    history_list.append({"sender": "user", "text": line[6:]})
                elif line.startswith("AI: "):
                    history_list.append({"sender": "ai", "text": line[4:]})

    # Detect intent
    intent = detect_request_intent(query_str)

    # 1. OUT OF SCOPE
    if intent == "OUT_OF_SCOPE":
        return {
            "answer": "I’m the NEXUS AI Agent, an investigation intelligence assistant. I analyze cases, evidence, entities, relationships, and network graphs, but that request is outside my area of expertise.",
            "actions": [],
            "supporting_evidence": []
        }

    # 2. GENERAL KNOWLEDGE / SYSTEM HELP
    if intent == "GENERAL_KNOWLEDGE":
        return {
            "answer": format_general_knowledge_response(query_str),
            "actions": [],
            "supporting_evidence": []
        }

    # 3. DATE & TIME
    if intent == "CURRENT_DATE_TIME":
        from datetime import datetime
        now = datetime.now()
        return {
            "answer": f"Current system date is {now.strftime('%A, %d %B %Y')} and local server time is {now.strftime('%H:%M:%S')}.",
            "actions": [],
            "supporting_evidence": []
        }

    # 4. ACTIVE CASE DATA RETRIEVAL (STRICTLY SCOPED)
    case_doc = None
    if case_id and case_id != "all":
        try:
            if ObjectId.is_valid(case_id):
                case_doc = await db["cases"].find_one({"$or": [{"_id": ObjectId(case_id)}, {"_id": case_id}, {"caseId": case_id}]})
            else:
                case_doc = await db["cases"].find_one({"$or": [{"_id": case_id}, {"caseId": case_id}]})
        except Exception as e:
            print(f"Error querying case doc: {e}")

    # Fetch entities and relationships
    if case_id and case_id != "all":
        case_filter = {"$or": [{"case_id": case_id}, {"caseId": case_id}]}
    else:
        case_filter = {}

    entities = await db["entities"].find(case_filter).to_list(None) or []
    relationships = await db["relationships"].find(case_filter).to_list(None) or []
    evidence_docs = await db["evidence"].find(case_filter).to_list(None) or []
    
    # Load timeline events
    timeline_records = await db["timeline"].find(case_filter).to_list(None) or []
    timeline_events = []
    for tl in timeline_records:
        ts = str(tl.get("timestamp") or tl.get("date") or "")
        title = tl.get("title") or tl.get("event") or ""
        msg = tl.get("description") or tl.get("message") or ""
        timeline_events.append({"timestamp": ts, "title": title, "message": msg})

    # Add temporal relationships and entities to timeline
    entity_map = {str(e["_id"]): e for e in entities}
    for r in relationships:
        props = r.get("properties") or {}
        ts = props.get("timestamp") or props.get("date") or props.get("time")
        if ts:
            s_name = entity_map.get(str(r.get("source_entity_id")), {}).get("name", "Unknown")
            t_name = entity_map.get(str(r.get("target_entity_id")), {}).get("name", "Unknown")
            timeline_events.append({
                "timestamp": str(ts),
                "title": f"{r.get('type', 'LINK')} Record",
                "message": f"{s_name} linked to {t_name} via {r.get('type')}"
            })

    timeline_events.sort(key=lambda x: str(x.get("timestamp", "")))

    # Build NetworkX graph
    G = build_graph(entities, relationships)

    # 5. CASE SUMMARY ROUTE
    if intent == "CASE_SUMMARY":
        if not case_id or case_id == "all":
            return {
                "answer": "Please select a specific active case to view its complete summary.",
                "actions": [],
                "supporting_evidence": []
            }
        ans = format_case_summary_response(case_doc, entities, relationships, evidence_docs)
        return {"answer": ans, "actions": [], "supporting_evidence": ["Active Case Intelligence Dossier"]}

    # 6. MISSING EVIDENCE / INTELLIGENCE GAPS
    if intent == "EVIDENCE_GAP":
        ans = format_intelligence_gaps_response(case_doc, entities, relationships, evidence_docs)
        return {"answer": ans, "actions": [], "supporting_evidence": ["Automated Gap Analysis Engine"]}

    # 7. NETWORK ANALYSIS ROUTE
    if intent == "NETWORK_ANALYSIS":
        ans = format_network_analysis_response(entities, relationships, G)
        return {"answer": ans, "actions": [], "supporting_evidence": ["NetworkX Graph Engine"]}

    # 8. CONNECTION PATH / SHORTEST PATH ROUTE
    if intent == "CONNECTION_PATH":
        # Extract the two entities from query
        path_match = re.search(r"(?:between|from)\s+([a-zA-Z0-9\s\.\-_]+?)\s+(?:and|to)\s+([a-zA-Z0-9\s\.\-_]+)", query_str, flags=re.IGNORECASE)
        if not path_match:
            path_match = re.search(r"how is\s+([a-zA-Z0-9\s\.\-_]+?)\s+connected to\s+([a-zA-Z0-9\s\.\-_]+)", query_str, flags=re.IGNORECASE)

        if path_match:
            name1 = extract_target_name(path_match.group(1))
            name2 = extract_target_name(path_match.group(2))

            matches1, amb1 = search_entities_fuzzy(entities, name1)
            matches2, amb2 = search_entities_fuzzy(entities, name2)

            if amb1:
                return {"answer": format_disambiguation_response(matches1), "actions": [], "supporting_evidence": []}
            if amb2:
                return {"answer": format_disambiguation_response(matches2), "actions": [], "supporting_evidence": []}

            if not matches1:
                return {"answer": format_entity_not_found_response(name1), "actions": [], "supporting_evidence": []}
            if not matches2:
                return {"answer": format_entity_not_found_response(name2), "actions": [], "supporting_evidence": []}

            ent1 = matches1[0]
            ent2 = matches2[0]
            start_id = str(ent1["_id"])
            target_id = str(ent2["_id"])

            path = find_shortest_path(G, start_id, target_id)
            ans = format_connection_path_response(ent1, ent2, path, relationships, entity_map)
            
            actions = []
            if path:
                actions.append({"type": "TRACE_PATH", "source": start_id, "target": target_id, "scope": case_id})

            return {"answer": ans, "actions": actions, "supporting_evidence": ["Network Graph Traversal"]}

        # If user simply clicked quick action or didn't specify two names:
        return {
            "answer": (
                "To trace the shortest known path, please specify two entities (for example: "
                f"'Find connection between [Entity A] and [Entity B]')."
            ),
            "actions": [],
            "supporting_evidence": []
        }

    # 9. RISK ANALYSIS ROUTE (HIGHEST RISK OR SPECIFIC ENTITY)
    if intent == "RISK_ANALYSIS":
        # Check if user asked about highest risk globally
        if any(w in query_str.lower() for w in ["highest", "most dangerous", "top threats", "critical entities"]):
            ans = format_highest_risk_entities_response(entities, relationships)
            return {
                "answer": ans,
                "actions": [{"type": "FILTER_RISK", "min_risk": 0.7, "scope": case_id}],
                "supporting_evidence": ["Active Risk Assessment Engine"]
            }

    # 10. ENTITY RESOLUTION (FOR PROFILE, RELATIONSHIPS, RISK, EVIDENCE, TIMELINE, LOCATIONS)
    target_name = extract_target_name(query_str)
    resolved_entity = None

    # Try pronoun and chat memory resolution if target name is a pronoun or empty
    resolved_entity = resolve_subject_from_history(query_str, history_list, entities)

    if not resolved_entity and target_name:
        matches, is_ambiguous = search_entities_fuzzy(entities, target_name)
        if is_ambiguous:
            return {
                "answer": format_disambiguation_response(matches),
                "actions": [],
                "supporting_evidence": []
            }
        if matches:
            resolved_entity = matches[0]

    # If entity was expected but not found
    if not resolved_entity and target_name and intent in ["ENTITY_PROFILE", "ENTITY_RELATIONSHIPS", "RISK_ANALYSIS", "EVIDENCE_LOOKUP", "TIMELINE_LOOKUP", "GEOGRAPHIC_INFO"]:
        # Guard against generic words
        generic_words = {"case", "investigation", "all", "evidence", "risk", "status", "overview", "data", "summary"}
        if target_name.lower() not in generic_words:
            return {
                "answer": format_entity_not_found_response(target_name),
                "actions": [],
                "supporting_evidence": []
            }

    # If we have an entity, execute the specific intent:
    if resolved_entity:
        ent_id_str = str(resolved_entity["_id"])

        if intent == "ENTITY_RELATIONSHIPS":
            # Check for filter (e.g. "communicate with", "organizations")
            filter_type = "ORGANIZATION" if "organization" in query_str.lower() else "COMMUNICATES_WITH" if "communicate" in query_str.lower() else None
            ans = format_relationships_response(resolved_entity, relationships, entity_map, G, filter_type)
            return {"answer": ans, "actions": [{"type": "FOCUS_NODE", "node_id": ent_id_str, "scope": case_id}], "supporting_evidence": ["Case Relationship Graph"]}

        elif intent == "RISK_ANALYSIS":
            ans = format_risk_analysis_response(resolved_entity, relationships, evidence_docs, entity_map)
            return {"answer": ans, "actions": [{"type": "FOCUS_NODE", "node_id": ent_id_str, "scope": case_id}], "supporting_evidence": ["Active Risk Analysis"]}

        elif intent == "EVIDENCE_LOOKUP":
            ans = format_evidence_response(resolved_entity, evidence_docs, relationships)
            return {"answer": ans, "actions": [], "supporting_evidence": ["Case Evidence Repository"]}

        elif intent == "TIMELINE_LOOKUP":
            date_match = re.search(r"on\s+(\d{1,2}(?:st|nd|rd|th)?\s+[a-zA-Z]+(?:\s+\d{2,4})?|\d{4}-\d{2}-\d{2})", query_str, re.IGNORECASE)
            query_date = date_match.group(1) if date_match else None
            ans = format_timeline_response(resolved_entity, timeline_events, query_date)
            return {"answer": ans, "actions": [], "supporting_evidence": ["Chronological Event Logs"]}

        elif intent == "GEOGRAPHIC_INFO":
            ans = format_locations_response(resolved_entity, relationships, evidence_docs, entity_map)
            return {"answer": ans, "actions": [], "supporting_evidence": ["Location Intelligence & Travel Records"]}

        else: # ENTITY_PROFILE (Default when an entity is identified)
            ans = format_entity_profile_response(resolved_entity, relationships, evidence_docs, timeline_events, entity_map)
            return {"answer": ans, "actions": [{"type": "FOCUS_NODE", "node_id": ent_id_str, "scope": case_id}], "supporting_evidence": ["Entity Database → Active Case Graph"]}

    # Overall case timeline if asked without entity
    if intent == "TIMELINE_LOOKUP":
        date_match = re.search(r"on\s+(\d{1,2}(?:st|nd|rd|th)?\s+[a-zA-Z]+(?:\s+\d{2,4})?|\d{4}-\d{2}-\d{2})", query_str, re.IGNORECASE)
        query_date = date_match.group(1) if date_match else None
        ans = format_timeline_response(None, timeline_events, query_date)
        return {"answer": ans, "actions": [], "supporting_evidence": ["Chronological Event Logs"]}


    # Fallback to general inquiry or case summary
    if len(entities) > 0:
        ans = format_case_summary_response(case_doc, entities, relationships, evidence_docs)
        return {"answer": ans, "actions": [], "supporting_evidence": ["Active Case Intelligence Dossier"]}

    return {
        "answer": "I couldn't locate relevant records for that question in the active case files.",
        "actions": [],
        "supporting_evidence": []
    }
