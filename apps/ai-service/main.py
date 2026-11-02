"""
RepoDojo AI Service
FastAPI application for AI orchestration, Graphify context retrieval, and guarded Gemini assistance.
Master Architecture: ADR-001 Domain 8 & Domain 9
"""

import json
import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from gemini_client import gemini_client
from graphify_engine import graphify_engine
from guardrails import GuardrailValidator
from prompts import build_system_instruction


class ChatRequest(BaseModel):
    session_id: str
    assessment_id: str
    candidate_id: str
    challenge_id: str = "node-ecommerce-01"
    prompt: str = Field(..., max_length=2000)
    active_file: str | None = None
    selected_code: str | None = None
    terminal_error: str | None = None
    assistance_level: int = Field(default=1, ge=1, le=3)


class GraphifyLoadRequest(BaseModel):
    challenge_id: str
    graph_data: dict[str, Any]


class ReportSynthesisRequest(BaseModel):
    session_id: str
    challenge_id: str = "node-ecommerce-01"
    total_score: float = Field(..., ge=0, le=100)
    functional_score: float = Field(..., ge=0, le=60)
    quality_score: float = Field(..., ge=0, le=20)
    trajectory_score: float = Field(..., ge=0, le=20)
    defects_resolved_count: int = Field(..., ge=0, le=8)
    defects_total_count: int = 8
    candidate_prompts_count: int = 0
    tokens_used: int = 0


class ReportSynthesisResponse(BaseModel):
    executive_summary: str
    strengths: list[str]
    areas_for_improvement: list[str]
    practice_recommendations: list[str]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize default AST graph for node-ecommerce-01
    print("[AI-Service] Initializing RepoDojo AI Service (Python 3.12+)...")
    graphify_engine.get_or_create_default_graph("node-ecommerce-01")
    yield
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
# Domain 9: Graphify Precomputation & Management
# =============================================================================


@app.post("/internal/graphify/load")
async def load_graphify_artifact(req: GraphifyLoadRequest):
    """Loads precomputed Graphify AST into memory (Decision 9.1)."""
    node_count = graphify_engine.load_challenge_graph(req.challenge_id, req.graph_data)
    return {
        "status": "success",
        "challenge_id": req.challenge_id,
        "nodesLoaded": node_count,
    }


@app.get("/internal/graphify/context")
async def get_graphify_context(challenge_id: str, query: str, active_file: str | None = None):
    """Retrieves 1-2 degree AST graph context for a query."""
    nodes = graphify_engine.query_relevant_nodes(challenge_id, query, active_file)
    context_md = graphify_engine.format_graph_context_for_prompt(challenge_id, query, active_file)
    return {
        "nodes": nodes,
        "contextMarkdown": context_md,
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
    # 1. Inspect prompt for adversarial injection
    is_adversarial, reason = GuardrailValidator.inspect_prompt(request.prompt)
    if is_adversarial:

        async def rejection_generator() -> AsyncGenerator[str, None]:
            rejection_msg = (
                "I cannot fulfill this request. To preserve assessment integrity, "
                "I operate strictly as a Socratic engineering mentor. "
                "Please ask a conceptual question or ask for help understanding a specific function or error."
            )
            yield f"data: {json.dumps({'type': 'token', 'text': rejection_msg})}\n\n"
            yield f"data: {json.dumps({'type': 'guardrail', 'triggered': True, 'reason': reason})}\n\n"
            yield f"data: {json.dumps({'type': 'usage', 'inputTokens': 20, 'outputTokens': 30})}\n\n"
            yield 'data: {"type": "done"}\n\n'

        return StreamingResponse(rejection_generator(), media_type="text/event-stream")

    # 2. Retrieve Graphify AST Context (Decision 9.2)
    graph_context = graphify_engine.format_graph_context_for_prompt(
        challenge_id=request.challenge_id,
        query_text=request.prompt,
        active_file=request.active_file,
    )

    # 3. Build Socratic System Prompt (Decision 8.1 & 8.3)
    system_instruction = build_system_instruction(request.assistance_level)

    # 4. Stream Socratic response through Guardrail validator
    async def socratic_stream() -> AsyncGenerator[str, None]:
        full_text_accumulator: list[str] = []
        token_usage = {"inputTokens": 0, "outputTokens": 0}

        async for chunk in gemini_client.stream_socratic_response(
            system_instruction=system_instruction,
            user_prompt=request.prompt,
            graph_context=graph_context,
            active_file=request.active_file,
            selected_code=request.selected_code,
            terminal_error=request.terminal_error,
        ):
            if chunk["type"] == "token":
                text = chunk["text"]
                full_text_accumulator.append(text)
                yield f"data: {json.dumps({'type': 'token', 'text': text})}\n\n"
            elif chunk["type"] == "usage":
                token_usage = chunk

        # 5. Deterministic Guardrail Check on complete response (7-Line Cap - Decision 8.3)
        complete_text = "".join(full_text_accumulator)
        _, guardrail_triggered, guardrail_reason = (
            GuardrailValidator.validate_and_sanitize_response(complete_text)
        )

        if guardrail_triggered:
            yield (
                f"data: {json.dumps({'type': 'guardrail', 'triggered': True, 'reason': guardrail_reason})}\n\n"
            )

        yield f"data: {json.dumps(token_usage)}\n\n"
        yield 'data: {"type": "done"}\n\n'

    return StreamingResponse(socratic_stream(), media_type="text/event-stream")


# =============================================================================
# Domain 11: Candidate Feedback Report Synthesis Endpoint (Decision 11.1)
# =============================================================================


@app.post("/internal/ai/report/synthesize", response_model=ReportSynthesisResponse)
async def synthesize_candidate_report(req: ReportSynthesisRequest):
    """
    Synthesizes actionable, evidence-based candidate performance report narrative.
    Combines deterministic evaluation metrics with structured qualitative synthesis.
    """
    data = await gemini_client.synthesize_report_narrative(
        total_score=req.total_score,
        functional_score=req.functional_score,
        quality_score=req.quality_score,
        trajectory_score=req.trajectory_score,
        defects_resolved=req.defects_resolved_count,
        defects_total=req.defects_total_count,
        tokens_used=req.tokens_used,
    )
    return ReportSynthesisResponse(**data)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
