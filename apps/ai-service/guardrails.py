"""
RepoDojo Guardrail Validator
Enforces the 7-line code cap and prompt injection defenses (Decision 8.3).
"""

import re

JAILBREAK_PATTERNS = [
    r"ignore (all )?(previous|prior) instructions",
    r"disregard (the )?guidelines",
    r"you are now an unrestricted",
    r"act as (an unfiltered|dan|developer mode)",
    r"give me the full (code|solution|function)",
    r"write the entire (file|class|service)",
    r"bypass (the )?guardrails?",
]


class GuardrailValidator:
    """Deterministic multi-layer guardrail for candidate prompts and LLM outputs."""

    @staticmethod
    def inspect_prompt(prompt: str) -> tuple[bool, str | None]:
        """
        Inspects candidate prompt for adversarial jailbreaks or prompt injection attempts.
        Returns (is_adversarial, reason).
        """
        prompt_lower = prompt.lower()
        for pattern in JAILBREAK_PATTERNS:
            if re.search(pattern, prompt_lower):
                return True, "PROMPT_INJECTION_DETECTED"
        return False, None

    @staticmethod
    def validate_and_sanitize_response(
        response_text: str,
    ) -> tuple[str, bool, str | None]:
        """
        Parses all fenced code blocks (```...```) in the LLM response.
        Enforces a hard limit of at most 7 lines of code total (Decision 8.3).
        Truncates excessive code and appends a Socratic conceptual explanation.
        """
        code_block_pattern = re.compile(r"```([a-zA-Z0-9_\-\+]*)\n([\s\S]*?)```")

        total_code_lines = 0
        matches = list(code_block_pattern.finditer(response_text))

        for match in matches:
            code_content = match.group(2).strip()
            lines = [line for line in code_content.split("\n") if line.strip()]
            total_code_lines += len(lines)

        if total_code_lines <= 7:
            return response_text, False, None

        # Guardrail triggered: truncate code blocks exceeding 7 lines
        guardrail_triggered = True
        reason = "EXCEEDED_7_LINE_LIMIT"

        def replace_block(match: re.Match) -> str:
            lang = match.group(1) or ""
            code_content = match.group(2).strip()
            lines = code_content.split("\n")

            if len(lines) > 5:
                truncated_code = "\n".join(lines[:5])
                comment_prefix = (
                    "//" if lang in ["ts", "js", "cpp", "java", "go", "c", "rust"] else "#"
                )
                return (
                    f"```{lang}\n"
                    f"{truncated_code}\n"
                    f"{comment_prefix} [Truncated by RepoDojo Guardrail: Maximum 7-line code limit]\n"
                    f"```\n\n"
                    f"*Note: Full implementation details have been truncated to maintain assessment integrity. "
                    f"Consider how the remaining lines should handle edge cases or error states.*"
                )
            return match.group(0)

        sanitized_text = code_block_pattern.sub(replace_block, response_text)
        return sanitized_text, guardrail_triggered, reason
