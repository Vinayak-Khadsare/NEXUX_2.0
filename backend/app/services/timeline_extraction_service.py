import re
from typing import List, Dict, Any
from datetime import datetime
import dateutil.parser

def extract_timeline_events_from_text(text: str, case_id: str) -> List[Dict[str, Any]]:
    """
    Extracts chronological investigation events from unstructured text such as
    cyber incident timelines, server access logs, and communication intercepts.
    """
    if not text or not isinstance(text, str):
        return []

    events = []
    seen = set()

    # 1. Incident timeline style: 12 Aug 2026 10:02 IST – Suspicious email received...
    pattern1 = re.compile(
        r'^(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?)(?:\s+([A-Z]{2,4}))?\s*[–—\-:|]\s*(.+)$',
        re.MULTILINE | re.IGNORECASE
    )
    for m in pattern1.finditer(text):
        d_str, t_str, tz, msg = m.groups()
        try:
            parsed_dt = dateutil.parser.parse(f"{d_str} {t_str}")
            iso_ts = parsed_dt.strftime("%Y-%m-%dT%H:%M:%S")
            d_norm = parsed_dt.strftime("%Y-%m-%d")
        except Exception:
            iso_ts = f"{d_str}T{t_str}:00" if len(t_str) == 5 else f"{d_str} {t_str}".strip()
            d_norm = d_str

        clean_msg = msg.strip()
        title = clean_msg[:-1] if clean_msg.endswith(".") else clean_msg
        if len(title) > 65:
            title = title[:62] + "..."

        key = (iso_ts, title)
        if key not in seen:
            seen.add(key)
            events.append({
                "case_id": case_id,
                "date": d_norm,
                "time": t_str,
                "timestamp": iso_ts,
                "title": title,
                "message": clean_msg,
                "category": "EVIDENCE",
                "type": "INCIDENT_EVENT",
                "properties": {"raw_line": clean_msg, "timezone": tz or ""}
            })

    # 2. Server access log style: 2026-08-12 10:17:42 IST | Source IP: ...
    pattern2 = re.compile(r'^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\s+([A-Z]{2,4}))?\s*\|\s*(.+)$', re.MULTILINE)
    for m in pattern2.finditer(text):
        d_str, t_str, tz, body = m.groups()
        iso_ts = f"{d_str}T{t_str}"

        action_match = re.search(r'Action:\s*([^|]+)', body, re.IGNORECASE)
        user_match = re.search(r'Username:\s*([^|]+)', body, re.IGNORECASE)
        host_match = re.search(r'Host:\s*([^|]+)', body, re.IGNORECASE)
        status_match = re.search(r'Status:\s*([^|]+)', body, re.IGNORECASE)

        act = action_match.group(1).strip() if action_match else "Server Access"
        usr = user_match.group(1).strip() if user_match else "User"
        hst = host_match.group(1).strip() if host_match else "Server"
        sts = status_match.group(1).strip() if status_match else ""

        title = f"{act}: {usr} @ {hst}" + (f" [{sts}]" if sts else "")
        key = (iso_ts, title)
        if key not in seen:
            seen.add(key)
            events.append({
                "case_id": case_id,
                "date": d_str,
                "time": t_str,
                "timestamp": iso_ts,
                "title": title,
                "message": body.strip(),
                "category": "EVIDENCE",
                "type": "ACCESS_LOG",
                "properties": {
                    "action": act,
                    "username": usr,
                    "host": hst,
                    "status": sts,
                    "timezone": tz or ""
                }
            })

    # 3. Email record style: Date: 12 August 2026 | Time: 10:02:14 IST ... Subject: ...
    pattern3 = re.compile(r'Date:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*\|\s*Time:\s*(\d{1,2}:\d{2}(?::\d{2})?)(?:\s+([A-Z]{2,4}))?', re.IGNORECASE)
    em_match = pattern3.search(text)
    if em_match:
        d_str, t_str, tz = em_match.groups()
        try:
            parsed_dt = dateutil.parser.parse(f"{d_str} {t_str}")
            iso_ts = parsed_dt.strftime("%Y-%m-%dT%H:%M:%S")
            d_norm = parsed_dt.strftime("%Y-%m-%d")
        except Exception:
            iso_ts = f"{d_str}T{t_str}"
            d_norm = d_str

        subj_match = re.search(r'Subject:\s*([^\n\r]+)', text, re.IGNORECASE)
        subj = subj_match.group(1).strip() if subj_match else "Email Communication"
        from_match = re.search(r'From:\s*([^\n\r]+)', text, re.IGNORECASE)
        to_match = re.search(r'To:\s*([^\n\r]+)', text, re.IGNORECASE)
        f_val = from_match.group(1).strip() if from_match else ""
        t_val = to_match.group(1).strip() if to_match else ""

        title = f"Email: {subj}"
        msg = f"Email from {f_val} to {t_val}. Subject: {subj}" if (f_val or t_val) else f"Email intercept: {subj}"
        key = (iso_ts, title)
        if key not in seen:
            seen.add(key)
            events.append({
                "case_id": case_id,
                "date": d_norm,
                "time": t_str,
                "timestamp": iso_ts,
                "title": title,
                "message": msg,
                "category": "EVIDENCE",
                "type": "COMMUNICATION",
                "properties": {
                    "from": f_val,
                    "to": t_val,
                    "subject": subj,
                    "timezone": tz or ""
                }
            })

    # 4. Bracketed/Call intercept timestamps: [12 Aug 2026 14:22:00] or Call Date: ... Time: ...
    call_pattern = re.compile(
        r'\[(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?)(?:\s+([A-Z]{2,4}))?\]\s*(.+)',
        re.IGNORECASE
    )
    for m in call_pattern.finditer(text):
        d_str, t_str, tz, body = m.groups()
        try:
            parsed_dt = dateutil.parser.parse(f"{d_str} {t_str}")
            iso_ts = parsed_dt.strftime("%Y-%m-%dT%H:%M:%S")
            d_norm = parsed_dt.strftime("%Y-%m-%d")
        except Exception:
            iso_ts = f"{d_str}T{t_str}"
            d_norm = d_str

        clean_body = body.strip()
        title = clean_body[:50] + "..." if len(clean_body) > 50 else clean_body
        key = (iso_ts, title)
        if key not in seen:
            seen.add(key)
            events.append({
                "case_id": case_id,
                "date": d_norm,
                "time": t_str,
                "timestamp": iso_ts,
                "title": title,
                "message": clean_body,
                "category": "EVIDENCE",
                "type": "COMMUNICATION_INTERCEPT",
                "properties": {"raw": clean_body, "timezone": tz or ""}
            })

    return events
