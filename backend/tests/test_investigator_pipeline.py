import pytest
import asyncio
from bson import ObjectId
import networkx as nx

from app.ai.investigator_agent import (
    clean_query_text,
    extract_target_name,
    search_entities_fuzzy,
    resolve_subject_from_history,
    detect_request_intent,
    format_entity_profile_response,
    format_disambiguation_response,
    format_entity_not_found_response,
    format_relationships_response,
    format_connection_path_response,
    format_risk_analysis_response,
    format_highest_risk_entities_response,
    format_case_summary_response,
    format_evidence_response,
    format_timeline_response,
    format_locations_response,
    run_ai_investigator
)
from app.graph.graph_builder import build_graph

# Mock database helper for testing
class MockCollection:
    def __init__(self, documents):
        self.docs = documents

    def find(self, query=None):
        return self

    async def to_list(self, length=None):
        return self.docs

    async def find_one(self, query=None):
        if not self.docs:
            return None
        return self.docs[0]

class MockDB(dict):
    def __init__(self, data):
        super().__init__()
        for k, v in data.items():
            self[k] = MockCollection(v)

@pytest.fixture
def mock_case_data():
    ent1 = {
        "_id": ObjectId("6a9d2fdb91f26f916cbbc101"),
        "case_id": "case_123",
        "type": "PERSON",
        "name": "Arjun Mehta",
        "risk_score": 0.82,
        "properties": {
            "entity_id": "P01",
            "role": "Financial intermediary",
            "associated_organization": "Blue Horizon Logistics",
            "city": "Mumbai",
            "phone": "+91 98200 11223",
            "email": "arjun@example.com"
        }
    }
    ent2 = {
        "_id": ObjectId("6a9d2fdb91f26f916cbbc102"),
        "case_id": "case_123",
        "type": "PERSON",
        "name": "Rohan Desai",
        "risk_score": 0.75,
        "properties": {
            "entity_id": "P02",
            "role": "Transport coordinator",
            "city": "Navi Mumbai"
        }
    }
    ent3 = {
        "_id": ObjectId("6a9d2fdb91f26f916cbbc103"),
        "case_id": "case_123",
        "type": "ORGANIZATION",
        "name": "Blue Horizon Logistics",
        "risk_score": 0.88,
        "properties": {
            "entity_id": "O01",
            "role": "Freight forwarding company",
            "city": "Mumbai"
        }
    }
    ent4 = {
        "_id": ObjectId("6a9d2fdb91f26f916cbbc104"),
        "case_id": "case_123",
        "type": "LOCATION",
        "name": "Andheri Dock",
        "risk_score": 0.45,
        "properties": {
            "city": "Mumbai"
        }
    }
    ent_ambiguous = {
        "_id": ObjectId("6a9d2fdb91f26f916cbbc105"),
        "case_id": "case_123",
        "type": "ORGANIZATION",
        "name": "Arjun Mehta & Co.",
        "risk_score": 0.50,
        "properties": {
            "entity_id": "O02"
        }
    }

    rel1 = {
        "_id": ObjectId("6a9d2fdb91f26f916cbbc201"),
        "case_id": "case_123",
        "source_entity_id": str(ent1["_id"]),
        "target_entity_id": str(ent2["_id"]),
        "type": "COMMUNICATES_WITH",
        "properties": {"timestamp": "2026-08-17T14:20:00"}
    }
    rel2 = {
        "_id": ObjectId("6a9d2fdb91f26f916cbbc202"),
        "case_id": "case_123",
        "source_entity_id": str(ent2["_id"]),
        "target_entity_id": str(ent3["_id"]),
        "type": "ASSOCIATED_WITH",
        "properties": {"timestamp": "2026-08-18T10:15:00"}
    }
    rel3 = {
        "_id": ObjectId("6a9d2fdb91f26f916cbbc203"),
        "case_id": "case_123",
        "source_entity_id": str(ent1["_id"]),
        "target_entity_id": str(ent4["_id"]),
        "type": "VISITED",
        "properties": {"timestamp": "2026-08-17T09:30:00"}
    }

    ev1 = {
        "_id": ObjectId("6a9d2fdb91f26f916cbbc301"),
        "case_id": "case_123",
        "title": "EV-04 Communication Record",
        "source_type": "Communication",
        "raw_content": "Intercepted call between Arjun Mehta and Rohan Desai discussing dispatch.",
        "created_at": "2026-08-17"
    }
    ev2 = {
        "_id": ObjectId("6a9d2fdb91f26f916cbbc302"),
        "case_id": "case_123",
        "title": "EV-07 Wire Transfer Record",
        "source_type": "Financial Record",
        "raw_content": "Offshore wire transfer referencing Arjun Mehta and Blue Horizon Logistics.",
        "created_at": "2026-08-18"
    }

    case_doc = {
        "_id": ObjectId("6a9d2fdb91f26f916cbbc001"),
        "name": "Operation Mirage",
        "description": "Complex cargo diversion and offshore fund routing investigation.",
        "status": "OPEN",
        "created_at": "2026-08-10"
    }

    return {
        "entities": [ent1, ent2, ent3, ent4, ent_ambiguous],
        "relationships": [rel1, rel2, rel3],
        "evidence": [ev1, ev2],
        "timeline": [],
        "cases": [case_doc]
    }

