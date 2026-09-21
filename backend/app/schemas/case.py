from pydantic import BaseModel, Field
from typing import Optional, List
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
    created_by: str
    created_at: datetime
    updated_at: datetime
    ai_narrative: Optional[str] = None
    narrative_generated_at: Optional[datetime] = None

    class Config:
        extra = "allow"

