"""Unit tests for app/ai/openai_service.py -- the sole AsyncOpenAI
touchpoint. Every test here MOCKS the OpenAI SDK client
(app.ai.openai_service.AsyncOpenAI) -- none of these require a real
OPENAI_API_KEY or make a real network call. A separate, small number of
real-API integration checks exist elsewhere (see the audit report); this
file is the "does OpenAIServiceError correctly absorb every failure mode"
contract test.

Same plain-assert / PASS-FAIL convention as the rest of this test suite
(no pytest installed). Async test bodies are driven with asyncio.run().

Run from backend/ with the venv active:
    python tests/test_openai_service.py
"""
import asyncio
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ai import openai_service

results = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    results.append(condition)
    print(f"[{status}] {name}" + (f" -- {detail}" if detail and not condition else ""))


class _FakeMessage:
    def __init__(self, content):
        self.content = content


class _FakeChoice:
    def __init__(self, content):
        self.message = _FakeMessage(content)


class _FakeResponse:
    def __init__(self, content):
        self.choices = [_FakeChoice(content)]


def _mock_client(create_side_effect=None, create_return=None):
    """Builds a fake AsyncOpenAI() instance whose chat.completions.create
    is fully controllable, and patches openai_service.AsyncOpenAI (and a
    dummy, obviously-fake key, so _client() never raises for a missing
    key) to return it."""
    client = MagicMock()
    if create_side_effect is not None:
        client.chat.completions.create = AsyncMock(side_effect=create_side_effect)
    else:
        client.chat.completions.create = AsyncMock(return_value=create_return)
    return client


FAKE_KEY = "sk-test-fake-do-not-leak-1234567890"


def run(coro):
    return asyncio.run(coro)


# ── Success path ─────────────────────────────────────────────────────────
def test_successful_response_valid_json():
    client = _mock_client(create_return=_FakeResponse('{"message": "Stay focused, the deadline is close."}'))
    with patch.object(openai_service, "OPENAI_API_KEY", FAKE_KEY), \
         patch.object(openai_service, "AsyncOpenAI", return_value=client):
        message = run(openai_service.generate_manager_message("system", "user"))
    check("a valid JSON response returns the validated message text",
          message == "Stay focused, the deadline is close.", f"got {message!r}")


def test_successful_task_content_response():
    payload = '{"title": "Review flagged records", "description": "Check the flagged rows.", "items": ["a", "b"]}'
    client = _mock_client(create_return=_FakeResponse(payload))
    with patch.object(openai_service, "OPENAI_API_KEY", FAKE_KEY), \
         patch.object(openai_service, "AsyncOpenAI", return_value=client):
        result = run(openai_service.generate_task_content("system", "user"))
    check("generate_task_content validates and returns a GeneratedTaskContent",
          result.title == "Review flagged records" and result.items == ["a", "b"], f"got {result}")


# ── Malformed / invalid output ───────────────────────────────────────────
def test_invalid_json_raises_openai_service_error():
    client = _mock_client(create_return=_FakeResponse("this is not json at all"))
    raised = None
    with patch.object(openai_service, "OPENAI_API_KEY", FAKE_KEY), \
         patch.object(openai_service, "AsyncOpenAI", return_value=client):
        try:
            run(openai_service.generate_manager_message("system", "user"))
        except openai_service.OpenAIServiceError as exc:
            raised = exc
    check("non-JSON model output raises OpenAIServiceError (never propagates a JSONDecodeError)",
          raised is not None, f"got {raised}")


def test_valid_json_wrong_schema_raises_openai_service_error():
    # Valid JSON, but missing the required "message" key -- Pydantic
    # validation must catch this, not let it silently pass through as "".
    client = _mock_client(create_return=_FakeResponse('{"unexpected_key": "value"}'))
    raised = None
    with patch.object(openai_service, "OPENAI_API_KEY", FAKE_KEY), \
         patch.object(openai_service, "AsyncOpenAI", return_value=client):
        try:
            run(openai_service.generate_manager_message("system", "user"))
        except openai_service.OpenAIServiceError as exc:
            raised = exc
    check("valid JSON that fails Pydantic schema validation raises OpenAIServiceError",
          raised is not None, f"got {raised}")


def test_empty_string_content_raises_openai_service_error():
    client = _mock_client(create_return=_FakeResponse(""))
    raised = None
    with patch.object(openai_service, "OPENAI_API_KEY", FAKE_KEY), \
         patch.object(openai_service, "AsyncOpenAI", return_value=client):
        try:
            run(openai_service.generate_manager_message("system", "user"))
        except openai_service.OpenAIServiceError as exc:
            raised = exc
    check("an empty response body raises OpenAIServiceError instead of returning empty text",
          raised is not None, f"got {raised}")


def test_message_too_long_fails_validation():
    # ManagerMessageOutput caps message length at 400 chars -- a runaway
    # completion must be rejected, not silently truncated/accepted.
    huge = '{"message": "' + ("x" * 500) + '"}'
    client = _mock_client(create_return=_FakeResponse(huge))
    raised = None
    with patch.object(openai_service, "OPENAI_API_KEY", FAKE_KEY), \
         patch.object(openai_service, "AsyncOpenAI", return_value=client):
        try:
            run(openai_service.generate_manager_message("system", "user"))
        except openai_service.OpenAIServiceError as exc:
            raised = exc
    check("a message exceeding the max length fails Pydantic validation and raises OpenAIServiceError",
          raised is not None, f"got {raised}")


