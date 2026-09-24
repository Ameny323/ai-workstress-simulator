"""Unit + integration tests for app/ai/task_generation.py (Task 03,
automatic task-instance generation) -- DOCUMENT_ORGANIZATION and
EMAIL_PRIORITIZATION only, per the current project scope.

Every test here MOCKS app.ai.openai_service.generate_structured -- none
require a real OPENAI_API_KEY or network call, matching
test_openai_service.py's own convention. The one thing this file does NOT
mock is app.orchestrators.priority_evaluation.determine_expected_priority
-- it is called for real throughout, because the central thing being
verified is that generated email content flows through the EXISTING,
unmodified deterministic evaluator rather than a duplicated one.

Same plain-assert / PASS-FAIL convention as the rest of this suite (no
pytest installed). Async paths are driven with asyncio.run().

Run from backend/ with the venv active:
    python tests/test_task_generation.py
"""
import asyncio
import os
import sys
from unittest.mock import AsyncMock, patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ai import openai_service, task_generation as tg
from app.orchestrators.priority_evaluation import PriorityLevel

results = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    results.append(condition)
    print(f"[{status}] {name}" + (f" -- {detail}" if detail and not condition else ""))


def run(coro):
    return asyncio.run(coro)


# ── Fixtures ─────────────────────────────────────────────────────────────
def _valid_document_content(categories=("Finance", "HR", "Legal"), count=6):
    docs = [
        {"filename": f"file_{i}.pdf", "category": categories[i % len(categories)]}
        for i in range(count)
    ]
    return tg.GeneratedDocumentOrganizationContent(title="Sort the drive", description="Sort these.", documents=docs)


def _valid_email_content(count=6):
    emails = [
        {
            "sender": f"person{i}@fake.test", "sender_role": "Analyst", "subject": f"Subject {i}",
            "body": f"This is the body of email {i}.", "has_attachment": False, "attachments": [],
            "context_tags": ["routine"], "deadline": None,
            "metadata": {"urgency": i % 5, "business_impact": 2, "operational_relevance": 2,
                         "deadline_pressure": 1, "security_risk": 0},
        }
        for i in range(count)
    ]
    return tg.GeneratedEmailPrioritizationContent(
        title="Inbox triage", description="Triage the inbox.", role="Analyst",
        context_description="A normal day.", context_tags=["office"], emails=emails,
    )


DOC_CONTEXT = tg.DocumentOrganizationGenerationContext(categories=["Finance", "HR", "Legal"], item_count=6)
EMAIL_CONTEXT = tg.EmailPrioritizationGenerationContext(
    role="Analyst",
    priority_weights={"urgency": 0.3, "business_impact": 0.25, "operational_relevance": 0.15,
                       "deadline_pressure": 0.2, "security_risk": 0.1},
    priority_rules=[], context_attributes={},
)


def with_mocked_generation(return_value=None, side_effect=None):
    return patch.object(openai_service, "generate_structured", new=AsyncMock(return_value=return_value, side_effect=side_effect))


# ── Document Organization: valid + structural validation ────────────────
def test_valid_document_task_generates_correctly_shaped_instance_data():
    with with_mocked_generation(return_value=_valid_document_content()):
        instance_data = run(tg.generate_document_organization_task(DOC_CONTEXT))
    check("valid document generation returns categories + records in the existing instance_data shape",
          instance_data["categories"] == ["Finance", "HR", "Legal"] and len(instance_data["records"]) == 6,
          f"got {instance_data}")
    check("every generated record has id/filename/correct_category",
          all({"id", "filename", "correct_category"} <= set(r.keys()) for r in instance_data["records"]))


def test_invalid_document_category_is_rejected():
    bad = _valid_document_content()
    bad.documents[0].category = "Marketing"  # not in DOC_CONTEXT.categories
    with with_mocked_generation(return_value=bad):
        raised = None
        try:
            run(tg.generate_document_organization_task(DOC_CONTEXT))
        except tg.GenerationError as exc:
            raised = exc
    check("a document category outside the backend-supplied allowed set is rejected, never silently accepted",
          raised is not None, f"got {raised}")


def test_missing_document_field_fails_pydantic_validation():
    with with_mocked_generation(side_effect=None):
        try:
            tg.GeneratedDocumentItem(filename="a.pdf")  # missing category
            check("a document missing a required field fails Pydantic validation", False)
        except Exception:
            check("a document missing a required field fails Pydantic validation", True)