# ==============================================================================
# TESTS
# ==============================================================================

def test_normalization_and_prefixes():
    assert clean_query_text("Mr. Arjun Mehta") == "arjun mehta"
    assert clean_query_text("Dr. Vikram Singh Yadav") == "vikram singh yadav"
    assert clean_query_text("Officer Devendra Patil") == "devendra patil"
    assert extract_target_name("Who is Mr. Arjun Mehta?") == "arjun mehta"
    assert extract_target_name("Tell me about Arjun Mehta in this case") == "arjun mehta"
    assert extract_target_name("What do you know about Rohan?") == "rohan"

def test_fuzzy_matching_exact(mock_case_data):
    entities = mock_case_data["entities"]
    matches, amb = search_entities_fuzzy(entities, "Arjun Mehta")
    assert len(matches) == 1
    assert matches[0]["name"] == "Arjun Mehta"
    assert amb is False

def test_fuzzy_matching_variations(mock_case_data):
    entities = mock_case_data["entities"]
    # Single match test with Rohan
    matches, amb = search_entities_fuzzy(entities, "Rohan")
    assert len(matches) == 1
    assert matches[0]["name"] == "Rohan Desai"

    # Match by Entity ID / code
    matches, amb = search_entities_fuzzy(entities, "P01")
    assert len(matches) == 1
    assert matches[0]["name"] == "Arjun Mehta"

def test_disambiguation(mock_case_data):
    entities = mock_case_data["entities"]
    # Query "Arjun" matches both "Arjun Mehta" and "Arjun Mehta & Co."
    matches, amb = search_entities_fuzzy(entities, "Arjun")
    assert len(matches) == 2
    assert amb is True
    
    resp = format_disambiguation_response(matches)
    assert "I found 2 possible matches:" in resp
    assert "Arjun Mehta — PERSON" in resp
    assert "Arjun Mehta & Co. — ORGANIZATION" in resp
    assert "Which one do you mean?" in resp

def test_entity_not_found():
    resp = format_entity_not_found_response("Kabir Singhania")
    assert "I couldn't find an entity named 'Kabir Singhania' in the active case." in resp
    assert "I searched the available case entities and evidence." in resp
    assert "You can try:" in resp
    assert "surname only" in resp

def test_entity_profile_structure(mock_case_data):
    entities = mock_case_data["entities"]
    arjun = entities[0]
    ent_map = {str(e["_id"]): e for e in entities}
    resp = format_entity_profile_response(
        arjun, 
        mock_case_data["relationships"], 
        mock_case_data["evidence"], 
        [], 
        ent_map
    )
    assert "ENTITY PROFILE" in resp
    assert "Name: [Arjun Mehta]" in resp
    assert "Type: PERSON" in resp
    assert "Risk Score: 0.82 — High" in resp
    assert "Role: Financial intermediary" in resp
    assert "Associated organization: Blue Horizon Logistics" in resp
    assert "Known location: Mumbai" in resp
    assert "RELATIONSHIPS" in resp
    assert "COMMUNICATES WITH" in resp
    assert "EVIDENCE" in resp
    assert "EV-04 Communication Record" in resp
    assert "Confidence:\nHIGH" in resp

def test_direct_and_two_hop_relationships(mock_case_data):
    entities = mock_case_data["entities"]
    arjun = entities[0]
    ent_map = {str(e["_id"]): e for e in entities}
    G = build_graph(entities, mock_case_data["relationships"])
    
    resp = format_relationships_response(arjun, mock_case_data["relationships"], ent_map, G)
    assert "DIRECT CONNECTIONS" in resp
    assert "Rohan Desai" in resp
    assert "COMMUNICATES_WITH" in resp
    assert "2-hop connections:" in resp
    assert "Blue Horizon Logistics" in resp

