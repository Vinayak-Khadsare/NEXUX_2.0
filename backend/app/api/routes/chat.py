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
    history_list = []
    if req.history:
        history_context = "Previous Conversation History:\n"
        for msg in req.history[-8:]: # Keep last 8 messages for context
            role = "User" if msg.sender == "user" else "AI"
            history_context += f"{role}: {msg.text}\n"
            history_list.append({"sender": msg.sender, "text": msg.text})
            
    try:
        response = await run_ai_investigator(
            req.query, 
            req.case_id, 
            db, 
            current_user, 
            history_context=history_context,
            history_list=history_list
        )
        return response
    except Exception as err:
        import traceback
        print(f"[NEXUS_CHAT_ERROR] Exception processing investigation query '{req.query}': {err}")
        traceback.print_exc()
        return {
            "answer": "I couldn't retrieve the case data right now. Please try again.",
            "actions": [],
            "supporting_evidence": []
        }

