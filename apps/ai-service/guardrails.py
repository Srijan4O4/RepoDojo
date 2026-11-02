"""
RepoDojo Guardrail Validator
Enforces the 7-line code cap, secret scrubbing, and prompt injection defenses (Decision 8.3 & SEC-05).
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


SECRET_PATTERNS = [
    (re.compile(r"\bAIza[0-9A-Za-z-_]{30,45}\b"), "[REDACTED_GOOGLE_API_KEY]"),
    (re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}\b"), "[REDACTED_GITHUB_TOKEN]"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "[REDACTED_AWS_KEY]"),
    (
        re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
        "[REDACTED_JWT]",
    ),
    (
        re.compile(
            r"-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----"
        ),
        "[REDACTED_PRIVATE_KEY]",
    ),
    (re.compile(r"mongodb(?:\+srv)?:\/\/[^\s\"'`<>]+"), "[REDACTED_MONGODB_URI]"),
    (re.compile(r"(?:postgres|postgresql|mysql):\/\/[^\s\"'`<>]+"), "[REDACTED_DB_URI]"),
]


class GuardrailValidator:
    """Deterministic multi-layer guardrail for candidate prompts and LLM outputs."""

    @staticmethod
    def redact_secrets(text: str) -> tuple[str, int]:
        """
        Pre-inference secret scrubber (Decision 12.2).
        Detects API keys, tokens, and DB URIs, replacing them with typed placeholders.
        Returns (scrubbed_text, secrets_detected_count).
        """
        if not text:
            return text, 0

        scrubbed = text
        count = 0
        for pattern, placeholder in SECRET_PATTERNS:
            matches = pattern.findall(scrubbed)
            if matches:
                count += len(matches)
                scrubbed = pattern.sub(placeholder, scrubbed)

        return scrubbed, count

    @staticmethod
    def wrap_untrusted_content(tag: str, content: str | None, attr: str = "") -> str:
        """
        Wraps untrusted candidate text in explicit structural tags (Decision 12.2).
        Neutralizes indirect prompt injections by isolating passive data from instructions.
        """
        if not content:
            return ""
        attr_str = f" {attr}" if attr else ""
        return f"<{tag}{attr_str}>\n{content}\n</{tag}>"

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
        Enforces a hard limit of at most 7 lines of code total across ALL code blocks (Decision 8.3 & SEC-05).
        Truncates excessive code and appends a Socratic conceptual explanation.
        Handles unclosed fences and multi-block responses.
        """
        if not response_text:
            return response_text, False, None

        # Automatically normalize unclosed code fences
        normalized_text = response_text
        if normalized_text.count("```") % 2 != 0:
            normalized_text = normalized_text + "\n```"

        code_block_pattern = re.compile(r"```([a-zA-Z0-9_\-\+]*)\n([\s\S]*?)```")
        matches = list(code_block_pattern.finditer(normalized_text))

        if not matches:
            return normalized_text, False, None

        total_code_lines = 0
        for match in matches:
            code_content = match.group(2).strip()
            lines = [line for line in code_content.split("\n") if line.strip()]
            total_code_lines += len(lines)

        if total_code_lines <= 7:
            return normalized_text, False, None

        # Guardrail triggered: truncate code blocks so aggregate lines <= 7
        guardrail_triggered = True
        reason = "EXCEEDED_7_LINE_LIMIT"
        budget = 7

        def replace_block(match: re.Match) -> str:
            nonlocal budget
            lang = match.group(1) or ""
            code_content = match.group(2).strip()
            lines = [line for line in code_content.split("\n") if line.strip()]
            comment_prefix = "//" if lang in ["ts", "js", "cpp", "java", "go", "c", "rust"] else "#"

            if budget <= 0:
                # No budget remaining: truncate entire block
                return (
                    f"```{lang}\n"
                    f"{comment_prefix} [Truncated by RepoDojo Guardrail: Maximum 7-line code limit]\n"
                    f"```\n\n"
                    f"*Note: Full implementation details have been truncated to maintain assessment integrity. "
                    f"Consider how the remaining lines should handle edge cases or error states.*"
                )

            if len(lines) <= budget:
                budget -= len(lines)
                return match.group(0)

            # Block exceeds remaining budget: truncate to remaining budget
            truncated_code = "\n".join(lines[:budget])
            budget = 0
            return (
                f"```{lang}\n"
                f"{truncated_code}\n"
                f"{comment_prefix} [Truncated by RepoDojo Guardrail: Maximum 7-line code limit]\n"
                f"```\n\n"
                f"*Note: Full implementation details have been truncated to maintain assessment integrity. "
                f"Consider how the remaining lines should handle edge cases or error states.*"
            )

        sanitized_text = code_block_pattern.sub(replace_block, normalized_text)
        return sanitized_text, guardrail_triggered, reason
