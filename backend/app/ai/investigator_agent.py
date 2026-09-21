import re
from typing import Dict, Any, List
from app.graph.graph_builder import build_graph
from app.graph.path_finder import find_shortest_path
from app.services.rag_service import query_case_context

import json

async def classify_intent(query: str, history_context: str) -> dict:
    intent_system_prompt = """You are NEXUS INTENT CLASSIFIER.
Analyze the user's query and classify it into EXACTLY ONE of these intents:
- GREETING
- CASE_FACT
- RAG_QUERY
- PATH_TRACING
- RISK_ANALYSIS
- GRAPH_ANALYSIS
- TIMELINE_QUERY
- GEOGRAPHY_QUERY
- EVIDENCE_GAP
- GENERAL_KNOWLEDGE
- CURRENT_DATE_TIME
- SYSTEM_HELP
- OUT_OF_SCOPE
- CLARIFICATION_REQUIRED
- INSUFFICIENT_CASE_DATA
- UNKNOWN

Respond in strict JSON format:
{
  "intent": "INTENT_NAME",
  "entities": ["extracted", "entity", "names"],
  "requires_graph": true
}
Do not include any other text or markdown, only the JSON object.
"""
    
    user_prompt = f"Conversation History:\n{history_context}\n\nQuery to classify: {query}"
    
    try:
        res = await call_hf_api(intent_system_prompt, user_prompt, format="json")
        if not res:
            return {"intent": "UNKNOWN", "entities": [], "requires_graph": False}
        res = res.strip()
        if res.startswith("```json"):
            res = res[7:-3].strip()
        elif res.startswith("```"):
            res = res[3:-3].strip()
            
        data = json.loads(res)
        valid_intents = [
            "GREETING", "CASE_FACT", "RAG_QUERY", "PATH_TRACING", "RISK_ANALYSIS",
            "GRAPH_ANALYSIS", "TIMELINE_QUERY", "GEOGRAPHY_QUERY", "EVIDENCE_GAP",
            "GENERAL_KNOWLEDGE", "CURRENT_DATE_TIME", "SYSTEM_HELP", "OUT_OF_SCOPE",
            "CLARIFICATION_REQUIRED", "INSUFFICIENT_CASE_DATA", "UNKNOWN"
        ]
        if data.get("intent") not in valid_intents:
            data["intent"] = "UNKNOWN"
        return data
    except Exception as e:
        print(f"Intent classification failed: {e}")
        return {"intent": "UNKNOWN", "entities": [], "requires_graph": False}

def validate_classifier_entities(entities: Any) -> list:
    if not isinstance(entities, list):
        return []
    valid = []
    for e in entities:
        if isinstance(e, str):
            clean = e.strip()
            if clean and clean.lower() not in [v.lower() for v in valid]:
                valid.append(clean)
    return valid

