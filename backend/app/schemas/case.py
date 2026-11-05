from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime
from app.models.user import PyObjectId

class CaseBase(BaseModel):
    name: str
    description: Optional[str] = None
    status: str = "OPEN"
    priority: str = "MEDIUM"
    investigator: Optional[str] = None

class CaseCreate(CaseBase):
    pass

class CaseOut(CaseBase):
    id: PyObjectId = Field(alias="_id")
    case_number: Optional[str] = None
    created_by: Optional[str] = "system"
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    ai_narrative: Optional[str] = None
    narrative_generated_at: Optional[datetime] = None

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
        "extra": "allow"
    }

