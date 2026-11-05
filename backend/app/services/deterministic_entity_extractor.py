"""
===================================================================
DETERMINISTIC ENTITY EXTRACTION ENGINE (NON-LLM)
===================================================================
Pure deterministic NLP, regex, gazetteers, and grammatical rule-based 
entity extraction without any LLM dependency. Supports full provenance,
standardized entity schemas, date/noise protection, and cyber-crime entities.
===================================================================
"""
import re
from typing import List, Dict, Any, Optional
from bson import ObjectId
from app.ai.entity_validator import validate_entity, normalize_entity_name

# Blocklist of terms that must never be classified as PERSON entities
NOISE_BLOCKLIST = {
    "status code", "table text", "document text", "call duration", "call type",
    "outgoing voice", "voice intercept", "cell tower", "call frequency",
    "account holder", "transaction amount", "target contact", "target vehicle",
    "location cell", "message text", "serial no", "incident summary",
    "confidential document", "investigating agency", "investigating officer",
    "crime branch", "police station", "fir no", "first information",
    "page 1", "page 2", "page 3", "page 4", "page 5", "subtotal", "vk wn",
    "noise lines", "noise", "table 1", "table 2", "table 3", "status 200",
    "row 1", "row 2", "item 1", "item 2", "transaction date", "case date",
    "document date", "court record", "charge sheet", "case diary"
}

# Known Indian Cities and Major Areas
KNOWN_LOCATIONS = {
    "mumbai", "pune", "navi mumbai", "andheri", "andheri east", "andheri west",
    "bandra", "bandra kurla complex", "bkc", "vashi", "nerul", "shivajinagar",
    "dadar", "dadar west", "dadar east", "thane", "kurla", "colaba", "worli",
    "delhi", "new delhi", "noida", "gurgaon", "gurugram", "bangalore", "bengaluru",
    "hyderabad", "chennai", "kolkata", "ahmedabad", "jaipur", "lucknow", "chandigarh",
    "connaught place", "city center mall", "riverfront service road", "pune transport yard"
}