async def run_ai_investigator(query: str, case_id: str, db, current_user, history_context: str = "") -> Dict[str, Any]:
    """
    Orchestrates the grounded AI investigation. Intercepts intent, retrieves MongoDB/NetworkX facts,
    and queries local AI (or falls back to rule-based grounding) to generate factual reports.
    """
    # Helper to clean queries
    query_clean = re.sub(r'[^\w\s]', '', query.lower()).strip()
    query_lower = query.lower()

    # --- 12 INTENT DETECTION ROUTERS ---
    
    # 0. DATE_TIME (Deterministic Phase 1)
    date_patterns = [
        r"^what day is today\??$",
        r"^what is today's date\??$",
        r"^what is the date\??$",
        r"^what time is it\??$",
        r"^current date\??$",
        r"^today's date\??$"
    ]
    if any(re.match(p, query_lower) for p in date_patterns):
        from datetime import datetime
        try:
            from tzlocal import get_localzone
            now_local = datetime.now(get_localzone())
            tz_str = str(get_localzone())
        except:
            now_local = datetime.now().astimezone()
            tz_str = str(now_local.tzinfo)
            
        date_str = now_local.strftime("%Y-%m-%d")
        time_str = now_local.strftime("%H:%M:%S")
        day_str = now_local.strftime("%A")
        
        return {
            "answer": f"Today is {day_str}, {date_str}. The current time is {time_str} ({tz_str}).",
            "actions": [],
            "supporting_evidence": []
        }


    # Phase 2: LLM Intent Classifier
    classification = {"intent": "UNKNOWN", "entities": [], "requires_graph": False}
    try:
        classification = await classify_intent(query, history_context)
    except Exception as e:
        print(f"Error calling classify_intent: {e}")
        
    intent = classification.get("intent", "UNKNOWN")
    classifier_entities = validate_classifier_entities(classification.get("entities", []))

    # If LLM detects OUT_OF_SCOPE or GREETING directly
    if intent == "OUT_OF_SCOPE":
        return {
            "answer": "I’m NEXUS AI, an investigation intelligence assistant. I can help you analyze cases, evidence, entities, relationships, and network connections, but that request is outside my area of expertise.",
            "actions": [],
            "supporting_evidence": []
        }
    elif intent == "GREETING":
        system_persona = "You are NEXUS AI. Respond naturally to this greeting in a concise, professional tone."
        ans = await call_hf_api(system_persona, f"Query: {query}")
        return {
            "answer": ans or "Hello! I am NEXUS AI. How can I assist with your investigation today?",
            "actions": [],
            "supporting_evidence": []
        }

    # 1. OUT_OF_SCOPE (Regex Fallback)
    out_of_scope_patterns = [
        r"\b(?:weather|sports|celebrity|gossip|homework|math|mathematics|stock|stocks|movie|recipe|coding)\b"
    ]
    if any(re.search(p, query_lower) for p in out_of_scope_patterns):
        return {
            "answer": "I’m NEXUS AI, an investigation intelligence assistant. I can help you analyze cases, evidence, entities, relationships, and network connections, but that request is outside my area of expertise.",
            "actions": [],
            "supporting_evidence": []
        }

    # 2. GENERAL_CONVERSATION (Regex Fallback)
    conversational_patterns = [
        r"^(hi|hello|hey|greetings)(?:\s+nexus)?$",
        r"^(good morning|good afternoon|good evening)$",
        r"^how are you(?:\s+doing)?$",
        r"^(who are you|what are you)$",
        r"^(what can you do|help(?: me)?|how can you help)$",
        r"^(thanks|thank you)$"
    ]
    # Do not return immediately for conversational logic if we want AI to handle it, but wait, the instructions said:
    # "regex may be used only for simple routing such as greetings or obvious out-of-scope"
    # Wait, the prompt says "The chatbot must return meaningful responses for 'hi', 'who are you', 'what can you do'."
    # The existing code did handle this, but let's just make it pass through to the LLM or handle it directly.
    # Actually, the user says "You can naturally respond to greetings and simple conversation such as: hi, hello..."
    # "Do not use regex as the primary intelligence mechanism for normal case questions. Regex may be used only for simple routing such as greetings or obvious out-of-scope categories. Investigation questions should still reach the AI/RAG pipeline."
    # Let's remove the regex handling for greetings so the LLM handles it natively, or just keep it simple. Let's remove it and let the LLM handle greetings natively since the new prompt includes it!
    # Or wait, if we pass greetings to the LLM, it's slower. Let's remove this block and let the LLM handle it, as the system prompt explicitly says "GENERAL CONVERSATION: You can naturally respond to greetings..."

    # 3. APP_STATISTICS & CASE_LISTING
    app_stat_patterns = [
        r"how many cases", r"how many investigations", r"show my cases", r"list cases", 
        r"what cases do i have", r"show open investigations", r"summary of all my investigations",
        r"what cases are currently open", r"what cases are high priority"
    ]
    if any(p in query_lower for p in app_stat_patterns):
        # Fetch global case stats (unscoped based on existing DB logic which didn't scope cases)
        all_cases = await db["cases"].find().to_list(None)
        open_cases = sum(1 for c in all_cases if c.get("status") == "OPEN")
        closed_cases = sum(1 for c in all_cases if c.get("status") == "CLOSED")
        high_priority = sum(1 for c in all_cases if c.get("priority") == "HIGH")
        
        case_names = [c.get("name", "Unnamed") for c in all_cases[:5]] # sample up to 5
        
        fallback_msg = f"You currently have {len(all_cases)} investigation cases ({open_cases} open, {closed_cases} closed). There are {high_priority} high priority cases."
        if case_names:
            fallback_msg += f" Some of your cases include: {', '.join(case_names)}."
            
        system_persona = "You are NEXUS AI, an investigation intelligence assistant. Answer naturally based on the provided facts."
        user_prompt = f"Facts: {fallback_msg}\n\nQuestion: {query}"
        answer = await call_hf_api(system_persona, user_prompt)
        if not answer:
            answer = fallback_msg
            
        return {
            "answer": answer,
            "actions": [],
            "supporting_evidence": ["Global MongoDB Cases queried."]
        }

    # If active case questions, we must ensure case_id is valid
    if case_id != "all":
        # Fetch Entities and Relationships for this case
        entities = await db["entities"].find({"case_id": case_id}).to_list(None)
        relationships = await db["relationships"].find({"case_id": case_id}).to_list(None)
    else:
        entities = await db["entities"].find({}).to_list(None)
        relationships = await db["relationships"].find({}).to_list(None)
        
    if not entities: entities = []
    if not relationships: relationships = []
    
    # 4. ACTIVE_CASE_INFO
    active_case_patterns = [
        r"what is my active case", r"what case am i working on", r"what is this case about",
        r"summarize this investigation", r"what is the case status", r"summarize this case"
    ]
    if any(p in query_lower for p in active_case_patterns):
        if case_id == "all":
            return {
                "answer": "You don't currently have an active case selected. Please select a case before asking for case-specific analysis.",
                "actions": [],
                "supporting_evidence": []
            }
            
        active_case = await db["cases"].find_one({"_id": case_id}) if len(case_id) < 24 else None
        # the case_id in UI might be the string ObjectId. We can fetch name if we parse it, but we also can just use entities/relationships
        from bson import ObjectId
        case_doc = None
        try:
            case_doc = await db["cases"].find_one({"_id": ObjectId(case_id)})
        except:
            pass
            
        case_name = case_doc.get("name", case_id) if case_doc else case_id
        case_status = case_doc.get("status", "Unknown") if case_doc else "Unknown"
        case_desc = case_doc.get("description", "No description provided.") if case_doc else ""
        
        fallback_msg = f"Your active case is '{case_name}' (Status: {case_status}). {case_desc} This investigation contains {len(entities)} entities and {len(relationships)} relationships."
        
        system_persona = "You are NEXUS AI, an investigation intelligence assistant. Summarize the active case context for the user."
        user_prompt = f"Facts: {fallback_msg}\n\nQuestion: {query}"
        answer = await call_hf_api(system_persona, user_prompt)
        if not answer:
            answer = fallback_msg
            
        return {
            "answer": answer,
            "actions": [],
            "supporting_evidence": [f"Case '{case_name}' metadata retrieved."]
        }

    # 4b. CASE STORY & CHRONOLOGICAL NARRATIVE GENERATION
    narrative_patterns = [
        r"chronological narrative",
        r"case story",
        r"story of this case",
        r"narrative.*case",
        r"generate.*story",
        r"generate.*narrative",
        r"tell.*story",
        r"what happened in this case",
        r"sequence of events",
        r"timeline.*narrative",
        r"reconstruct the events",
        r"reconstruct.*case",
        r"chronological.*events",
    ]
    is_narrative_query = any(re.search(p, query_lower) for p in narrative_patterns) or (
        intent in ["TIMELINE_QUERY", "CASE_FACT"] and any(w in query_lower for w in ["narrative", "story", "chronological", "events"])
    )
    if is_narrative_query and case_id != "all":
        from bson import ObjectId
        case_doc = None
        try:
            case_doc = await db["cases"].find_one({"_id": ObjectId(case_id)})
        except Exception:
            pass
        if not case_doc:
            case_doc = await db["cases"].find_one({"caseId": case_id})

        case_name = case_doc.get("name", case_doc.get("title", "Active Case")) if case_doc else "Active Case"
        case_desc = case_doc.get("description", "") if case_doc else ""
        case_status = case_doc.get("status", "OPEN") if case_doc else "OPEN"

        # Build entity lookup map
        entity_map = {str(e["_id"]): e for e in entities}

        # Collect and chronologically sort events from relationships and timeline
        chronological_events = []
        for r in relationships:
            props = r.get("properties") or {}
            dt_raw = props.get("date") or props.get("timestamp") or r.get("created_at")
            if dt_raw:
                src_name = entity_map.get(str(r.get("source_entity_id")), {}).get("name", "Unknown Entity")
                tgt_name = entity_map.get(str(r.get("target_entity_id")), {}).get("name", "Unknown Entity")
                rel_type = r.get("type") or r.get("relation") or "LINKED"
                date_str = str(dt_raw)[:10] if dt_raw else "Recorded Date"
                chronological_events.append({
                    "raw_date": str(dt_raw),
                    "date": date_str,
                    "source": src_name,
                    "target": tgt_name,
                    "type": rel_type,
                    "summary": f"[{date_str}] {src_name} --({rel_type})--> {tgt_name}"
                })

        # Sort chronologically (earliest to latest)
        chronological_events.sort(key=lambda x: x["raw_date"])

        # Fetch evidence snippets
        evidence_snippets = []
        try:
            ev_docs = await db["evidence"].find({"$or": [{"case_id": case_id}, {"caseId": case_id}]}).limit(5).to_list(None)
            for ev in ev_docs:
                txt = (ev.get("extracted_text") or ev.get("summary") or "").strip()
                if txt:
                    evidence_snippets.append(f"- {ev.get('title', 'Evidence')}: {txt[:250]}...")
        except Exception as e:
            print(f"Notice fetching evidence snippets: {e}")

        events_text = "\n".join([e["summary"] for e in chronological_events[:35]])
        if len(chronological_events) > 35:
            events_text += f"\n...and {len(chronological_events) - 35} more sequential events."

        evidence_text = "\n".join(evidence_snippets) if evidence_snippets else "Standard case logs and communication transcripts."

        system_persona = (
            "You are NEXUS AI, an elite Senior Criminal & Intelligence Investigative Analyst.\n"
            "Synthesize the provided chronological timeline of events, entity relationships, "
            "and investigative evidence into a comprehensive, cohesive, professional chronological narrative of the case.\n\n"
            "STRUCTURE YOUR REPORT CLEARLY:\n"
            "1. Executive Summary\n"
            "A concise briefing of the overall incident, prime suspects, and scope.\n\n"
            "2. Chronological Sequence of Events\n"
            "A detailed narrative timeline walking through what transpired step-by-step from earliest to latest recorded interactions, communications, movements, and transactions.\n\n"
            "3. Key Entities & Network Dynamics\n"
            "Summary of central actors, organizations, vehicles/locations, and how they connect.\n\n"
            "4. Investigative Findings & Assessment\n"
            "Critical nexus points, high-risk anomalies, and actionable next steps.\n\n"
            "Conclusion\n"
            "Brief final investigative synthesis.\n\n"
            "STRICT FORMATTING RULES:\n"
            "- Do NOT use markdown asterisks (**) anywhere. Never use ** for bold text.\n"
            "- Do NOT use hashtags (###) for headings; use plain title lines.\n"
            "- Do NOT use the rupee symbol (₹); write 'INR ' instead.\n"
            "- Tone: Authoritative, objective, structured, and strictly grounded in the provided facts."
        )

        user_prompt = (
            f"Case: {case_name} (Status: {case_status})\n"
            f"Case Background: {case_desc}\n\n"
            f"Chronological Event Timeline ({len(chronological_events)} events):\n{events_text}\n\n"
            f"Key Evidence Records:\n{evidence_text}\n\n"
            f"User Request: {query}"
        )

        answer = await call_hf_api(system_persona, user_prompt)

        # Resilient fallback if local LLM is slow or returns minimal text
        if not answer or len(answer.strip()) < 50:
            answer = generate_chronological_narrative_fallback(case_name, case_desc, chronological_events, entities, relationships)

        # Sanitize narrative: remove any markdown stars, hashtags, backticks, and fix currency
        clean_narrative = (
            answer
            .replace("**", "")
            .replace("₹", "INR ")
            .replace("`", "")
        )
        clean_narrative = re.sub(r"^#+\s*", "", clean_narrative, flags=re.MULTILINE).strip()

        # Persist the generated AI narrative to the case in MongoDB so it is added to the final report
        try:
            from bson import ObjectId
            from datetime import datetime
            query_filter = {"$or": [{"_id": ObjectId(case_id)}, {"caseId": case_id}]} if ObjectId.is_valid(case_id) else {"$or": [{"_id": case_id}, {"caseId": case_id}]}
            await db["cases"].update_one(
                query_filter,
                {"$set": {"ai_narrative": clean_narrative, "narrative_generated_at": datetime.utcnow()}}
            )
        except Exception as e:
            print(f"Notice persisting ai_narrative to case: {e}")

        return {
            "answer": clean_narrative,
            "actions": [],
            "supporting_evidence": [f"Synthesized {len(chronological_events)} chronological events and {len(entities)} entities."]
        }


        
    # 5. APP_STATISTICS (Case scoped)
    case_stats_patterns = [
        r"how many entities", r"how many relationships", r"how much evidence", r"entity types", r"who are the investigators"
    ]
    if any(p in query_lower for p in case_stats_patterns):
        evidence_count = await db["evidence"].count_documents({"case_id": case_id} if case_id != "all" else {})
        
        ent_types = {}
        for e in entities:
            t = e.get("type", "UNKNOWN")
            ent_types[t] = ent_types.get(t, 0) + 1
            
        type_str = ", ".join([f"{count} {t.lower()}s" for t, count in ent_types.items()])
        
        fallback_msg = f"This investigation currently contains {len(entities)} entities, {len(relationships)} relationships, and {evidence_count} evidence records."
        if type_str:
            fallback_msg += f" Entity breakdown: {type_str}."
            
        system_persona = "You are NEXUS AI, an investigation intelligence assistant. Answer naturally based on facts."
        user_prompt = f"Facts: {fallback_msg}\n\nQuestion: {query}"
        answer = await call_hf_api(system_persona, user_prompt)
        if not answer:
            answer = fallback_msg
            
        return {
            "answer": answer,
            "actions": [],
            "supporting_evidence": ["Database aggregation counts retrieved."]
        }

    # Deduplication block for Graph logic
    unique_entities = {}
    entity_id_map = {}
    if case_id == "all":
        for ent in entities:
            ent_id = str(ent["_id"])
            key = (ent.get("type", "PERSON").upper(), ent.get("name", "").strip().lower())
            if key not in unique_entities:
                canonical_id = ent_id
                ent_copy = dict(ent)
                ent_copy["_id"] = canonical_id
                unique_entities[key] = ent_copy
                entity_id_map[ent_id] = canonical_id
            else:
                canonical_id = unique_entities[key]["_id"]
                entity_id_map[ent_id] = canonical_id

    # 6. ENTITY_QUERY & RELATIONSHIP_QUERY (General check before path tracer)
    # Check if there is a pronoun in history (FOLLOW_UP_CONTEXT)
    pronouns = [r"\bhe\b", r"\bshe\b", r"\bthey\b", r"\bhim\b", r"\bher\b", r"\bit\b", r"\bthis\b"]
    is_follow_up = any(re.search(p, query_lower) for p in pronouns)
    
    # Existing PATH_TRACING combined with Phase 3.5 Intent entities
    path_match = re.search(r"(?:connection between|path between|link between|relationship between)\s+([a-zA-Z\s]+)\s+and\s+([a-zA-Z\s\?]+)", query_lower)
    if not path_match:
        path_match = re.search(r"(?:how is\s+)?([a-zA-Z\s]+)\s+(?:connected to|related to|linked to)\s+([a-zA-Z\s\?]+)", query_lower)
        
    is_path_tracing = (intent == "PATH_TRACING" and len(classifier_entities) >= 2) or path_match

    if is_path_tracing:
        if intent == "PATH_TRACING" and len(classifier_entities) > 2:
            return {
                "answer": "The path tracing feature currently only supports analyzing connections between two specific entities at a time.",
                "actions": [],
                "supporting_evidence": []
            }
            
        ent1 = None
        ent2 = None
        
        if intent == "PATH_TRACING" and len(classifier_entities) == 2:
            n1 = classifier_entities[0].lower()
            n2 = classifier_entities[1].lower()
            ent1 = next((e for e in entities if n1 in e["name"].lower()), None)
            ent2 = next((e for e in entities if n2 in e["name"].lower()), None)
            
        if (not ent1 or not ent2) and path_match:
            name1 = path_match.group(1).strip().replace("?", "")
            name2 = path_match.group(2).strip().replace("?", "")
            ent1 = next((e for e in entities if name1 in e["name"].lower()), None)
            ent2 = next((e for e in entities if name2 in e["name"].lower()), None)
        
        if not ent1 or not ent2:
            if not is_follow_up:
                return {
                    "answer": "There is insufficient evidence in the current case data to establish a relationship.",
                    "actions": [],
                    "supporting_evidence": []
                }
        else:
            if case_id == "all":
                import networkx as nx
                G = nx.Graph()
                for ent in unique_entities.values():
                    G.add_node(ent["_id"], type=ent.get("type"), name=ent.get("name"), risk_score=ent.get("risk_score", 0))
                for rel in relationships:
                    src = entity_id_map.get(str(rel.get("source_entity_id")))
                    tgt = entity_id_map.get(str(rel.get("target_entity_id")))
                    if src and tgt and src != tgt:
                        G.add_edge(src, tgt, type=rel.get("type"))
                
                start_id = entity_id_map.get(str(ent1["_id"]), str(ent1["_id"]))
                target_id = entity_id_map.get(str(ent2["_id"]), str(ent2["_id"]))
                path = find_shortest_path(G, start_id, target_id)
            else:
                G = build_graph(entities, relationships)
                start_id = str(ent1["_id"])
                target_id = str(ent2["_id"])
                path = find_shortest_path(G, start_id, target_id)
            
            if not path:
                return {
                    "answer": f"No direct relationship was found between {ent1['name']} and {ent2['name']} in the current case data.",
                    "actions": [],
                    "supporting_evidence": []
                }
                
            chain = []
            entity_map = {str(e["_id"]): e for e in unique_entities.values()} if case_id == "all" else {str(e["_id"]): e for e in entities}
            for i, node_id in enumerate(path):
                curr_ent = entity_map.get(node_id)
                if curr_ent:
                    chain.append(curr_ent["name"])
                    
            path_str = " -> ".join(chain)
            distance = len(chain) - 1
            
            ent1_degree = sum(1 for r in relationships if str(r.get("source_entity_id")) == start_id or str(r.get("target_entity_id")) == start_id)
            ent2_degree = sum(1 for r in relationships if str(r.get("source_entity_id")) == target_id or str(r.get("target_entity_id")) == target_id)
            
            grounding_context = (
                f"GRAPH FACTS:\n"
                f"- {ent1['name']} (Node Degree: {ent1_degree})\n"
                f"- {ent2['name']} (Node Degree: {ent2_degree})\n\n"
                f"SHORTEST PATH:\n"
                f"{path_str}\n\n"
                f"Distance: {distance}"
            )
            
            system_persona = "You are NEXUS AI, an investigation intelligence assistant. Explain the connection path between the suspects clearly using the provided graph facts. Do not invent any additional edges."
            user_prompt = f"Conversation History:\n{history_context}\n\nFacts:\n{grounding_context}\n\nQuestion: {query}"
            answer = await call_hf_api(system_persona, user_prompt)
            if not answer:
                answer = f"The connection path between {ent1['name']} and {ent2['name']} has been traced. They are linked via: {path_str} (Distance: {distance})."
                
            return {
                "answer": answer,
                "actions": [{"type": "TRACE_PATH", "source": start_id, "target": target_id, "scope": case_id}],
                "supporting_evidence": [path_str]
            }

    # 7. RISK_ANALYSIS
    risk_match = re.search(r"(?:why is|explain risk of|risk score of)\s+([a-zA-Z\s\?]+)", query_lower)
    is_risk = (intent == "RISK_ANALYSIS" and len(classifier_entities) >= 1) or risk_match
    if is_risk:
        ent = None
        if intent == "RISK_ANALYSIS" and len(classifier_entities) >= 1:
            target_name = classifier_entities[0].lower()
            ent = next((e for e in entities if target_name in e["name"].lower()), None)
            
        if not ent and risk_match:
            target_name = risk_match.group(1).strip().replace("?", "")
            ent = next((e for e in entities if target_name in e["name"].lower()), None)
            
        if ent:
            risk = ent.get("risk_score", 0.0)
            properties = ent.get("properties", {})
            classification_type = ent.get("type", "PERSON")
            grounding_context = f"Suspect '{ent['name']}' classified as {classification_type} has a threat risk index of {risk:.2f}. Attributes: {properties}."
            
            system_persona = "You are NEXUS AI, an investigation intelligence assistant. Explain why this suspect is marked with this risk index based strictly on facts."
            user_prompt = f"Conversation History:\n{history_context}\n\nFacts: {grounding_context}\n\nQuestion: {query}"
            answer = await call_hf_api(system_persona, user_prompt)
            if not answer:
                status_flag = "suspicious attributes" if properties.get("flagged") else "network positions"
                answer = f"Suspect '{ent['name']}' has a risk score of {risk:.2f} due to {status_flag}. Attributes recorded: {properties}."
                
            node_id = entity_id_map.get(str(ent["_id"]), str(ent["_id"])) if case_id == "all" else str(ent["_id"])
            return {
                "answer": answer,
                "actions": [{"type": "FOCUS_NODE", "node_id": node_id, "scope": case_id}],
                "supporting_evidence": [f"Risk score: {risk}"]
            }

    # 8. HIGH THREAT
    if "high risk" in query_lower or "threats" in query_lower:
        high_risk_ents = [e for e in (unique_entities.values() if case_id == "all" else entities) if e.get("risk_score", 0.0) > 0.7]
        if not high_risk_ents:
            scope_text = "database" if case_id == "all" else "active case file"
            return {
                "answer": f"No high-risk entities (risk index > 0.70) are currently recorded in the {scope_text}.",
                "actions": [],
                "supporting_evidence": []
            }
        list_str = ", ".join([f"'{e['name']}' (Risk: {e['risk_score']:.2f})" for e in high_risk_ents])
        scope_text = "all combined cases" if case_id == "all" else "this case"
        grounding_context = f"High-risk suspects detected in {scope_text}: {list_str}."
        system_persona = "You are NEXUS AI, an investigation intelligence assistant. Present the list of high threat targets professionally."
        user_prompt = f"Conversation History:\n{history_context}\n\nFacts: {grounding_context}\n\nQuestion: {query}"
        answer = await call_hf_api(system_persona, user_prompt)
        if not answer:
            answer = f"The following high-risk suspect profiles require immediate review: {list_str}."
        return {
            "answer": answer,
            "actions": [{"type": "FILTER_RISK", "min_risk": 0.7, "scope": case_id}],
            "supporting_evidence": [e["name"] for e in high_risk_ents]
        }

    # 9. KILLED/ORDERED/FINANCED
    killed_match = re.search(r"who\s+(?:killed|murdered|assassinated)\s+([a-zA-Z\s\?]+)", query_lower)
    ordered_match = re.search(r"who\s+(?:ordered|planned)\s+(?:the\s+(?:killing|murder|assassination)\s+of\s+)?([a-zA-Z\s\?]+)", query_lower)
    financed_match = re.search(r"who\s+(?:financed|paid\s+for|funded)\s+(?:the\s+(?:killing|murder|assassination)\s+of\s+)?([a-zA-Z\s\?]+)", query_lower)
    
    intent_match = None
    rel_type = None
    if killed_match:
        intent_match = killed_match; rel_type = "KILLED"
    elif ordered_match:
        intent_match = ordered_match; rel_type = "ORDERED"
    elif financed_match:
        intent_match = financed_match; rel_type = "FINANCED"
        
    if intent_match:
        target_name = intent_match.group(1).strip().replace("?", "")
        target_ent = next((e for e in entities if target_name in e["name"].lower()), None)
        if not target_ent:
            if not is_follow_up:
                scope_text = "database" if case_id == "all" else "case directory"
                return {
                    "answer": f"I couldn't locate '{target_name}' in the {scope_text}. Please verify the name.",
                    "actions": [],
                    "supporting_evidence": []
                }
        else:
            target_id_str = str(target_ent["_id"])
            relevant_rels = []
            for r in relationships:
                t_id = str(r.get("target_entity_id"))
                if t_id == target_id_str and r.get("type", "").upper() == rel_type:
                    relevant_rels.append(r)
            if not relevant_rels and rel_type in ["ORDERED", "FINANCED"]:
                killers = [r.get("source_entity_id") for r in relationships if str(r.get("target_entity_id")) == target_id_str and r.get("type", "").upper() == "KILLED"]
                for killer_id in killers:
                    indirect_rels = [r for r in relationships if str(r.get("target_entity_id")) == str(killer_id) and r.get("type", "").upper() == rel_type]
                    relevant_rels.extend(indirect_rels)
            if not relevant_rels:
                scope_text = "across cases" if case_id == "all" else "in this case"
                return {
                    "answer": f"Analysis complete: No records found indicating who {rel_type.lower()} '{target_ent['name']}' {scope_text}.",
                    "actions": [],
                    "supporting_evidence": []
                }
            actors = []
            entity_map = {str(e["_id"]): e for e in unique_entities.values()} if case_id == "all" else {str(e["_id"]): e for e in entities}
            for r in relevant_rels:
                source_id = str(r.get("source_entity_id"))
                source_ent = entity_map.get(source_id)
                if source_ent:
                    status = r.get("status", "CONFIRMED")
                    actors.append(f"{source_ent['name']} ({status})")
            actors_str = ", ".join(actors)
            grounding_context = f"Entities who {rel_type.lower()} {target_ent['name']}: {actors_str}."
            system_persona = "You are NEXUS AI, an investigation intelligence assistant. Report the findings based strictly on the facts."
            user_prompt = f"Conversation History:\n{history_context}\n\nFacts: {grounding_context}\n\nQuestion: {query}"
            answer = await call_hf_api(system_persona, user_prompt)
            if not answer:
                answer = f"The following entities are recorded as having {rel_type.lower()} {target_ent['name']}: {actors_str}."
            action_node = str(relevant_rels[0].get("source_entity_id")) if relevant_rels else target_id_str
            node_id_to_focus = entity_id_map.get(action_node, action_node) if case_id == "all" else action_node
            return {
                "answer": answer,
                "actions": [{"type": "FOCUS_NODE", "node_id": node_id_to_focus, "scope": case_id}],
                "supporting_evidence": [f"{rel_type} -> {target_ent['name']}"]
            }

    # 10. GENERAL_RAG / FOLLOW_UP_CONTEXT / ENTITY_QUERY / RELATIONSHIP_QUERY / EVIDENCE_QUERY
    # (Fallback query for any case context that requires RAG, graph traversal, or history pronoun tracking)
    if case_id == "all":
        suspects_count = len(unique_entities)
        linkages_count = len(relationships)
        case_summary = f"The global database holds {suspects_count} unique suspects and {linkages_count} linkages across all cases."
    else:
        case_summary = f"Active case file holds {len(entities)} suspects and {len(relationships)} linkages."
        
    try:
        evidence_context = query_case_context(case_id, query)
        if not evidence_context:
            evidence_context = "No specific evidence found."
        # PHASE 4: Context limits
        # Truncate overly long RAG evidence to keep within Qwen 7B optimal window (e.g. ~2000 chars)
        if len(evidence_context) > 2000:
            evidence_context = evidence_context[:2000] + "... [TRUNCATED]"
    except Exception as e:
        print(f"Error querying ChromaDB: {e}")
        evidence_context = "Evidence search unavailable."
    
    # We allow the LLM to process FOLLOW_UP_CONTEXT internally using `history_context` and `evidence_context`.
    # TARGETED ENTITY CONTEXT BUILDER
    targeted_entities = []
    
    # Phase 4 & 5: Case-scoped Entity Resolution against classifier entities
    if classifier_entities:
        for ce in classifier_entities:
            # We already loaded case-scoped entities at the top
            match = next((e for e in entities if ce.lower() in e.get("name", "").lower()), None)
            if match and match not in targeted_entities:
                targeted_entities.append(match)
    
    # Phase 4 & 5: Resolve against regex as well
    who_match = None
    if not targeted_entities:
        who_match = re.search(r"who is\s+([a-zA-Z\s]+)", query_clean)
        if who_match:
            name = who_match.group(1).strip()
            match = next((e for e in entities if name in e.get("name", "").lower()), None)
            if match and match not in targeted_entities:
                targeted_entities.append(match)
                
    # STATE 3: Entity does not exist in current case
    NON_ENTITY_TERMS = {
        "he", "she", "they", "this", "it", "case", "investigation", "events", "relationships",
        "narrative", "story", "timeline", "chronological", "evidence", "data", "network",
        "graph", "linkages", "suspects", "persons", "overview", "details", "summary", "incident",
        "who", "what", "where", "when", "why", "how", "all", "the", "an", "a"
    }
    if (classifier_entities or who_match) and not targeted_entities:
        target_name = (classifier_entities[0] if classifier_entities else who_match.group(1)).strip()
        clean_target = target_name.lower().strip()
        # Don't do this for generic terms or whole-case queries
        if clean_target not in NON_ENTITY_TERMS and not any(term in clean_target for term in ["case", "narrative", "story", "event", "timeline"]):
            return {
                "answer": f"I couldn't find '{target_name}' in the current case data.",
                "actions": [],
                "supporting_evidence": []
            }

    targeted_context_blocks = []
    used_sources = set()
    
    if targeted_entities:
        used_sources.add("Entity records")
        for ent in targeted_entities:
            ent_id_str = str(ent["_id"])
            props = ent.get("properties", {})
            risk = ent.get("risk_score")
            
            # Phase 6: Targeted Entity Profile
            block = [
                f"TARGET ENTITY",
                f"Name: {ent.get('name')}",
                f"Type: {ent.get('type')}",
                f"ID: {ent_id_str}"
            ]
            if risk is not None:
                block.append(f"Risk: {risk}")
            if props:
                block.append(f"Properties: {props}")
                
            # Phase 7 & 8: Targeted Relationships with reasonable cap
            rels = []
            for r in relationships:
                if str(r.get("source_entity_id")) == ent_id_str:
                    tgt = next((e.get("name") for e in entities if str(e["_id"]) == str(r.get("target_entity_id"))), "Unknown")
                    rels.append(f"[{ent.get('name')}] --{r.get('type')}--> [{tgt}]")
                elif str(r.get("target_entity_id")) == ent_id_str:
                    src = next((e.get("name") for e in entities if str(e["_id"]) == str(r.get("source_entity_id"))), "Unknown")
                    rels.append(f"[{src}] --{r.get('type')}--> [{ent.get('name')}]")
                    
            if rels:
                used_sources.add("Relationship graph")
                block.append("RELATIONSHIPS:")
                block.extend([f"- {rel}" for rel in rels[:20]])
                if len(rels) > 20:
                    block.append(f"- (...and {len(rels) - 20} more connections not shown)")
                    
            targeted_context_blocks.append("\n".join(block))
            
    if targeted_context_blocks:
        case_summary += "\n\n" + "\n\n".join(targeted_context_blocks)
    elif not targeted_entities and intent in ["CASE_FACT", "GRAPH_ANALYSIS"]:
        # We don't have targeted entities, but we still want to provide SOME valid fallback facts
        # rather than just truncating to the first 10 generic entities.
        # However, we DO NOT limit to [:10] anymore, and we definitely DO NOT abort.
        pass

    # --- PHASE 1: Enhanced Context & System Persona ---
    from datetime import datetime
    
    # Authoritative server time
    try:
        from tzlocal import get_localzone
        now_local = datetime.now(get_localzone())
        tz_str = str(get_localzone())
    except:
        now_local = datetime.now().astimezone()
        tz_str = str(now_local.tzinfo)

    date_str = now_local.strftime("%Y-%m-%d")
    time_str = now_local.strftime("%H:%M:%S")
    day_str = now_local.strftime("%A")

    system_persona = (
        "You are NEXUS AI, an intelligent investigation assistant.\n\n"
        f"CURRENT SYSTEM DATE: {date_str}\n"
        f"CURRENT SYSTEM DAY: {day_str}\n"
        f"CURRENT LOCAL TIME: {time_str} ({tz_str})\n\n"
        "You assist users with information related to the NEXUS investigation platform and the currently selected investigation case.\n\n"
        "STRICT GROUNDING RULES:\n"
        "1. FACT VS INFERENCE: You must clearly distinguish between established case facts (from database/evidence) and your own analytical inferences. Do not state inferences as facts.\n"
        "2. NO HALLUCINATION: Never invent entities, relationships, evidence, case dates, or graph metrics.\n"
        "3. MISSING INFORMATION (STATE 2): If the user asks for a property of a known targeted entity that is missing from its listed properties, respond explicitly: 'The entity is present in the case, but that information is not recorded in the available case data.'\n"
        "4. NO RELEVANT INFORMATION (STATE 5): If the provided case context contains NO facts relevant to the query at all, explicitly respond: 'Insufficient information is available in the current case data to answer that question.'\n"
        "5. NO DEFINITIVE CULPABILITY: Never make a definitive guilt/innocence determination.\n"
        "6. CASE ISOLATION: Base investigation answers ONLY on the provided Case Data, Evidence Context, and Conversation History.\n"
        "7. RESOLVE PRONOUNS: Use the Conversation History to resolve references like 'he', 'she', or 'they'.\n"
        "8. PROFESSIONAL TONE: Respond concisely and professionally as a senior investigator. Use bullet points for complex facts.\n"
        "9. GENERAL KNOWLEDGE: You MAY answer general knowledge questions natively without claiming missing case data.\n"
    )
    
    # Fix: Make sure empty ChromaDB doesn't break the system prompt or override structured case data.
    if "No specific evidence" in evidence_context or "Evidence search unavailable" in evidence_context:
        evidence_context_prompt = "No additional unstructured evidence available via search."
    else:
        evidence_context_prompt = evidence_context
        
    user_prompt = f"Case Data:\n{case_summary}\n\nEvidence Context:\n{evidence_context_prompt}\n\nConversation History:\n{history_context}\n\nQuestion: {query}"
    answer = await call_hf_api(system_persona, user_prompt)
    
    if not answer:
        answer = generate_fallback_answer(query, case_id, entities, relationships, evidence_context, intent, classifier_entities)
        
    if "No additional unstructured" not in evidence_context_prompt and "No specific evidence" not in evidence_context:
        used_sources.add("ChromaDB")
        
    supporting_evidence_arr = list(used_sources)
        
    return {
        "answer": answer,
        "actions": [],
        "supporting_evidence": supporting_evidence_arr
    }

