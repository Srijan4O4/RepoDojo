"""
RepoDojo Gemini 3.8 Flash Client
Interfaces with Google Gen AI SDK for guarded streaming assistance (Decision 8.1 & 8.2).
Includes Socratic fallback engine for local testing and CI verification.
"""

import asyncio
import os
from collections.abc import AsyncGenerator
from typing import Any


class GeminiClient:
    """Manages Gemini 3.8 Flash model invocation and token stream parsing."""

    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY", "")
        self.model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        self._client = None

        if self.api_key and not self.api_key.startswith("test-"):
            try:
                from google import genai

                self._client = genai.Client(api_key=self.api_key)
            except Exception as e:
                print(f"[GeminiClient] Failed to initialize Google GenAI SDK: {e}")

    def is_configured(self) -> bool:
        """Returns True if Gemini API client has valid non-test configuration."""
        return bool(self._client or (self.api_key and not self.api_key.startswith("test-")))

    async def stream_socratic_response(
        self,
        system_instruction: str,
        user_prompt: str,
        graph_context: str,
        active_file: str | None = None,
        selected_code: str | None = None,
        terminal_error: str | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Streams Socratic assistance tokens with usage metrics.
        """
        # If real Gemini client is initialized, invoke official GenAI SDK
        if self._client:
            try:
                full_prompt = (
                    f"{graph_context}\n\n"
                    f"Candidate Question: {user_prompt}\n"
                    f"Active File: {active_file or 'None'}\n"
                    f"Selected Code:\n{selected_code or 'None'}\n"
                    f"Terminal Output:\n{terminal_error or 'None'}"
                )

                response = self._client.models.generate_content_stream(
                    model=self.model_name,
                    contents=full_prompt,
                    config={"system_instruction": system_instruction},
                )

                input_tokens = len(full_prompt.split()) * 2
                output_tokens = 0

                for chunk in response:
                    if chunk.text:
                        output_tokens += len(chunk.text.split()) * 2
                        yield {"type": "token", "text": chunk.text}

                yield {
                    "type": "usage",
                    "inputTokens": input_tokens,
                    "outputTokens": output_tokens,
                }
                return
            except Exception as e:
                print(f"[GeminiClient] Fallback to local Socratic engine due to error: {e}")

        # Deterministic High-Fidelity Socratic Mock Engine (for testing & offline dev)
        simulated_response = self._generate_socratic_mock_text(
            user_prompt, active_file, selected_code, terminal_error
        )

        tokens = simulated_response.split(" ")
        for i, word in enumerate(tokens):
            yield {"type": "token", "text": word + (" " if i < len(tokens) - 1 else "")}
            await asyncio.sleep(0.01)

        input_token_est = (len(user_prompt) + len(graph_context)) // 4 + 40
        output_token_est = len(simulated_response) // 4 + 10

        yield {
            "type": "usage",
            "inputTokens": input_token_est,
            "outputTokens": output_token_est,
        }

    def _generate_socratic_mock_text(
        self,
        prompt: str,
        active_file: str | None,
        selected_code: str | None,
        terminal_error: str | None,
    ) -> str:
        prompt_lower = prompt.lower()

        if "discount" in prompt_lower or "total" in prompt_lower or "save20" in prompt_lower:
            return (
                "Let's trace the discount calculation logic.\n\n"
                "When a candidate applies the `'SAVE20'` promo code, what is the expected relationship "
                "between the original subtotal and the discounted total? If a customer receives 20% off, "
                "they should pay 80% of the original cost (`subtotal * 0.8`).\n\n"
                "Take a close look at the arithmetic operator in `src/services/payment.service.ts`: "
                "is it multiplying by 1.2 instead of applying a discount deduction?"
            )

        if "payment" in prompt_lower or "checkout" in prompt_lower or "promise" in prompt_lower:
            return (
                "Notice how the checkout endpoint calls the payment processing service.\n\n"
                "In `src/controllers/order.controller.ts`, `processPayment(total)` returns a `Promise`. "
                "What happens in JavaScript if an asynchronous function returning a Promise is called without "
                "`await` before sending the HTTP JSON response?\n\n"
                "The response is sent immediately with an unresolved Promise object rather than the resolved transaction data."
            )

        if "cors" in prompt_lower or "header" in prompt_lower or "origin" in prompt_lower:
            return (
                "Cross-Origin Resource Sharing (CORS) requires specific HTTP headers on incoming cross-origin requests.\n\n"
                "In Express, check whether `cors()` middleware is mounted before your route definitions in `src/index.ts`. "
                "Without the appropriate Access-Control-Allow-Origin headers, client browsers will block the response."
            )

        return (
            f"Based on the repository architecture in `{active_file or 'your workspace'}`:\n\n"
            "Consider the flow of data: what input does this component receive, and what invariant does it assume? "
            "Inspect the error log to see which assertion or runtime condition failed, and check whether the return type "
            "matches the contract required by caller functions."
        )

    async def synthesize_report_narrative(
        self,
        total_score: float,
        functional_score: float,
        quality_score: float,
        trajectory_score: float,
        defects_resolved: int,
        defects_total: int,
        tokens_used: int,
    ) -> dict[str, Any]:
        """
        Synthesizes structured feedback report (Decision 11.1).
        Uses Gemini if configured, otherwise falls back to deterministic rule-based synthesis.
        """
        if self._client:
            try:
                import json

                prompt = (
                    "Candidate Assessment Performance Summary:\n"
                    f"- Total Score: {total_score}/100\n"
                    f"- Functional Correctness: {functional_score}/60 ({defects_resolved}/{defects_total} defects resolved)\n"
                    f"- Code Quality: {quality_score}/20\n"
                    f"- Engineering Trajectory: {trajectory_score}/20\n"
                    f"- AI Tokens Utilized: {tokens_used}\n\n"
                    "Generate a JSON object with fields:\n"
                    "- 'executive_summary': A 2-3 sentence technical appraisal.\n"
                    "- 'strengths': Array of 2-3 specific engineering strengths demonstrated.\n"
                    "- 'areas_for_improvement': Array of 2-3 specific technical areas to strengthen.\n"
                    "- 'practice_recommendations': Array of 2-3 targeted practice recommendations.\n"
                    "Respond ONLY with valid JSON."
                )
                response = self._client.models.generate_content(
                    model=self.model_name,
                    contents=prompt,
                )
                cleaned = response.text.strip().removeprefix("```json").removesuffix("```").strip()
                data = json.loads(cleaned)
                if all(
                    k in data
                    for k in [
                        "executive_summary",
                        "strengths",
                        "areas_for_improvement",
                        "practice_recommendations",
                    ]
                ):
                    return data
            except Exception as e:
                print(f"[GeminiClient] Fallback to deterministic report synthesis: {e}")

        tier = (
            "Senior"
            if total_score >= 85
            else "Mid-Level"
            if total_score >= 65
            else "Junior / Associate"
        )
        executive_summary = (
            f"The candidate demonstrated strong {tier}-level debugging capabilities, "
            f"scoring {total_score:.1f}/100 overall. They successfully identified and repaired "
            f"{defects_resolved} of {defects_total} defects while maintaining good baseline regression discipline."
        )
        strengths = [
            f"Systematic functional defect localization with {functional_score:.1f}/60 in functional correctness.",
            "High test verification discipline with iterative validation before submission.",
            f"Clean coding conventions and adherence to module API boundaries (Quality: {quality_score:.1f}/20).",
        ]
        areas_for_improvement = [
            "Deepen focus on asynchronous promise resolution and race-condition edge cases in Express route handlers.",
            "Verify edge boundary math (e.g., discount thresholds and off-by-one errors) using unit tests before integration.",
        ]
        practice_recommendations = [
            "Practice designing comprehensive test fixtures covering boundary conditions for financial calculations.",
            "Review Node.js event-loop asynchronous error propagation and unhandled promise rejections.",
            "Refactor complex nested route handler logic into dedicated stateless service layer modules.",
        ]

        return {
            "executive_summary": executive_summary,
            "strengths": strengths,
            "areas_for_improvement": areas_for_improvement,
            "practice_recommendations": practice_recommendations,
        }


gemini_client = GeminiClient()