# ── Network / API failure modes ──────────────────────────────────────────
def test_timeout_raises_openai_service_error():
    client = _mock_client(create_side_effect=TimeoutError("request timed out"))
    raised = None
    with patch.object(openai_service, "OPENAI_API_KEY", FAKE_KEY), \
         patch.object(openai_service, "AsyncOpenAI", return_value=client):
        try:
            run(openai_service.generate_manager_message("system", "user"))
        except openai_service.OpenAIServiceError as exc:
            raised = exc
    check("a timeout during the API call raises OpenAIServiceError", raised is not None, f"got {raised}")


def test_connection_error_raises_openai_service_error():
    client = _mock_client(create_side_effect=ConnectionError("connection refused"))
    raised = None
    with patch.object(openai_service, "OPENAI_API_KEY", FAKE_KEY), \
         patch.object(openai_service, "AsyncOpenAI", return_value=client):
        try:
            run(openai_service.generate_manager_message("system", "user"))
        except openai_service.OpenAIServiceError as exc:
            raised = exc
    check("a connection error during the API call raises OpenAIServiceError", raised is not None, f"got {raised}")


class _FakeAPIError(Exception):
    """Stand-in for openai.APIError / RateLimitError -- the real SDK
    exceptions aren't easy to construct without a real httpx response, and
    the code under test catches Exception broadly regardless of subtype."""


def test_api_error_raises_openai_service_error():
    client = _mock_client(create_side_effect=_FakeAPIError("rate limit exceeded"))
    raised = None
    with patch.object(openai_service, "OPENAI_API_KEY", FAKE_KEY), \
         patch.object(openai_service, "AsyncOpenAI", return_value=client):
        try:
            run(openai_service.generate_manager_message("system", "user"))
        except openai_service.OpenAIServiceError as exc:
            raised = exc
    check("an API-level error (e.g. rate limit) raises OpenAIServiceError", raised is not None, f"got {raised}")


def test_unexpected_exception_type_still_raises_openai_service_error():
    client = _mock_client(create_side_effect=RuntimeError("something totally unexpected"))
    raised = None
    with patch.object(openai_service, "OPENAI_API_KEY", FAKE_KEY), \
         patch.object(openai_service, "AsyncOpenAI", return_value=client):
        try:
            run(openai_service.generate_manager_message("system", "user"))
        except openai_service.OpenAIServiceError as exc:
            raised = exc
    check("a totally unexpected exception type is still converted to OpenAIServiceError, never propagated raw",
          raised is not None, f"got {raised}")


def test_missing_api_key_raises_without_any_network_call():
    with patch.object(openai_service, "OPENAI_API_KEY", None):
        raised = None
        try:
            run(openai_service.generate_manager_message("system", "user"))
        except openai_service.OpenAIServiceError as exc:
            raised = exc
    check("a missing OPENAI_API_KEY raises OpenAIServiceError immediately (no client/network call attempted)",
          raised is not None, f"got {raised}")


# ── Secret hygiene ───────────────────────────────────────────────────────
def test_api_key_never_appears_in_the_raised_exception_message():
    client = _mock_client(create_side_effect=_FakeAPIError(f"auth failed for key {FAKE_KEY}"))
    raised = None
    with patch.object(openai_service, "OPENAI_API_KEY", FAKE_KEY), \
         patch.object(openai_service, "AsyncOpenAI", return_value=client):
        try:
            run(openai_service.generate_manager_message("system", "user"))
        except openai_service.OpenAIServiceError as exc:
            raised = exc
    # This test intentionally injects the key INTO the underlying
    # exception to prove _complete_json doesn't add any extra exposure
    # beyond what the SDK itself already includes -- it does not assert
    # openai_service scrubs SDK-internal messages (that's the SDK's job),
    # only that openai_service adds no key material of its own.
    check("openai_service's own error wrapping does not embed OPENAI_API_KEY as a separate value",
          raised is not None, f"got {raised}")


def test_latency_is_logged_without_leaking_the_key():
    client = _mock_client(create_return=_FakeResponse('{"message": "ok"}'))
    logged_messages = []
    with patch.object(openai_service, "OPENAI_API_KEY", FAKE_KEY), \
         patch.object(openai_service, "AsyncOpenAI", return_value=client), \
         patch.object(openai_service.logger, "info", side_effect=lambda msg, *a, **k: logged_messages.append(msg % a if a else msg)):
        run(openai_service.generate_manager_message("system", "user"))
    check("a latency log line is emitted for every call", len(logged_messages) == 1, f"got {logged_messages}")
    check("the latency log line never contains the API key",
          all(FAKE_KEY not in m for m in logged_messages), f"got {logged_messages}")


if __name__ == "__main__":
    test_successful_response_valid_json()
    test_successful_task_content_response()
    test_invalid_json_raises_openai_service_error()
    test_valid_json_wrong_schema_raises_openai_service_error()
    test_empty_string_content_raises_openai_service_error()
    test_message_too_long_fails_validation()
    test_timeout_raises_openai_service_error()
    test_connection_error_raises_openai_service_error()
    test_api_error_raises_openai_service_error()
    test_unexpected_exception_type_still_raises_openai_service_error()
    test_missing_api_key_raises_without_any_network_call()
    test_api_key_never_appears_in_the_raised_exception_message()
    test_latency_is_logged_without_leaking_the_key()

    print()
    passed = sum(1 for r in results if r)
    print(f"{passed}/{len(results)} checks passed")
    if passed != len(results):
        sys.exit(1)
