from fastapi import APIRouter, Depends
from app.core.database import get_database
from app.api.routes.auth import get_current_user

from app.ai.investigator_agent import run_ai_investigator

router = APIRouter()

from datetime import datetime

from pydantic import BaseModel
from typing import List, Optional

class ChatMessage(BaseModel):
    sender: str
    text: str

class ChatRequest(BaseModel):
    query: str
    case_id: str = "all"
    history: List[ChatMessage] = []

@router.post("")
@router.post("/")
async def chat_with_nexus(req: ChatRequest, db=Depends(get_database), current_user=Depends(get_current_user)):
    history_context = ""
    if req.history:
        history_context = "Previous Conversation History:\n"
        for msg in req.history[-5:]: # Keep last 5 messages for context
            role = "User" if msg.sender == "user" else "AI"
            history_context += f"{role}: {msg.text}\n"
            
    response = await run_ai_investigator(req.query, req.case_id, db, current_user, history_context)
    return response