def test_shortest_path_calculation(mock_case_data):
    entities = mock_case_data["entities"]
    arjun = entities[0]
    blue_horizon = entities[2]
    ent_map = {str(e["_id"]): e for e in entities}
    G = build_graph(entities, mock_case_data["relationships"])
    
    path = nx.shortest_path(G, str(arjun["_id"]), str(blue_horizon["_id"]))
    assert len(path) == 3 # Arjun -> Rohan -> Blue Horizon
    
    resp = format_connection_path_response(arjun, blue_horizon, path, mock_case_data["relationships"], ent_map)
    assert "CONNECTION FOUND" in resp
    assert "Arjun Mehta" in resp
    assert "↓" in resp
    assert "Rohan Desai" in resp
    assert "↓" in resp
    assert "Blue Horizon Logistics" in resp
    assert "Path length: 2 relationships" in resp

def test_risk_analysis_contributing_factors(mock_case_data):
    entities = mock_case_data["entities"]
    arjun = entities[0]
    ent_map = {str(e["_id"]): e for e in entities}
    
    resp = format_risk_analysis_response(arjun, mock_case_data["relationships"], mock_case_data["evidence"], ent_map)
    assert "ARJUN MEHTA — RISK ANALYSIS" in resp
    assert "Risk Score: 0.82" in resp
    assert "Risk Level: HIGH" in resp
    assert "Contributing factors:" in resp
    assert "Role: Financial intermediary" in resp or "Appears in" in resp

def test_chat_memory_pronoun_resolution(mock_case_data):
    entities = mock_case_data["entities"]
    history = [
        {"sender": "user", "text": "Who is Arjun Mehta?"},
        {"sender": "ai", "text": "ENTITY PROFILE for Arjun Mehta..."}
    ]
    resolved = resolve_subject_from_history("Who does he communicate with?", history, entities)
    assert resolved is not None
    assert resolved["name"] == "Arjun Mehta"

    resolved_followup = resolve_subject_from_history("What about his connections?", history, entities)
    assert resolved_followup is not None
    assert resolved_followup["name"] == "Arjun Mehta"

@pytest.mark.asyncio
async def test_end_to_end_investigator_queries(mock_case_data):
    db = MockDB(mock_case_data)
    user = {"email": "analyst@nexus.intel"}

    # Test 1: Entity profile
    res1 = await run_ai_investigator("Who is Arjun Mehta?", "case_123", db, user)
    assert "ENTITY PROFILE" in res1["answer"]
    assert "Arjun Mehta" in res1["answer"]

    # Test 2: Chat memory pronoun follow-up
    res2 = await run_ai_investigator(
        "Who does he communicate with?", 
        "case_123", 
        db, 
        user, 
        history_list=[{"sender": "user", "text": "Who is Arjun Mehta?"}, {"sender": "ai", "text": res1["answer"]}]
    )
    assert "DIRECT CONNECTIONS" in res2["answer"]
    assert "Rohan Desai" in res2["answer"]

    # Test 3: Shortest path between Arjun Mehta and Blue Horizon Logistics
    res3 = await run_ai_investigator("How is Arjun Mehta connected to Blue Horizon Logistics?", "case_123", db, user)
    assert "CONNECTION FOUND" in res3["answer"]
    assert "Rohan Desai" in res3["answer"]

    # Test 4: Highest risk person
    res4 = await run_ai_investigator("Who is the highest risk entity?", "case_123", db, user)
    assert "HIGHEST-RISK ENTITIES IN ACTIVE CASE" in res4["answer"]

    # Test 5: Entity not found
    res5 = await run_ai_investigator("Who is Kabir Singhania?", "case_123", db, user)
    assert "I couldn't find an entity named 'Kabir Singhania' in the active case." in res5["answer"]

    # Test 6: Case summary
    res6 = await run_ai_investigator("Summarize this case", "case_123", db, user)
    assert "CASE SUMMARY" in res6["answer"]
    assert "Operation Mirage" in res6["answer"]

    # Test 7: General question
    res7 = await run_ai_investigator("What is a 2-hop connection?", "case_123", db, user)
    assert "GENERAL KNOWLEDGE" in res7["answer"]
    assert "2-hop connection" in res7["answer"]
