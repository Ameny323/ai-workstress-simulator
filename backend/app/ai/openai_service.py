"""OpenAIService -- the ONLY place in the codebase that talks to OpenAI
(spec section 26-30). Centralized, async (AsyncOpenAI, since FastAPI/the
event loop this runs on is async), strict timeout, model from the
OPENAI_MODEL env var (never hardcoded), key from OPENAI_API_KEY.

Hard rule this module exists to enforce: the LLM only ever generates
WORDING. Every method here takes an already-fully-decided situation
(tone, trigger, facts, task template, metrics) rendered into a prompt by
app/ai/prompt_builder.py, and returns short natural-language text or a
small Pydantic-validated structure -- never a number, a state, or a
decision this service invents itself. "Never trust arbitrary model
output" (spec, verbatim): every response is parsed through a Pydantic
model; a response that doesn't validate is treated exactly like a timeout
or a network error -- the caller falls back to a deterministic template.

Never raises past its own boundary in a way that could stall the caller:
every public method either returns a valid result or raises
OpenAIServiceError, always within OPENAI_REQUEST_TIMEOUT_SECONDS, so a
task timer or a request handler is never left waiting on OpenAI.
"""
import json
import logging
import time
from typing import Optional, Type, TypeVar

from openai import AsyncOpenAI
from pydantic import BaseModel, Field, ValidationError

from app.core.aria_config import OPENAI_MAX_RESPONSE_TOKENS, OPENAI_REQUEST_TIMEOUT_SECONDS
from app.core.config import OPENAI_API_KEY, OPENAI_MODEL

logger = logging.getLogger(__name__)

TModel = TypeVar("TModel", bound=BaseModel)


class OpenAIServiceError(Exception):
    """Raised for ANY failure mode -- missing key, timeout, rate limit,
    connection error, malformed/non-JSON response, or a response that
    fails Pydantic validation. Callers treat all of these identically:
    fall back to a deterministic template, never propagate upward."""


class ManagerMessageOutput(BaseModel):
    """Structured output for generate_manager_message/generate_reminder.
    Only ever carries wording -- tone/trigger/state are already decided
    upstream and are NOT part of what the model is asked to produce."""
    message: str = Field(min_length=1, max_length=400)


class GeneratedTaskContent(BaseModel):
    """Structured output for controlled task-content generation (section
    25) -- title/body/narrative text only. Any field a deterministic
    evaluator needs (expected priority, correctness) is computed
    separately by that evaluator, never taken from this model."""
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=4000)
    items: list = Field(default_factory=list)


class DebriefNarrative(BaseModel):
    """Structured output for the end-of-session debrief (section 39) --
    natural-language summary text only. All the factual fields
    (key_metrics, aria_exposure, performance-under-pressure numbers) are
    computed by the existing deterministic reporting pipeline
    (app/reports/*) and merged in afterward, never generated here."""
    performance_summary: str = Field(min_length=1, max_length=1500)
    behavioral_observations: str = Field(min_length=1, max_length=1500)
    pressure_response: str = Field(min_length=1, max_length=1500)
    recommendations: list = Field(default_factory=list)


def _client(timeout: Optional[float] = None) -> AsyncOpenAI:
    if not OPENAI_API_KEY:
        raise OpenAIServiceError("OPENAI_API_KEY is not configured")
    return AsyncOpenAI(api_key=OPENAI_API_KEY, timeout=timeout or OPENAI_REQUEST_TIMEOUT_SECONDS, max_retries=0)