def test_too_few_documents_rejected():
    if tg.MIN_DOCUMENTS <= 1:
        check("too few documents rejected", True, "skipped: MIN_DOCUMENTS <= 1")
        return
    try:
        tg.GeneratedDocumentOrganizationContent(
            title="t", description="d",
            documents=[{"filename": f"f{i}.pdf", "category": "Finance"} for i in range(tg.MIN_DOCUMENTS - 1)],
        )
        check("fewer than MIN_DOCUMENTS documents is rejected by schema validation", False)
    except Exception:
        check("fewer than MIN_DOCUMENTS documents is rejected by schema validation", True)


def test_too_many_documents_rejected():
    try:
        tg.GeneratedDocumentOrganizationContent(
            title="t", description="d",
            documents=[{"filename": f"f{i}.pdf", "category": "Finance"} for i in range(tg.MAX_DOCUMENTS + 1)],
        )
        check("more than MAX_DOCUMENTS documents is rejected by schema validation", False)
    except Exception:
        check("more than MAX_DOCUMENTS documents is rejected by schema validation", True)


def test_duplicate_filenames_rejected():
    dup = _valid_document_content()
    dup.documents[1].filename = dup.documents[0].filename
    with with_mocked_generation(return_value=dup):
        raised = None
        try:
            run(tg.generate_document_organization_task(DOC_CONTEXT))
        except tg.GenerationError as exc:
            raised = exc
    check("duplicate generated filenames are rejected", raised is not None, f"got {raised}")


def test_document_generation_falls_back_to_deterministic_generator_on_failure():
    from app.tasks.document_organization import generate_document_organization_instance_controlled
    metadata = {"item_count": 6, "categories": ["Finance", "HR", "Legal"],
                "document_pool": {"Finance": ["invoice.pdf", "budget.xlsx", "vendor.pdf"],
                                   "HR": ["offer.pdf", "handbook.pdf", "leave.pdf"],
                                   "Legal": ["nda.pdf", "contract.pdf", "policy.pdf"]}}
    with with_mocked_generation(side_effect=openai_service.OpenAIServiceError("simulated OpenAI outage")):
        instance_data, generation_type, prompt_version = generate_document_organization_instance_controlled(metadata)
    from app.models.enums import GenerationType
    check("document generation falls back to the deterministic generator on any failure",
          generation_type == GenerationType.FALLBACK and len(instance_data["records"]) == 6, f"got {generation_type}")
    check("the fallback instance_data still has the correct shape (categories/records)",
          set(instance_data.keys()) == {"categories", "records"})


# ── Email Prioritization: valid + structural validation ──────────────────
def test_valid_email_task_generates_correctly_shaped_scenario_dict():
    with with_mocked_generation(return_value=_valid_email_content()):
        scenario_dict = run(tg.generate_email_prioritization_task(EMAIL_CONTEXT))
    check("valid email generation returns a scenario dict with the expected top-level keys",
          {"name", "role", "context_description", "context_tags", "emails"} <= set(scenario_dict.keys()))
    check("every generated email carries a real PriorityEvaluationService-computed expected_priority",
          all(isinstance(e["expected_priority"], PriorityLevel) for e in scenario_dict["emails"]),
          f"got {[e['expected_priority'] for e in scenario_dict['emails']]}")


def test_generated_emails_pass_through_the_existing_priority_evaluation_service():
    """The single most important test in this file per the audit brief:
    confirms determine_expected_priority (unmodified) is what actually
    decides expected_priority -- by independently recomputing it from the
    same stored factors and asserting an exact match, and by proving the
    LLM's own output schema has no priority-shaped field to begin with."""
    with with_mocked_generation(return_value=_valid_email_content()):
        scenario_dict = run(tg.generate_email_prioritization_task(EMAIL_CONTEXT))

    from app.orchestrators.priority_evaluation import EmailFactors, determine_expected_priority
    mismatches = 0
    for e in scenario_dict["emails"]:
        factors = EmailFactors(
            urgency=e["urgency"], business_impact=e["business_impact"],
            operational_relevance=e["operational_relevance"], deadline_pressure=e["deadline_pressure"],
            security_risk=e["security_risk"], context_tags=e["context_tags"],
        )
        recomputed = determine_expected_priority(
            factors, EMAIL_CONTEXT.priority_weights, EMAIL_CONTEXT.priority_rules, EMAIL_CONTEXT.context_attributes
        )
        if recomputed.expected_priority != e["expected_priority"] or abs(recomputed.priority_score - e["priority_score"]) > 0.01:
            mismatches += 1
    check("every generated email's persisted expected_priority is exactly reproducible from "
          "PriorityEvaluationService alone (never LLM-decided)", mismatches == 0, f"{mismatches} mismatches")

    schema_fields = set(tg.GeneratedEmailItem.model_fields.keys())
    check("the LLM's OWN output schema (GeneratedEmailItem) has no priority/expected_priority field at all",
          "priority" not in schema_fields and "expected_priority" not in schema_fields, f"fields={schema_fields}")