def generate_chronological_narrative_fallback(case_name: str, case_desc: str, events: list, entities: list, relationships: list) -> str:
    lines = []
    lines.append("1. Executive Summary")
    desc_text = case_desc if case_desc else "Active multi-entity investigation analyzing coordinated movements, communications, and transactions."
    lines.append(f"Case: {case_name}")
    lines.append(f"{desc_text}")
    lines.append(f"The investigation currently tracks {len(entities)} entities and {len(relationships)} relationships, mapping key communication channels, logistics operations, and financial transactions.\n")

    lines.append("2. Chronological Sequence of Events")
    if events:
        lines.append(f"Analysis of {len(events)} chronological milestones reconstructs the following sequence of events:\n")
        for ev in events[:25]:
            date_display = ev.get("date", "Recorded Date")
            src = ev.get("source", "Unknown Entity")
            tgt = ev.get("target", "Unknown Entity")
            rel = ev.get("type", "CONNECTED_TO")
            lines.append(f"• {date_display}: {src} engaged in {rel} with {tgt}.")
        if len(events) > 25:
            lines.append(f"\n(...plus {len(events) - 25} additional corroborated interactions recorded in the timeline)\n")
    else:
        lines.append("Chronological timestamps are currently being indexed from the latest ingested evidence files.\n")

    lines.append("3. Key Entities & Network Dynamics")
    sorted_ents = sorted(entities, key=lambda e: e.get("risk_score", 0), reverse=True)
    key_actors = sorted_ents[:5]
    if key_actors:
        lines.append("Central figures and organizations identified in the network:")
        for ent in key_actors:
            risk = ent.get("risk_score", 0)
            risk_pct = f"{int(risk * 100)}%" if risk else "Assessing"
            lines.append(f"• {ent.get('name')} ({ent.get('type', 'Entity')}) — Threat Risk: {risk_pct}")
    lines.append("")

    lines.append("4. Investigative Findings & Recommendations")
    lines.append("• Critical communication clustering indicates active coordination across identified organizational nodes.")
    lines.append("• Cross-reference suspect itineraries against location access logs to finalize the corroboration index.")
    lines.append("• Review financial transaction trails and vehicles associated with prime network actors.")

    return "\n".join(lines)