async def _complete_json(
    system_prompt: str,
    user_prompt: str,
    schema: Type[TModel],
    max_tokens: Optional[int] = None,
    timeout: Optional[float] = None,
) -> TModel:
    """Shared core: one JSON-mode chat completion, strictly timed out,
    parsed and validated against `schema`. Any failure at any step raises
    OpenAIServiceError -- callers never need to distinguish timeout vs.
    malformed JSON vs. a schema mismatch, they all mean the same thing:
    fall back.

    `max_tokens`/`timeout` default to OPENAI_MAX_RESPONSE_TOKENS /
    OPENAI_REQUEST_TIMEOUT_SECONDS (both tuned for a single short ARIA
    sentence) -- callers generating substantially larger structured
    content (e.g. app/ai/task_generation.py's multi-email/multi-document
    payloads) must pass explicit larger values, or the response can be
    truncated mid-JSON (a confusing "malformed output" failure rather than
    a clean token-budget one) or time out well before a longer completion
    would otherwise have finished.
    """
    client = _client(timeout=timeout)
    started = time.monotonic()
    try:
        response = await client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=max_tokens or OPENAI_MAX_RESPONSE_TOKENS,
            response_format={"type": "json_object"},
        )
    except Exception as exc:
        # Intentionally broad -- auth errors, timeouts, rate limits, and
        # network errors must all collapse to the same fallback path.
        raise OpenAIServiceError(f"OpenAI request failed: {exc}") from exc
    finally:
        latency_ms = round((time.monotonic() - started) * 1000, 1)
        logger.info(
            "openai_call model=%s latency_ms=%s",
            OPENAI_MODEL, latency_ms,
        )

    raw = (response.choices[0].message.content or "").strip()
    try:
        parsed = json.loads(raw)
        return schema.model_validate(parsed)
    except (json.JSONDecodeError, ValidationError) as exc:
        raise OpenAIServiceError(f"Model output failed validation: {exc}") from exc


async def generate_manager_message(system_prompt: str, user_prompt: str) -> str:
    """Returns validated message text, or raises OpenAIServiceError."""
    schema_instruction = (
        '\n\nRespond with ONLY a JSON object of the exact shape {"message": "<your one-to-three '
        'sentence message>"}. No other keys, no markdown fencing.'
    )
    result = await _complete_json(system_prompt, user_prompt + schema_instruction, ManagerMessageOutput)
    return result.message.strip()


async def generate_reminder(system_prompt: str, user_prompt: str) -> str:
    """Same shape as generate_manager_message -- the backend has already
    decided a reminder is appropriate (see aria_policy/simulation_fsm);
    this only phrases it."""
    return await generate_manager_message(system_prompt, user_prompt)


async def generate_task_content(system_prompt: str, user_prompt: str) -> GeneratedTaskContent:
    schema_instruction = (
        '\n\nRespond with ONLY a JSON object of the exact shape '
        '{"title": "...", "description": "...", "items": [...]}. No other keys, no markdown fencing.'
    )
    return await _complete_json(system_prompt, user_prompt + schema_instruction, GeneratedTaskContent)


async def generate_structured(
    system_prompt: str,
    user_prompt: str,
    schema: Type[TModel],
    max_tokens: Optional[int] = None,
    timeout: Optional[float] = None,
) -> TModel:
    """Generic structured-generation entry point for callers with their own
    Pydantic schema (e.g. app/ai/task_generation.py's controlled
    task-instance content generation) -- a thin public wrapper around the
    exact same _complete_json core every generate_* function above already
    uses. Keeps this module the sole AsyncOpenAI access point without
    hardcoding every possible schema shape here; error handling and secret
    hygiene are unchanged. `max_tokens`/`timeout` let a caller generating
    substantially more content than a single ARIA sentence avoid silent
    truncation or a too-tight deadline -- see _complete_json's own
    docstring.
    """
    return await _complete_json(system_prompt, user_prompt, schema, max_tokens=max_tokens, timeout=timeout)


async def generate_debrief(system_prompt: str, user_prompt: str) -> DebriefNarrative:
    schema_instruction = (
        '\n\nRespond with ONLY a JSON object of the exact shape {"performance_summary": "...", '
        '"behavioral_observations": "...", "pressure_response": "...", "recommendations": ["...", ...]}. '
        "No other keys, no markdown fencing."
    )
    return await _complete_json(system_prompt, user_prompt + schema_instruction, DebriefNarrative)
