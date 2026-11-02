"""
RepoDojo AI Service
FastAPI application for AI orchestration, Graphify context retrieval, and guarded Gemini assistance.
Master Architecture: ADR-001 Domain 8 & Domain 9
"""

import json
import os
import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, status
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
# Service-to-Service Authentication Dependency (SEC-03)
# =============================================================================


async def verify_service_auth(
    x_internal_service_key: str | None = Header(None, alias="X-Internal-Service-Key"),
):
    expected_key = os.environ.get("INTERNAL_SERVICE_KEY", "dev-internal-service-key-repodojo")
    if not x_internal_service_key or x_internal_service_key != expected_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Missing or invalid X-Internal-Service-Key.",
        )
    return x_internal_service_key


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
    gemini_ready = gemini_client.is_configured()
    is_prod = os.environ.get("NODE_ENV") == "production" or os.environ.get("ENV") == "production"
    is_ready = gemini_ready or not is_prod
    return {
        "status": "healthy" if is_ready else "degraded",
        "service": "repodojo-ai-service",
        "version": "0.4.0",
        "uptime_seconds": int(time.time() - START_TIME),
        "dependencies": {
            "gemini_api": {"status": "configured" if gemini_ready else "unconfigured"},
            "graphify_cache": {"status": "ready"},
        },
    }


# =============================================================================
# Domain 9: Graphify Precomputation & Management (Authenticated)
# =============================================================================


@app.post("/internal/graphify/load", dependencies=[Depends(verify_service_auth)])
async def load_graphify_artifact(req: GraphifyLoadRequest):
    """Loads precomputed Graphify AST into memory (Decision 9.1)."""
    node_count = graphify_engine.load_challenge_graph(req.challenge_id, req.graph_data)
    return {
        "status": "success",
        "challenge_id": req.challenge_id,
        "nodesLoaded": node_count,
    }


@app.get("/internal/graphify/context", dependencies=[Depends(verify_service_auth)])
async def get_graphify_context(challenge_id: str, query: str, active_file: str | None = None):
    """Retrieves 1-2 degree AST graph context for a query."""
    nodes = graphify_engine.query_relevant_nodes(challenge_id, query, active_file)
    context_md = graphify_engine.format_graph_context_for_prompt(challenge_id, query, active_file)
    return {
        "nodes": nodes,
        "contextMarkdown": context_md,
    }


# =============================================================================
# Domain 8: Guarded AI Assistant SSE Endpoint (Authenticated & Stream-Sanitized)
# =============================================================================


@app.post(
    "/internal/ai/chat/stream",
    dependencies=[Depends(verify_service_auth)],
)
async def stream_ai_chat(request: ChatRequest):
    """
    Guarded AI stream endpoint invoked by Express Gateway.
    Enforces real-time 7-LOC streaming cap (SEC-05) and Socratic guardrails (Decision 8.1 & 8.3).
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

    # 2. Scrub credentials & secrets before inference (Decision 12.2)
    sanitized_prompt, _ = GuardrailValidator.redact_secrets(request.prompt)
    sanitized_code, _ = (
        GuardrailValidator.redact_secrets(request.selected_code)
        if request.selected_code
        else (None, 0)
    )
    sanitized_error, _ = (
        GuardrailValidator.redact_secrets(request.terminal_error)
        if request.terminal_error
        else (None, 0)
    )

    # 3. Retrieve Graphify AST Context (Decision 9.2)
    graph_context = graphify_engine.format_graph_context_for_prompt(
        challenge_id=request.challenge_id,
        query_text=sanitized_prompt,
        active_file=request.active_file,
    )

    # 4. Build Socratic System Prompt (Decision 8.1 & 8.3)
    system_instruction = build_system_instruction(request.assistance_level)

    # 5. Stream Socratic response with real-time 7-line code guardrail enforcement
    async def socratic_stream() -> AsyncGenerator[str, None]:
        token_usage = {"inputTokens": 0, "outputTokens": 0}
        in_code_block = False
        code_lines_emitted = 0
        guardrail_triggered = False
        suppressing_code = False
        line_buffer = ""

        async for chunk in gemini_client.stream_socratic_response(
            system_instruction=system_instruction,
            user_prompt=sanitized_prompt,
            graph_context=graph_context,
            active_file=request.active_file,
            selected_code=sanitized_code,
            terminal_error=sanitized_error,
        ):
            if chunk["type"] == "token":
                text = chunk["text"]
                for char in text:
                    line_buffer += char
                    if char == "\n":
                        # Process completed line
                        stripped = line_buffer.strip()
                        if stripped.startswith("```"):
                            if not in_code_block:
                                in_code_block = True
                                suppressing_code = False
                                yield f"data: {json.dumps({'type': 'token', 'text': line_buffer})}\n\n"
                            else:
                                in_code_block = False
                                if not suppressing_code:
                                    yield f"data: {json.dumps({'type': 'token', 'text': line_buffer})}\n\n"
                        elif in_code_block:
                            if stripped:
                                if code_lines_emitted < 7:
                                    code_lines_emitted += 1
                                    yield f"data: {json.dumps({'type': 'token', 'text': line_buffer})}\n\n"
                                else:
                                    if not suppressing_code:
                                        suppressing_code = True
                                        guardrail_triggered = True
                                        truncation_msg = (
                                            "\n// [Truncated by RepoDojo Guardrail: Maximum 7-line code limit]\n```\n\n"
                                            "*Note: Full implementation details have been truncated to maintain assessment integrity. "
                                            "Consider how the remaining lines should handle edge cases or error states.*\n"
                                        )
                                        yield f"data: {json.dumps({'type': 'token', 'text': truncation_msg})}\n\n"
                                        yield f"data: {json.dumps({'type': 'guardrail', 'triggered': True, 'reason': 'EXCEEDED_7_LINE_LIMIT'})}\n\n"
                            else:
                                if not suppressing_code:
                                    yield f"data: {json.dumps({'type': 'token', 'text': line_buffer})}\n\n"
                        else:
                            yield f"data: {json.dumps({'type': 'token', 'text': line_buffer})}\n\n"
                        line_buffer = ""

            elif chunk["type"] == "usage":
                token_usage = chunk

        # Flush any remaining buffer text
        if line_buffer:
            if not suppressing_code:
                yield f"data: {json.dumps({'type': 'token', 'text': line_buffer})}\n\n"
            if in_code_block and not suppressing_code:
                yield f"data: {json.dumps({'type': 'token', 'text': '\\n```\\n'})}\n\n"

        if guardrail_triggered:
            yield (
                f"data: {json.dumps({'type': 'guardrail', 'triggered': True, 'reason': 'EXCEEDED_7_LINE_LIMIT'})}\n\n"
            )

        yield f"data: {json.dumps(token_usage)}\n\n"
        yield 'data: {"type": "done"}\n\n'

    return StreamingResponse(socratic_stream(), media_type="text/event-stream")


# =============================================================================
# Domain 11: Candidate Feedback Report Synthesis Endpoint (Authenticated)
# =============================================================================


@app.post(
    "/internal/ai/report/synthesize",
    response_model=ReportSynthesisResponse,
    dependencies=[Depends(verify_service_auth)],
)
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