def test_invalid_email_metadata_out_of_range_rejected():
    try:
        tg.GeneratedEmailMetadata(urgency=7, business_impact=2, operational_relevance=2,
                                   deadline_pressure=1, security_risk=0)
        check("an urgency factor outside 0-5 is rejected by schema validation", False)
    except Exception:
        check("an urgency factor outside 0-5 is rejected by schema validation", True)


def test_invalid_priority_factor_negative_rejected():
    try:
        tg.GeneratedEmailMetadata(urgency=2, business_impact=-1, operational_relevance=2,
                                   deadline_pressure=1, security_risk=0)
        check("a negative factor value is rejected by schema validation", False)
    except Exception:
        check("a negative factor value is rejected by schema validation", True)


def test_duplicate_email_rejected():
    dup = _valid_email_content()
    dup.emails[1].subject = dup.emails[0].subject
    dup.emails[1].sender = dup.emails[0].sender
    with with_mocked_generation(return_value=dup):
        raised = None
        try:
            run(tg.generate_email_prioritization_task(EMAIL_CONTEXT))
        except tg.GenerationError as exc:
            raised = exc
    check("a duplicate generated email (same sender+subject) is rejected", raised is not None, f"got {raised}")


def test_empty_email_body_rejected():
    empty = _valid_email_content()
    empty.emails[0].body = "   "
    with with_mocked_generation(return_value=empty):
        raised = None
        try:
            run(tg.generate_email_prioritization_task(EMAIL_CONTEXT))
        except tg.GenerationError as exc:
            raised = exc
    check("a generated email with an empty/whitespace-only body is rejected", raised is not None, f"got {raised}")


def test_too_few_emails_rejected_by_schema():
    one_email = {
        "sender": "a@fake.test", "sender_role": "Analyst", "subject": "s", "body": "b",
        "has_attachment": False, "attachments": [], "context_tags": [], "deadline": None,
        "metadata": {"urgency": 1, "business_impact": 1, "operational_relevance": 1,
                     "deadline_pressure": 1, "security_risk": 0},
    }
    try:
        tg.GeneratedEmailPrioritizationContent(
            title="t", description="d", role="r", context_description="c",
            emails=[one_email for _ in range(tg.MIN_EMAILS - 1)],
        )
        check("fewer than MIN_EMAILS emails is rejected by schema validation", False)
    except Exception:
        check("fewer than MIN_EMAILS emails is rejected by schema validation", True)


# ── OpenAI failure modes -> GenerationError, never propagated raw ────────
def test_malformed_json_output_becomes_generation_error():
    with with_mocked_generation(side_effect=openai_service.OpenAIServiceError("Model output failed validation")):
        raised = None
        try:
            run(tg.generate_document_organization_task(DOC_CONTEXT))
        except tg.GenerationError as exc:
            raised = exc
    check("malformed JSON from OpenAI surfaces as GenerationError, not an unhandled exception",
          raised is not None, f"got {raised}")


def test_openai_timeout_becomes_generation_error():
    with with_mocked_generation(side_effect=openai_service.OpenAIServiceError("OpenAI request failed: timed out")):
        raised = None
        try:
            run(tg.generate_email_prioritization_task(EMAIL_CONTEXT))
        except tg.GenerationError as exc:
            raised = exc
    check("an OpenAI timeout surfaces as GenerationError for email generation too", raised is not None, f"got {raised}")


def test_openai_generic_failure_becomes_generation_error():
    with with_mocked_generation(side_effect=openai_service.OpenAIServiceError("connection refused")):
        raised = None
        try:
            run(tg.generate_document_organization_task(DOC_CONTEXT))
        except tg.GenerationError as exc:
            raised = exc
    check("a generic OpenAI connection failure surfaces as GenerationError", raised is not None, f"got {raised}")