def extract_entities_from_chunk(chunk: Dict[str, Any], case_id: str) -> List[Dict[str, Any]]:
    """
    Deterministically extracts all supported entity types from a structured chunk with provenance.
    Guarantees strict type boundaries and prevents dates/amounts/numbers from becoming PERSON.
    """
    text = chunk.get("text", "")
    if not text:
        return []

    evidence_id = chunk.get("evidence_id", "")
    source_loc = chunk.get("source_location", "Unknown Location")
    entities: List[Dict[str, Any]] = []
    seen_keys = set()

    def add_entity(canonical_val: str, display_name: str, ent_type: str, confidence: float, properties: Optional[Dict[str, Any]] = None):
        norm_type = ent_type.upper().strip()
        clean_display = display_name.strip()
        norm_display = normalize_entity_name(clean_display, norm_type)

        # Validate through centralized quality validator
        test_ent = {"name": norm_display, "type": norm_type}
        is_valid, _ = validate_entity(test_ent)
        if not is_valid:
            return

        key = (norm_display.lower(), norm_type)
        if key in seen_keys:
            return

        # Check blocklist
        if norm_type in ["PERSON", "ORGANIZATION"] and norm_display.lower() in NOISE_BLOCKLIST:
            return

        seen_keys.add(key)
        props = properties.copy() if properties else {}

        entities.append({
            "_id": str(ObjectId()),
            "case_id": case_id,
            "caseId": case_id,
            "type": norm_type,
            "name": norm_display,
            "label": norm_display,
            "canonical_value": canonical_val.strip(),
            "display_name": norm_display,
            "confidence": round(confidence, 2),
            "evidence_id": evidence_id,
            "evidence_ids": [evidence_id] if evidence_id else [],
            "source_location": source_loc,
            "page_number": chunk.get("page_number", 1),
            "paragraph_index": chunk.get("paragraph_index", 1),
            "extraction_method": "DETERMINISTIC_REGEX",
            "properties": props,
            "risk_score": props.get("risk_score", 0.4)
        })

    # 1. EMAILS (Strict RFC)
    email_matches = re.findall(r'\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b', text)
    for email in email_matches:
        canon_email = email.lower().strip()
        add_entity(canon_email, canon_email, "EMAIL", 0.99, {"risk_score": 0.5})

    # 2. INDIAN MOBILE PHONES & PHONES
    phone_matches = re.finditer(r'(?:\+91[\-\s]?)?([6-9]\d{4}[\-\s]?\d{5})\b', text)
    for m in phone_matches:
        raw_digits = re.sub(r'[^\d]', '', m.group(0))
        if len(raw_digits) == 10:
            canon_phone = f"+91{raw_digits}"
            add_entity(canon_phone, m.group(0).strip(), "PHONE_NUMBER", 0.95, {"phone_type": "MOBILE_IN", "risk_score": 0.5})
        elif len(raw_digits) == 12 and raw_digits.startswith("91"):
            canon_phone = f"+{raw_digits}"
            add_entity(canon_phone, m.group(0).strip(), "PHONE_NUMBER", 0.95, {"phone_type": "MOBILE_IN", "risk_score": 0.5})

    label_phones = re.finditer(r'(?:Phone|Mobile|Contact|Cell|Tel|CDR|Calling)(?:\s*No\.?|Number)?\s*[:\-]?\s*(\+?[0-9\-\s]{8,16})\b', text, re.IGNORECASE)
    for m in label_phones:
        digits = re.sub(r'[^\d+]', '', m.group(1))
        if 8 <= len(digits.replace("+", "")) <= 15:
            add_entity(digits, m.group(1).strip(), "PHONE_NUMBER", 0.92, {"risk_score": 0.5})

    # 3. INDIAN VEHICLES
    vehicle_matches = re.finditer(r'\b([A-Z]{2}[-\s]?[0-9]{1,2}[-\s]?[A-Z]{1,3}[-\s]?[0-9]{4})\b', text)
    for m in vehicle_matches:
        parts = re.split(r'[-\s]', m.group(1).upper())
        state_codes = {"MH", "DL", "KA", "TN", "TS", "AP", "GJ", "RJ", "UP", "MP", "WB", "PB", "HR", "KL", "GA", "CH"}
        if parts[0] in state_codes:
            canon_vehicle = "-".join([p for p in parts if p])
            add_entity(canon_vehicle, m.group(1).strip(), "VEHICLE", 0.95, {"risk_score": 0.7})

    # 4. FINANCIAL AMOUNTS & TRANSACTIONS
    amount_matches = re.finditer(r'(?:₹|INR|Rs\.?|\$)\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)\b', text, re.IGNORECASE)
    for m in amount_matches:
        full_amt = m.group(0).strip()
        num_str = re.sub(r'[^\d.]', '', m.group(1))
        try:
            val = float(num_str)
            add_entity(full_amt, full_amt, "FINANCIAL_AMOUNT", 0.90, {"numeric_value": val, "risk_score": 0.6 if val > 100000 else 0.4})
        except ValueError:
            pass

    # 5. BANK ACCOUNTS & IFSC
    acc_tag_matches = re.finditer(r'\b(ACC-\d+)\b', text, re.IGNORECASE)
    for m in acc_tag_matches:
        canon_acc = m.group(1).upper().strip()
        add_entity(canon_acc, canon_acc, "ACCOUNT", 0.98, {"risk_score": 0.5})

    acc_num_matches = re.finditer(r'(?:Account|A/c|Bank\s*Account|Acc)(?:\s*No\.?|Number)?\s*[:\-]?\s*(\d{9,18})\b', text, re.IGNORECASE)
    for m in acc_num_matches:
        canon_acc = f"ACC-{m.group(1).strip()}"
        add_entity(canon_acc, m.group(1).strip(), "ACCOUNT", 0.95, {"account_number": m.group(1).strip(), "risk_score": 0.5})

    ifsc_matches = re.finditer(r'\b([A-Z]{4}0[A-Z0-9]{6})\b', text)
    for m in ifsc_matches:
        canon_ifsc = m.group(1).upper()
        add_entity(canon_ifsc, canon_ifsc, "ORGANIZATION", 0.90, {"type_detail": "IFSC_CODE", "risk_score": 0.3})

    pan_matches = re.finditer(r'\b([A-Z]{5}[0-9]{4}[A-Z])\b', text)
    for m in pan_matches:
        canon_pan = m.group(1).upper()
        add_entity(canon_pan, canon_pan, "DOCUMENT", 0.95, {"type_detail": "PAN_CARD", "risk_score": 0.5})

    # 6. DOCUMENT IDENTIFIERS / FIR
    fir_matches = re.finditer(r'\b(FIR\s*(?:No\.?|Number)?\s*[:\-]?\s*\d+(?:/\d+)?)\b', text, re.IGNORECASE)
    for m in fir_matches:
        canon_doc = re.sub(r'\s+', ' ', m.group(1).strip())
        add_entity(canon_doc, canon_doc, "DOCUMENT", 0.95, {"risk_score": 0.5})

    # 7. CYBER: IP ADDRESSES & URLS
    ip_matches = re.finditer(r'\b((?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?))\b', text)
    for m in ip_matches:
        ip = m.group(1)
        if ip != "0.0.0.0" and not ip.startswith("127."):
            add_entity(ip, ip, "IP_ADDRESS", 0.98, {"risk_score": 0.6})

    url_matches = re.finditer(r'\b(https?://[^\s/$.?#].[^\s]*)\b', text, re.IGNORECASE)
    for m in url_matches:
        url = m.group(1).strip()
        add_entity(url, url, "URL", 0.98, {"risk_score": 0.5})

    # 8. CYBER: DOMAIN NAMES
    domain_matches = re.finditer(r'\b((?:[a-zA-Z0-9-]+\.)+(?:com|org|net|io|xyz|co|ai|info|biz|ru|cn|in|onion))\b', text, re.IGNORECASE)
    for m in domain_matches:
        dom = m.group(1).lower().strip()
        # Avoid file names like .pdf, .docx, or emails
        if not re.search(r'\.(?:pdf|docx|txt|py|js|png|jpg)$', dom):
            add_entity(dom, dom, "DOMAIN", 0.92, {"risk_score": 0.5})

    # 9. CYBER: CRYPTO WALLET ADDRESSES
    # Bitcoin (Legacy 1/3, SegWit bc1)
    btc_matches = re.finditer(r'\b(bc1[a-zA-HJ-NP-Z0-9]{25,39}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b', text)
    for m in btc_matches:
        w_addr = m.group(1).strip()
        add_entity(w_addr, w_addr, "CRYPTO_WALLET", 0.95, {"network": "BITCOIN", "risk_score": 0.7})

    # Ethereum / ERC-20 (0x + 40 hex)
    eth_matches = re.finditer(r'\b(0x[a-fA-F0-9]{40})\b', text)
    for m in eth_matches:
        w_addr = m.group(1).strip()
        add_entity(w_addr, w_addr, "CRYPTO_WALLET", 0.95, {"network": "ETHEREUM", "risk_score": 0.7})

    # Label-tagged crypto wallet
    tag_wallets = re.finditer(r'(?:Wallet|BTC|ETH|Crypto|Tether|USDT)\s*(?:Address|Addr)?\s*[:\-]?\s*([a-zA-Z0-9]{26,44})\b', text, re.IGNORECASE)
    for m in tag_wallets:
        w_addr = m.group(1).strip()
        add_entity(w_addr, w_addr, "CRYPTO_WALLET", 0.92, {"risk_score": 0.7})

    # 10. CYBER: FILE HASHES (SHA-256, SHA-1, MD5)
    # Standalone SHA-256 (64 hex characters)
    sha256_matches = re.finditer(r'\b([a-fA-F0-9]{64})\b', text)
    for m in sha256_matches:
        h = m.group(1).lower().strip()
        add_entity(h, h, "FILE_HASH", 0.98, {"hash_algorithm": "SHA-256", "risk_score": 0.6})

    # Labeled MD5 or SHA-1
    labeled_hashes = re.finditer(r'(?:MD5|SHA-?1|Hash)\s*[:\-]?\s*([a-fA-F0-9]{32,40})\b', text, re.IGNORECASE)
    for m in labeled_hashes:
        h = m.group(1).lower().strip()
        algo = "MD5" if len(h) == 32 else "SHA-1"
        add_entity(h, h, "FILE_HASH", 0.95, {"hash_algorithm": algo, "risk_score": 0.6})

    # 11. CYBER: DEVICES & HARDWARE IDENTIFIERS
    imei_matches = re.finditer(r'(?:IMEI|TAC)\s*[:\-]?\s*(\d{15})\b', text, re.IGNORECASE)
    for m in imei_matches:
        imei = m.group(1).strip()
        add_entity(imei, f"IMEI: {imei}", "DEVICE", 0.95, {"device_type": "IMEI", "risk_score": 0.5})

    mac_matches = re.finditer(r'\b((?:[0-9A-Fa-f]{2}[:-]){5}(?:[0-9A-Fa-f]{2}))\b', text)
    for m in mac_matches:
        mac = m.group(1).strip()
        add_entity(mac, f"MAC: {mac}", "DEVICE", 0.95, {"device_type": "MAC_ADDRESS", "risk_score": 0.5})

    # 12. CYBER: USERNAMES
    uname_matches = re.finditer(r'(?:^|[\s,:(])@([a-zA-Z0-9_]{3,24})\b', text)
    for m in uname_matches:
        uname = f"@{m.group(1).strip()}"
        add_entity(uname, uname, "USERNAME", 0.90, {"risk_score": 0.4})

    labeled_unames = re.finditer(r'(?:username|handle|alias|user\s*id)\s*[:\-]?\s*([a-zA-Z0-9_.-]{3,24})\b', text, re.IGNORECASE)
    for m in labeled_unames:
        uname = m.group(1).strip()
        if uname.lower() not in NOISE_BLOCKLIST:
            add_entity(uname, uname, "USERNAME", 0.90, {"risk_score": 0.4})

    # 13. ORGANIZATIONS (Corporate Endings & Known Gazetteers)
    org_pattern = re.finditer(r"\b([A-Z][a-zA-Z0-9&'\-]*(?:\s+[A-Z][a-zA-Z0-9&'\-]*)*\s+(?:Pvt\.?\s*Ltd\.?|Private\s*Limited|Limited|Ltd\.?|Corp\.?|Corporation|Enterprises|Logistics|Trading|Industries|Technologies|Solutions|Services|Bank|Hospital|Auto\s*Works|Works|Supplies|Transport\s*Yard))\b", text)
    for m in org_pattern:
        org_name = re.sub(r'\s+', ' ', m.group(1).strip())
        if len(org_name.split()) <= 5 and org_name.lower() not in NOISE_BLOCKLIST:
            add_entity(org_name, org_name, "ORGANIZATION", 0.90, {"risk_score": 0.4})

    emp_org_pattern = re.finditer(r"\b(?:works\s+for|employed\s+by|director\s+of|manager\s+at|partner\s+at)\s+([A-Z][a-zA-Z0-9&'\-]*(?:\s+[A-Z][a-zA-Z0-9&'\-]*)*)\b", text)
    for m in emp_org_pattern:
        org_name = re.sub(r'\s+', ' ', m.group(1).strip())
        if len(org_name.split()) <= 5 and org_name.lower() not in NOISE_BLOCKLIST and len(org_name) > 2:
            add_entity(org_name, org_name, "ORGANIZATION", 0.90, {"risk_score": 0.4})

    # 14. KNOWN GEOGRAPHIC LOCATIONS
    matched_loc_spans = []
    sorted_locations = sorted(KNOWN_LOCATIONS, key=lambda x: len(x), reverse=True)
    for loc_name in sorted_locations:
        pattern = rf'\b{re.escape(loc_name)}\b'
        for m in re.finditer(pattern, text, re.IGNORECASE):
            span = m.span()
            if any(s[0] <= span[0] and span[1] <= s[1] for s in matched_loc_spans):
                continue
            matched_loc_spans.append(span)
            disp = " ".join(word.capitalize() for word in loc_name.split())
            add_entity(disp, disp, "LOCATION", 0.90, {"risk_score": 0.3})

    loc_marker_matches = re.finditer(r'\b(?:near|at|in|from|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\s+(?:Café|Cafe|Mall|Hotel|Road|Street|Station|Railway Station|Highway|Bridge|Yard|Port|Tower))\b', text)
    for m in loc_marker_matches:
        loc = re.sub(r'\s+', ' ', m.group(1).strip())
        if loc.lower() not in NOISE_BLOCKLIST:
            add_entity(loc, loc, "LOCATION", 0.85, {"risk_score": 0.3})

    # 15. PERSONS (Honorifics, Lineage, Grammatical Roles)
    role_person_matches = re.finditer(r'\b(?:Witness(?:\s*Name)?|Accused|Suspect|Complainant|Victim|Inspector|Officer|Constable|Judge|Mr\.|Ms\.|Mrs\.|Shri|Smt\.)\s*[:\-]?\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,2})\b', text)
    for m in role_person_matches:
        name = re.sub(r'\s+', ' ', m.group(1).strip())
        if name.lower() not in NOISE_BLOCKLIST:
            add_entity(name, name, "PERSON", 0.92, {"risk_score": 0.6 if "Accused" in m.group(0) or "Suspect" in m.group(0) else 0.4})

    lineage_matches = re.finditer(r'([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)\s+(?:S/o|D/o|W/o)\s+(?:Late\s+)?(?:Sh\.|Smt\.|Mr\.|Ms\.)?\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)', text)
    for m in lineage_matches:
        p1 = m.group(1).strip()
        p2 = m.group(2).strip()
        if p1.lower() not in NOISE_BLOCKLIST:
            add_entity(p1, p1, "PERSON", 0.90, {"risk_score": 0.5})
        if p2.lower() not in NOISE_BLOCKLIST:
            add_entity(p2, p2, "PERSON", 0.85, {"risk_score": 0.3})

    verb_person_matches = re.finditer(r'\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,2})\s+(?:stated|testified|confessed|met|contacted|phoned|called|messaged|drives|owns|transferred|killed|murdered|left|travelled|fled|visited|reported|works)\b', text)
    for m in verb_person_matches:
        p = m.group(1).strip()
        if p.lower() not in NOISE_BLOCKLIST and not any(w in p.lower() for w in ["first", "information", "report", "call", "table"]):
            add_entity(p, p, "PERSON", 0.85, {"risk_score": 0.4})

    called_target_matches = re.finditer(r'\b(?:called|contacted|phoned|messaged)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,2})\b', text)
    for m in called_target_matches:
        p = m.group(1).strip()
        if p.lower() not in NOISE_BLOCKLIST and not any(w in p.lower() for w in ["first", "information", "report", "call", "table", "from", "into"]):
            add_entity(p, p, "PERSON", 0.88, {"risk_score": 0.4})

    transferred_target_matches = re.finditer(r'\b(?:transferred|paid|remitted|sent)\s+(?:₹|Rs\.?|INR|\$)?\s*[\d,]+(?:\.\d{2})?\s+(?:to|into\s+account\s+of)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,2})\b', text)
    for m in transferred_target_matches:
        p = m.group(1).strip()
        if p.lower() not in NOISE_BLOCKLIST:
            add_entity(p, p, "PERSON", 0.88, {"risk_score": 0.4})

    # 16. DATES & TIMESTAMPS (Stored strictly as DATE, never PERSON)
    date_patterns = [
        r'\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}(?:\s+(?:at\s+)?\d{1,2}:\d{2}(?::\d{2})?)?)\b',
        r'\b(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)\b',
        r'\b(\d{1,2}/\d{1,2}/\d{4})\b'
    ]
    for d_pat in date_patterns:
        for m in re.finditer(d_pat, text, re.IGNORECASE):
            date_val = m.group(1).strip()
            add_entity(date_val, date_val, "DATE", 0.90, {"type_detail": "TIMESTAMP", "risk_score": 0.2})

    return entities
