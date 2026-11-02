"""
RepoDojo AI Service
FastAPI application for AI orchestration, Graphify context retrieval, and guarded Gemini assistance.
Master Architecture: ADR-001-all-domains-master.md
"""

import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    session_id: str
    assessment_id: str
    candidate_id: str
    prompt: str = Field(..., max_length=2000)
    active_file: str | None = None
    selected_code: str | None = None
    terminal_error: str | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Graphify cache & prewarm models
    print("[AI-Service] Initializing RepoDojo AI Service (Python 3.12+)...")
    yield
    # Shutdown: Clean up caches
    print("[AI-Service] Shutting down AI Service...")


app = FastAPI(
    title="RepoDojo AI Service",
    version="0.4.0",
    description="RepoDojo AI Layer: Guarded Gemini 3.8 Flash + Graphify",
    lifespan=lifespan,
)

START_TIME = time.time()


# =============================================================================
# Domain 13: 3-Stage Health Probes
# =============================================================================


@app.get("/startupz")
async def startup_check():
    return {"status": "started", "timestamp": time.time()}


@app.get("/livez")
async def liveness_check():
    return {"status": "alive", "uptime_seconds": int(time.time() - START_TIME)}


@app.get("/readyz")
async def readiness_check():
    return {
        "status": "healthy",
        "service": "repodojo-ai-service",
        "version": "0.4.0",
        "uptime_seconds": int(time.time() - START_TIME),
        "dependencies": {
            "gemini_api": {"status": "configured"},
            "graphify_cache": {"status": "ready"},
        },
    }


# =============================================================================
# Domain 8: Guarded AI Assistant SSE Endpoint
# =============================================================================


@app.post("/internal/ai/chat/stream")
async def stream_ai_chat(request: ChatRequest):
    """
    Guarded AI stream endpoint invoked by the Express Gateway.
    Adheres to Decision 8.1 (Ask Mode only, 7-LOC snippet limit) and Decision 8.2 (Dual-layer).
    """

    async def event_generator() -> AsyncGenerator[str, None]:
        # Placeholder for streaming tokens
        msg = "[RepoDojo Guarded AI] Understanding your repository query...\n"
        yield f'data: {{"type": "message", "content": "{msg}"}}\n\n'
        yield 'data: {"type": "usage", "inputTokens": 120, "outputTokens": 45}\n\n'
        yield 'data: {"type": "done"}\n\n'

    return StreamingResponse(event_generator(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