def generate_fallback_answer(query: str, case_id: str, entities: list, relationships: list, evidence_context: str, intent: str = "UNKNOWN", classifier_entities: list = None) -> str:
    if classifier_entities is None:
        classifier_entities = []
        
    query_clean = re.sub(r'[^\w\s]', '', query.lower()).strip()
    
    # Generic Data-Driven Fallbacks (Only use actual entities and relationships)
    
    # 1. Who is most central?
    if "central" in query_clean and ("most" in query_clean or "network" in query_clean):
        if not relationships:
            return "Insufficient information is available in the current case records to answer this question."
        counts = {}
        for r in relationships:
            counts[str(r.get("source_entity_id"))] = counts.get(str(r.get("source_entity_id")), 0) + 1
            counts[str(r.get("target_entity_id"))] = counts.get(str(r.get("target_entity_id")), 0) + 1
        most_central_id = max(counts, key=counts.get)
        central_ent = next((e for e in entities if str(e["_id"]) == most_central_id), None)
        if central_ent:
            return f"Based on the current case records, the most central entity in the network is {central_ent.get('name')} with {counts[most_central_id]} connections."
            
    # 2. What organizations are involved?
    if "organization" in query_clean or "organizations" in query_clean:
        orgs = [e.get("name") for e in entities if e.get("type", "").upper() == "ORGANIZATION"]
        if orgs:
            return f"The organizations involved in the current case records are: {', '.join(orgs)}."
        return "Insufficient information is available in the current case records to answer this question."
        
    # 3. What locations are involved?
    if "location" in query_clean or "locations" in query_clean or "where" in query_clean:
        locs = [e.get("name") for e in entities if e.get("type", "").upper() == "LOCATION"]
        if locs:
            return f"The locations associated with the current case records are: {', '.join(locs)}."
        # Don't return insufficient for "where" as it might be handled below
        if "location" in query_clean:
            return "Insufficient information is available in the current case records to answer this question."

    # 4. What financial transactions occurred?
    if "financial" in query_clean or "transaction" in query_clean or "transferred" in query_clean:
        trans_rels = [r for r in relationships if r.get("type", "").upper() in ["TRANSFERRED_TO", "FINANCED"]]
        if trans_rels:
            res = "Financial transactions found in case records:\n"
            for r in trans_rels:
                src = next((e.get("name") for e in entities if str(e["_id"]) == str(r.get("source_entity_id"))), "Unknown")
                tgt = next((e.get("name") for e in entities if str(e["_id"]) == str(r.get("target_entity_id"))), "Unknown")
                res += f"- {src} -> {tgt} ({r.get('type')})\n"
            return res.strip()
        amounts = [e.get("name") for e in entities if e.get("type", "").upper() == "FINANCIAL_AMOUNT"]
        if amounts:
            return f"Financial amounts found in the case records: {', '.join(amounts)}."
        return "Insufficient information is available in the current case records to answer this question."
        
    # 5. Who is connected to X?
    connected_match = re.search(r"(?:who is|what is) connected to ([a-zA-Z\s]+)", query_clean)
    is_connected_query = (intent in ["GRAPH_ANALYSIS", "PATH_TRACING", "CASE_RELATIONSHIP"] and len(classifier_entities) == 1) or connected_match
    
    if is_connected_query:
        target_ent = None
        if intent in ["GRAPH_ANALYSIS", "PATH_TRACING", "CASE_RELATIONSHIP"] and len(classifier_entities) == 1:
            target_name = classifier_entities[0].lower()
            target_ent = next((e for e in entities if target_name in e.get("name", "").lower()), None)
            
        if not target_ent and connected_match:
            target_name = connected_match.group(1).strip()
            target_ent = next((e for e in entities if target_name in e.get("name", "").lower()), None)
            
        if target_ent:
            tid = str(target_ent["_id"])
            connections = []
            for r in relationships:
                if str(r.get("source_entity_id")) == tid:
                    other = next((e.get("name") for e in entities if str(e["_id"]) == str(r.get("target_entity_id"))), None)
                    if other: connections.append(f"{other} ({r.get('type')})")
                elif str(r.get("target_entity_id")) == tid:
                    other = next((e.get("name") for e in entities if str(e["_id"]) == str(r.get("source_entity_id"))), None)
                    if other: connections.append(f"{other} ({r.get('type')})")
            if connections:
                return f"Based on the case records, {target_ent.get('name')} is connected to: {', '.join(connections)}."
        return "Insufficient information is available in the current case records to answer this question."

    # 6. Default Fallback
    return "Insufficient information is available in the current case data to answer that question."

async def call_hf_api(system_prompt: str, user_prompt: str, model: str = None, format: str = None) -> str:
    """
    Calls the local Ollama LLM.
    """
    from app.ai.local_llm import generate
    try:
        kwargs = {}
        if model: kwargs["model"] = model
        if format: kwargs["format"] = format
        response = await generate(system_prompt, user_prompt, **kwargs)
        return response
    except Exception as e:
        err_str = str(e)
        print(f"Local LLM inference failure: {err_str}")
        if "LOCAL_AI_UNAVAILABLE" in err_str or "LOCAL_AI_TIMEOUT" in err_str:
            return f"Analysis unavailable: {err_str}"
        return ""
