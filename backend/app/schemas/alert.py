from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from app.models.user import PyObjectId

class AlertBase(BaseModel):
    case_id: str
    entity_id: Optional[str] = None
    type: str
    severity: str
    message: str
    status: str = "ACTIVE"
    disposition: Optional[str] = None
    resolution_notes: Optional[str] = None
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None

class AlertCreate(AlertBase):
    pass

class AlertResolveRequest(BaseModel):
    case_id: str
    alert_id: Optional[str] = None
    entity_id: Optional[str] = None
    disposition: str = "INNOCENT" # INNOCENT, FALSE_POSITIVE, MITIGATED
    resolution_notes: Optional[str] = "Entity cleared by investigator. Free to go."
    clear_entity: bool = True
    message: Optional[str] = None
    type: Optional[str] = None
    severity: Optional[str] = None

class AlertReopenRequest(BaseModel):
    case_id: str
    alert_id: str
    entity_id: Optional[str] = None

class AlertOut(AlertBase):
    id: PyObjectId = Field(alias="_id")
    created_at: datetime

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True
    }

