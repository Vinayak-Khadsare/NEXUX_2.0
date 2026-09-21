import pytest
import asyncio
from datetime import datetime
from bson import ObjectId
from unittest.mock import AsyncMock, MagicMock

from app.schemas.alert import AlertResolveRequest, AlertReopenRequest
from app.api.routes.alerts import resolve_alert, reopen_alert, calculate_case_risk
from app.ai.investigator_agent import (
    format_entity_profile_response,
    format_risk_analysis_response,
    format_highest_risk_entities_response
)

class AsyncMockCursor:
    def __init__(self, items):
        self.items = items
    def __aiter__(self):
        self._iter = iter(self.items)
        return self
    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration
    async def to_list(self, length=None):
        return self.items

@pytest.fixture
def mock_db():
    db = MagicMock()
    
    # In-memory storage for test
    entities = [
        {
            "_id": ObjectId("6a9d1669f7331ae294ea3e6d"),
            "case_id": "test_case_1",
            "name": "Arjun Mehta",
            "type": "PERSON",
            "risk_score": 0.82,
            "properties": {"role": "Financial intermediary"},
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
    ]
    alerts = []

    def find_one(collection, query):
        if collection == "entities":
            for e in entities:
                if query.get("_id") and e["_id"] == query["_id"]:
                    return e
                if query.get("case_id") and e.get("case_id") != query["case_id"]:
                    continue
                return e
        elif collection == "alerts":
            for a in alerts:
                if query.get("_id") and a.get("_id") == query["_id"]:
                    return a
        return None

    def update_one(collection, query, update):
        if collection == "entities":
            for e in entities:
                if e["_id"] == query["_id"]:
                    if "$set" in update:
                        for k, v in update["$set"].items():
                            if "." in k:
                                p_key, sub_key = k.split(".", 1)
                                if p_key not in e: e[p_key] = {}
                                e[p_key][sub_key] = v
                            else:
                                e[k] = v
                    return
        elif collection == "alerts":
            for a in alerts:
                if a.get("_id") == query["_id"]:
                    if "$set" in update:
                        for k, v in update["$set"].items():
                            a[k] = v
                    return

    def insert_one(collection, doc):
        res = MagicMock()
        new_id = ObjectId()
        doc["_id"] = new_id
        if collection == "alerts":
            alerts.append(doc)
        elif collection == "entities":
            entities.append(doc)
        res.inserted_id = new_id
        return res

    mock_entities = MagicMock()
    mock_entities.find_one = AsyncMock(side_effect=lambda q: find_one("entities", q))
    mock_entities.update_one = AsyncMock(side_effect=lambda q, u: update_one("entities", q, u))
    mock_entities.find = MagicMock(return_value=AsyncMockCursor(entities))

    mock_alerts = MagicMock()
    mock_alerts.find_one = AsyncMock(side_effect=lambda q: find_one("alerts", q))
    mock_alerts.update_one = AsyncMock(side_effect=lambda q, u: update_one("alerts", q, u))
    mock_alerts.update_many = AsyncMock()
    mock_alerts.insert_one = AsyncMock(side_effect=lambda d: insert_one("alerts", d))
    mock_alerts.find = MagicMock(return_value=AsyncMockCursor(alerts))

    mock_rels = MagicMock()
    mock_rels.find = MagicMock(return_value=AsyncMockCursor([]))

    db.__getitem__.side_effect = lambda key: {
        "entities": mock_entities,
        "alerts": mock_alerts,
        "relationships": mock_rels
    }[key]

    return db, entities, alerts

@pytest.mark.asyncio
async def test_resolve_entity_as_innocent(mock_db):
    db, entities, alerts = mock_db
    current_user = {"email": "agent@nexus.gov"}

    req = AlertResolveRequest(
        case_id="test_case_1",
        alert_id="generated_risk_6a9d1669f7331ae294ea3e6d",
        entity_id="6a9d1669f7331ae294ea3e6d",
        disposition="INNOCENT",
        resolution_notes="Alibi verified. Subject cleared as innocent and free to go.",
        clear_entity=True
    )

    res = await resolve_alert(payload=req, db=db, current_user=current_user)
    assert res["success"] is True
    assert res["disposition"] == "INNOCENT"

    ent = entities[0]
    assert ent["disposition"] == "CLEARED"
    assert ent["risk_score"] == 0.0
    assert ent["properties"]["is_cleared"] is True
    assert ent["properties"]["clearance_status"] == "FREE_TO_GO"
    assert ent["properties"]["previous_risk_score"] == 0.82
    assert "Alibi verified" in ent["properties"]["resolution_notes"]

    # Verify a resolved alert was logged in alerts collection
    assert len(alerts) == 1
    assert alerts[0]["status"] == "RESOLVED"
    assert alerts[0]["disposition"] == "INNOCENT"

@pytest.mark.asyncio
async def test_cleared_entity_excluded_from_risk_recalculation(mock_db):
    db, entities, alerts = mock_db
    current_user = {"email": "agent@nexus.gov"}

    # Entity is cleared
    entities[0]["disposition"] = "CLEARED"
    entities[0]["risk_score"] = 0.0
    entities[0]["properties"]["is_cleared"] = True
    entities[0]["properties"]["clearance_status"] = "FREE_TO_GO"

    calc_res = await calculate_case_risk(case_id="test_case_1", db=db, current_user=current_user)
    assert calc_res["alerts_created"] == 0
    # Entity score remained 0.0 and was not recalculated to high risk
    assert entities[0]["risk_score"] == 0.0

@pytest.mark.asyncio
async def test_reopen_alert_restores_entity(mock_db):
    db, entities, alerts = mock_db
    current_user = {"email": "agent@nexus.gov"}

    # First clear entity
    req = AlertResolveRequest(
        case_id="test_case_1",
        alert_id="generated_risk_6a9d1669f7331ae294ea3e6d",
        entity_id="6a9d1669f7331ae294ea3e6d",
        disposition="INNOCENT",
        resolution_notes="Innocent",
        clear_entity=True
    )
    await resolve_alert(payload=req, db=db, current_user=current_user)
    assert entities[0]["risk_score"] == 0.0

    # Reopen
    reopen_req = AlertReopenRequest(
        case_id="test_case_1",
        alert_id=str(alerts[0]["_id"]),
        entity_id="6a9d1669f7331ae294ea3e6d"
    )
    reopen_res = await reopen_alert(payload=reopen_req, db=db, current_user=current_user)
    assert reopen_res["success"] is True

    assert entities[0]["properties"]["is_cleared"] is False
    assert entities[0]["properties"]["clearance_status"] == "ACTIVE"
    assert entities[0]["risk_score"] == 0.82

def test_ai_agent_recognizes_cleared_innocent_entity():
    cleared_entity = {
        "_id": ObjectId("6a9d1669f7331ae294ea3e6d"),
        "name": "Arjun Mehta",
        "type": "PERSON",
        "risk_score": 0.0,
        "disposition": "CLEARED",
        "properties": {
            "is_cleared": True,
            "disposition": "INNOCENT",
            "clearance_status": "FREE_TO_GO",
            "previous_risk_score": 0.82,
            "resolution_notes": "Alibi verified. Free to go."
        }
    }

    profile = format_entity_profile_response(
        entity=cleared_entity,
        relationships=[],
        evidence_docs=[],
        timeline_events=[],
        entity_map={str(cleared_entity["_id"]): cleared_entity}
    )

    assert "Status: CLEARED / INNOCENT (Free to Go)" in profile
    assert "Risk Score: 0.00 — Cleared (Prior Risk: 0.82)" in profile

    risk_analysis = format_risk_analysis_response(
        entity=cleared_entity,
        relationships=[],
        evidence_docs=[],
        all_entities_map={str(cleared_entity["_id"]): cleared_entity}
    )

    assert "Risk Level: CLEARED / INNOCENT" in risk_analysis
    assert "Subject was investigated and cleared as INNOCENT (Free to Go)" in risk_analysis

    highest = format_highest_risk_entities_response(
        entities=[cleared_entity],
        relationships=[]
    )
    # Cleared entities must not be returned in high-risk rankings
    assert "Arjun Mehta" not in highest