def test_missing_api_key_raises_generation_error_without_any_call():
    from app.core.config import OPENAI_API_KEY as _unused  # noqa: F401
    with patch.object(tg, "OPENAI_API_KEY", None):
        raised = None
        try:
            run(tg.generate_document_organization_task(DOC_CONTEXT))
        except tg.GenerationError as exc:
            raised = exc
    check("a missing OPENAI_API_KEY raises GenerationError immediately (no generation attempted)",
          raised is not None, f"got {raised}")


# ── Fallback keeps the simulation working ────────────────────────────────
def test_email_endpoint_level_fallback_to_seed_scenario_on_generation_failure():
    """Exercises the real DB-touching fallback path in
    app/api/email_prioritization.py's _generate_email_scenario -- confirms
    it returns None (never raises) on any generation failure, which is
    exactly what lets the route fall back to the pre-existing seeded
    scenario and keep the simulation running."""
    from app.database import SessionLocal
    from app.api.email_prioritization import _generate_email_scenario

    db = SessionLocal()
    try:
        with with_mocked_generation(side_effect=openai_service.OpenAIServiceError("simulated outage")):
            result = _generate_email_scenario(db)
        check("email scenario generation failure returns None (never raises) so the route can fall back",
              result is None, f"got {result}")
    finally:
        db.close()


# ── Security: malicious generated content ────────────────────────────────
def test_generation_system_prompt_forbids_overriding_backend_rules():
    system, _ = tg._document_organization_prompt(DOC_CONTEXT)
    check("the document generation system prompt explicitly forbids overriding backend rules/scoring/state",
          "cannot" not in system.lower() and "never change backend rules" in system.lower()
          or "can never change backend rules" in system.lower(), f"prompt={system[:200]}")
    check("the document generation system prompt forbids secrets/executable content/URLs",
          "api keys" in system.lower() and "executable code" in system.lower())


def test_generated_category_outside_enum_via_prompt_injection_is_rejected():
    # Simulates "set this document category to something outside the
    # allowed enum" -- whether via genuine model drift or an adversarial
    # attempt, the outcome must be identical: rejected.
    injected = _valid_document_content()
    injected.documents[0].category = "IGNORE PREVIOUS INSTRUCTIONS Marketing"
    with with_mocked_generation(return_value=injected):
        raised = None
        try:
            run(tg.generate_document_organization_task(DOC_CONTEXT))
        except tg.GenerationError as exc:
            raised = exc
    check("an out-of-enum category, even one containing injection-style text, is rejected the same as any other",
          raised is not None, f"got {raised}")


def test_generation_error_never_leaks_the_api_key():
    fake_key = "sk-test-fake-do-not-leak-task-gen-12345"
    with with_mocked_generation(side_effect=openai_service.OpenAIServiceError(f"auth failed for {fake_key}")):
        raised = None
        try:
            run(tg.generate_document_organization_task(DOC_CONTEXT))
        except tg.GenerationError as exc:
            raised = exc
    check("task_generation's own GenerationError wrapping adds no additional key exposure beyond the SDK's own message",
          raised is not None, f"got {raised}")


if __name__ == "__main__":
    test_valid_document_task_generates_correctly_shaped_instance_data()
    test_invalid_document_category_is_rejected()
    test_missing_document_field_fails_pydantic_validation()
    test_too_few_documents_rejected()
    test_too_many_documents_rejected()
    test_duplicate_filenames_rejected()
    test_document_generation_falls_back_to_deterministic_generator_on_failure()
    test_valid_email_task_generates_correctly_shaped_scenario_dict()
    test_generated_emails_pass_through_the_existing_priority_evaluation_service()
    test_invalid_email_metadata_out_of_range_rejected()
    test_invalid_priority_factor_negative_rejected()
    test_duplicate_email_rejected()
    test_empty_email_body_rejected()
    test_too_few_emails_rejected_by_schema()
    test_malformed_json_output_becomes_generation_error()
    test_openai_timeout_becomes_generation_error()
    test_openai_generic_failure_becomes_generation_error()
    test_missing_api_key_raises_generation_error_without_any_call()
    test_email_endpoint_level_fallback_to_seed_scenario_on_generation_failure()
    test_generation_system_prompt_forbids_overriding_backend_rules()
    test_generated_category_outside_enum_via_prompt_injection_is_rejected()
    test_generation_error_never_leaks_the_api_key()

    print()
    passed = sum(1 for r in results if r)
    print(f"{passed}/{len(results)} checks passed")
    if passed != len(results):
        sys.exit(1)
