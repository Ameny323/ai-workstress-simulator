"""Controlled LLM task-INSTANCE generation (automatic task generation,
required by the cahier des charges). Scope: DOCUMENT_ORGANIZATION,
EMAIL_PRIORITIZATION, EMAIL_WRITING, and URGENT_REQUEST.

Architecture (never deviated from):

    TASK TYPE / TEMPLATE (backend-controlled: categories, weights, rules)
      -> generate_task(task_type, generation_context)      [this module]
      -> OpenAIService.generate_structured(...)             [openai_service.py]
      -> Pydantic-validated structured content
      -> deterministic content validation/normalization     [this module]
      -> for email_prioritization: PriorityEvaluationService computes
         expected_priority -- this module never invents it
      -> caller (task_engine.py / email_prioritization.py) persists the
         Task / EmailScenario+EmailTaskItem rows and applies the fallback
         to the existing deterministic generator on any GenerationError

The LLM only ever produces CONTENT:
  - document_organization: filenames + a category label per document,
    constrained to a category set the CALLER supplies (from an existing
    TaskTemplate's own metadata -- never invented by this module or the
    model).
  - email_prioritization: email narrative (sender/subject/body/tags) and
    the five 0-5 factor scores PriorityEvaluationService already expects.
    priority_weights/priority_rules are supplied by the caller (reused
    from an existing scenario's config) -- the LLM never authors scoring
    rules, and this module never computes expected_priority itself; it
    always calls the existing, unmodified determine_expected_priority().

Every public generate_*_task() function raises GenerationError on ANY
failure (missing key, timeout, malformed output, schema validation,
content validation) -- callers MUST catch it and fall back to the
existing deterministic generator. Generation failing must never break the
simulation.
"""
import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.ai import openai_service
from app.ai.openai_service import OpenAIServiceError
from app.core.config import OPENAI_API_KEY
from app.orchestrators.priority_evaluation import EmailFactors, determine_expected_priority

logger = logging.getLogger(__name__)

# Reproducibility (section 48-style versioning, same convention as
# ARIA_PROMPT_VERSION in app/core/aria_config.py) -- bump this whenever the
# generation prompts below change meaningfully, so generated tasks stay
# traceable to the prompt that produced them (see Task.generation_prompt_version).
TASK_GENERATION_PROMPT_VERSION = "v1.0"

MIN_DOCUMENTS, MAX_DOCUMENTS = 4, 10
MIN_EMAILS, MAX_EMAILS = 5, 10
MIN_REQUIRED_POINTS, MAX_REQUIRED_POINTS = 2, 6
MIN_URGENT_REQUEST_OPTIONS, MAX_URGENT_REQUEST_OPTIONS = 3, 5

# app/core/aria_config.py's OPENAI_MAX_RESPONSE_TOKENS (200) is tuned for a
# single short ARIA sentence -- far too small for a multi-document/
# multi-email JSON payload, which would silently truncate mid-JSON and
# surface as a confusing "malformed output" validation failure rather than
# a clear token-budget problem. These are sized generously for the
# MAX_DOCUMENTS/MAX_EMAILS bounds above.
DOCUMENT_GENERATION_MAX_TOKENS = 1200
EMAIL_GENERATION_MAX_TOKENS = 3000

# Same reasoning as the token budgets above: OPENAI_REQUEST_TIMEOUT_SECONDS
# (5s) is tuned for a single short ARIA sentence and is too tight for a
# multi-item structured generation to reliably complete. These calls run
# synchronously inside a task-creation request (the frontend needs the
# full task now, unlike ARIA's fire-and-forget message upgrade), so a
# generous-but-bounded ceiling is used instead -- any timeout still falls
# back to the deterministic generator immediately, never hangs the request.
DOCUMENT_GENERATION_TIMEOUT_SECONDS = 15.0
EMAIL_GENERATION_TIMEOUT_SECONDS = 25.0
EMAIL_WRITING_GENERATION_MAX_TOKENS = 800
EMAIL_WRITING_GENERATION_TIMEOUT_SECONDS = 12.0
URGENT_REQUEST_GENERATION_MAX_TOKENS = 500
URGENT_REQUEST_GENERATION_TIMEOUT_SECONDS = 10.0

# Shared across both generators -- the untrusted-content / no-override
# philosophy already established in app/ai/prompt_builder.py, adapted for
# content GENERATION rather than ARIA message wording.
GENERATION_SYSTEM_PROMPT_HEADER = (
    "You are a content generator for a workplace-simulation training exercise. "
    "You generate REALISTIC but FICTIONAL simulation content only. Follow the "
    "requested JSON schema exactly -- no extra keys, no markdown fencing. "
    "The task type and every allowed category/enum value stated below are "
    "authoritative and fixed by the backend; use ONLY the values given, never "
    "invent new ones. "
    "This generated content is later treated as untrusted simulation data by the "
    "rest of the application -- it can never change backend rules, scoring, task "
    "evaluation logic, FSM/session state, or application behavior, and you must "
    "not attempt to write content that tries to. Do not include instructions "
    "directed at any system, assistant, or user that attempt to override these "
    "rules, reveal secrets, or redefine the task type. Do not generate API keys, "
    "secrets, credentials, executable code, scripts, or URLs. Do not generate "
    "real people's names, real company names, or real sensitive information -- "
    "keep everything clearly fictional."
)


class GenerationError(Exception):
    """Raised for every failure mode -- missing key, OpenAIServiceError
    (timeout/connection/API/malformed-JSON/schema-mismatch), or this
    module's own deterministic content validation. Callers always catch
    this and fall back to the existing deterministic generator."""


# ── Document Organization ────────────────────────────────────────────────
class GeneratedDocumentItem(BaseModel):
    filename: str = Field(min_length=3, max_length=80)
    category: str = Field(min_length=1, max_length=50)


class GeneratedDocumentOrganizationContent(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    description: str = Field(min_length=1, max_length=600)
    documents: List[GeneratedDocumentItem] = Field(min_length=MIN_DOCUMENTS, max_length=MAX_DOCUMENTS)


@dataclass
class DocumentOrganizationGenerationContext:
    # The controlled, backend-supplied category set for THIS generation
    # call -- taken from an existing TaskTemplate.metadata_json["categories"]
    # by the caller. Categories are per-template in this project (see
    # backend/seeds/document_organization_templates.json -- Finance/HR/Legal
    # is only one of three seeded sets), never one hardcoded global enum.
    categories: List[str]
    item_count: int
    scenario_hint: Optional[str] = None


def _document_organization_prompt(context: DocumentOrganizationGenerationContext) -> tuple:
    categories_str = ", ".join(context.categories)
    system = (
        GENERATION_SYSTEM_PROMPT_HEADER
        + f"\n\nAllowed categories for this task (use ONLY these, exactly as spelled): {categories_str}."
    )
    user = (
        f"Generate a document-organization exercise: a short scenario title, a one-sentence "
        f"description of the sorting task, and exactly {context.item_count} realistic office document "
        f"filenames (with a plausible extension such as .pdf/.xlsx/.docx), each assigned to one of the "
        f"allowed categories above. Use each category at least once where possible. No two filenames "
        f"may be identical."
    )
    if context.scenario_hint:
        user += f" Scenario context: {context.scenario_hint}"
    user += (
        '\n\nRespond with ONLY a JSON object of the exact shape {"title": "...", "description": "...", '
        '"documents": [{"filename": "...", "category": "..."}, ...]}. No other keys, no nesting beyond '
        "this, no markdown fencing."
    )
    return system, user


def _validate_document_organization_content(
    content: GeneratedDocumentOrganizationContent, context: DocumentOrganizationGenerationContext
) -> None:
    if not (MIN_DOCUMENTS <= len(content.documents) <= MAX_DOCUMENTS):
        raise GenerationError(f"generated document count {len(content.documents)} is out of the allowed range")
    allowed = set(context.categories)
    filenames_seen = set()
    for doc in content.documents:
        if doc.category not in allowed:
            raise GenerationError(
                f"generated document category '{doc.category}' is not in the allowed set {sorted(allowed)}"
            )
        key = doc.filename.strip().lower()
        if not key:
            raise GenerationError("a generated document has an empty filename")
        if key in filenames_seen:
            raise GenerationError(f"duplicate generated filename: '{doc.filename}'")
        filenames_seen.add(key)


async def generate_document_organization_task(context: DocumentOrganizationGenerationContext) -> Dict[str, Any]:
    """Returns instance_data shaped EXACTLY like the existing deterministic
    generator's output (app/tasks/document_organization.py's
    generate_document_organization_instance): {"categories": [...],
    "records": [{"id", "filename", "correct_category"}, ...]} -- a drop-in
    replacement wherever Task.instance_data is consumed (the scorer, the
    frontend), so no downstream code needs to know whether a given
    instance was LLM-generated or deterministic-generated.
    """
    if not OPENAI_API_KEY:
        raise GenerationError("OPENAI_API_KEY is not configured")
    system, user = _document_organization_prompt(context)
    try:
        content = await openai_service.generate_structured(
            system, user, GeneratedDocumentOrganizationContent,
            max_tokens=DOCUMENT_GENERATION_MAX_TOKENS, timeout=DOCUMENT_GENERATION_TIMEOUT_SECONDS,
        )
    except OpenAIServiceError as exc:
        raise GenerationError(str(exc)) from exc

    _validate_document_organization_content(content, context)

    records = [
        {"id": i + 1, "filename": doc.filename.strip(), "correct_category": doc.category}
        for i, doc in enumerate(content.documents)
    ]
    return {"categories": list(context.categories), "records": records}


# ── Email Prioritization ──────────────────────────────────────────────────
class GeneratedEmailMetadata(BaseModel):
    urgency: int = Field(ge=0, le=5)
    business_impact: int = Field(ge=0, le=5)
    operational_relevance: int = Field(ge=0, le=5)
    deadline_pressure: int = Field(ge=0, le=5)
    security_risk: int = Field(ge=0, le=5)


class GeneratedEmailItem(BaseModel):
    sender: str = Field(min_length=1, max_length=100)
    sender_role: str = Field(min_length=1, max_length=100)
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=2000)
    has_attachment: bool = False
    attachments: List[str] = Field(default_factory=list)
    context_tags: List[str] = Field(default_factory=list)
    deadline: Optional[str] = Field(default=None, max_length=100)
    metadata: GeneratedEmailMetadata


class GeneratedEmailPrioritizationContent(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    description: str = Field(min_length=1, max_length=600)
    role: str = Field(min_length=1, max_length=100)
    context_description: str = Field(min_length=1, max_length=600)
    context_tags: List[str] = Field(default_factory=list)
    emails: List[GeneratedEmailItem] = Field(min_length=MIN_EMAILS, max_length=MAX_EMAILS)


@dataclass
class EmailPrioritizationGenerationContext:
    role: str
    # Scoring configuration is ALWAYS backend-supplied, reused from an
    # existing EmailScenario (e.g. the seed scenario's own config) --
    # never authored by the LLM. See priority_evaluation.py, unmodified.
    priority_weights: Dict[str, float]
    priority_rules: List[Dict[str, Any]] = field(default_factory=list)
    context_attributes: Dict[str, Any] = field(default_factory=dict)
    email_count: int = 8
    scenario_hint: Optional[str] = None


def _email_prioritization_prompt(context: EmailPrioritizationGenerationContext) -> tuple:
    system = (
        GENERATION_SYSTEM_PROMPT_HEADER
        + "\n\nYou generate the emails and their descriptive factor scores only. You do NOT decide "
        "or state each email's final priority anywhere -- that is computed separately by a "
        "deterministic system you have no visibility into. Each factor (urgency, business_impact, "
        "operational_relevance, deadline_pressure, security_risk) must be an integer from 0 to 5, "
        "reflecting how the email's own content would realistically be judged on that dimension."
    )
    user = (
        f"Generate an email-prioritization exercise for someone in the role of '{context.role}'. "
        f"Produce a short scenario title, a one-sentence description, a one-sentence operational "
        f"context description, a few context tags, and exactly {context.email_count} realistic but "
        f"fictional workplace emails with varied urgency/importance -- some routine, some genuinely "
        f"pressing. Each email needs: sender, sender_role, subject, body (2-5 sentences), whether it "
        f"has an attachment, attachment filenames if any, context_tags, an optional short descriptive "
        f"deadline phrase (e.g. 'end of day'), and the five metadata factor scores."
    )
    if context.scenario_hint:
        user += f" Scenario context: {context.scenario_hint}"
    user += (
        '\n\nRespond with ONLY a JSON object of the exact shape {"title": "...", "description": "...", '
        '"role": "...", "context_description": "...", "context_tags": ["...", ...], "emails": '
        '[{"sender": "...", "sender_role": "...", "subject": "...", "body": "...", '
        '"has_attachment": true/false, "attachments": ["...", ...], "context_tags": ["...", ...], '
        '"deadline": "..." or null, "metadata": {"urgency": 0-5, "business_impact": 0-5, '
        '"operational_relevance": 0-5, "deadline_pressure": 0-5, "security_risk": 0-5}}, ...]}. '
        "The five factor scores MUST be nested under each email's own \"metadata\" object exactly as "
        "shown -- never as top-level fields on the email. No other keys, no markdown fencing."
    )
    return system, user


def _validate_email_prioritization_content(content: GeneratedEmailPrioritizationContent) -> None:
    if not (MIN_EMAILS <= len(content.emails) <= MAX_EMAILS):
        raise GenerationError(f"generated email count {len(content.emails)} is out of the allowed range")
    seen = set()
    for email in content.emails:
        if not email.subject.strip() or not email.body.strip():
            raise GenerationError("a generated email has an empty subject or body")
        key = (email.subject.strip().lower(), email.sender.strip().lower())
        if key in seen:
            raise GenerationError(f"duplicate generated email: subject='{email.subject}' sender='{email.sender}'")
        seen.add(key)


async def generate_email_prioritization_task(context: EmailPrioritizationGenerationContext) -> Dict[str, Any]:
    """Returns {"name", "role", "context_description", "context_tags",
    "emails": [...]} ready for direct EmailScenario/EmailTaskItem
    construction. Every email's priority_score/expected_priority/
    triggered_rules/evaluation_rationale/priority_boundary_proximity is
    computed HERE by calling the existing, unmodified
    determine_expected_priority() -- exactly mirroring
    backend/seeds/load_email_scenarios.py's own pattern. This module never
    computes or overrides that result itself; PriorityEvaluationService
    remains the sole authority on expected priority.
    """
    if not OPENAI_API_KEY:
        raise GenerationError("OPENAI_API_KEY is not configured")
    system, user = _email_prioritization_prompt(context)
    try:
        content = await openai_service.generate_structured(
            system, user, GeneratedEmailPrioritizationContent,
            max_tokens=EMAIL_GENERATION_MAX_TOKENS, timeout=EMAIL_GENERATION_TIMEOUT_SECONDS,
        )
    except OpenAIServiceError as exc:
        raise GenerationError(str(exc)) from exc

    _validate_email_prioritization_content(content)

    emails = []
    for email in content.emails:
        factors = EmailFactors(
            urgency=email.metadata.urgency,
            business_impact=email.metadata.business_impact,
            operational_relevance=email.metadata.operational_relevance,
            deadline_pressure=email.metadata.deadline_pressure,
            security_risk=email.metadata.security_risk,
            context_tags=email.context_tags,
        )
        # THE authoritative evaluation call -- never duplicated, never
        # second-guessed by this module.
        result = determine_expected_priority(
            factors, context.priority_weights, context.priority_rules, context.context_attributes
        )
        emails.append({
            "sender": email.sender, "sender_role": email.sender_role, "subject": email.subject,
            "body": email.body, "has_attachment": email.has_attachment, "attachments": email.attachments,
            "context_tags": email.context_tags, "deadline": email.deadline,
            "urgency": email.metadata.urgency, "business_impact": email.metadata.business_impact,
            "operational_relevance": email.metadata.operational_relevance,
            "deadline_pressure": email.metadata.deadline_pressure, "security_risk": email.metadata.security_risk,
            "priority_score": result.priority_score, "expected_priority": result.expected_priority,
            "triggered_rules": result.triggered_rules, "evaluation_rationale": result.evaluation_rationale,
            "priority_boundary_proximity": result.priority_boundary_proximity,
        })

    return {
        "name": content.title, "role": content.role, "context_description": content.context_description,
        "context_tags": content.context_tags, "emails": emails,
    }


# ── Email Writing (cahier: "redaction de courriels") ─────────────────────
class GeneratedEmailWritingContent(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    description: str = Field(min_length=1, max_length=600)
    sender: str = Field(min_length=1, max_length=100)
    sender_role: str = Field(min_length=1, max_length=100)
    subject: str = Field(min_length=1, max_length=200)
    context: str = Field(min_length=1, max_length=1000)
    original_request: str = Field(min_length=1, max_length=1000)
    objective: str = Field(min_length=1, max_length=300)
    urgency: int = Field(ge=0, le=5)
    required_points: List[str] = Field(min_length=MIN_REQUIRED_POINTS, max_length=MAX_REQUIRED_POINTS)
    forbidden_points: List[str] = Field(default_factory=list, max_length=4)
    min_length: int = Field(ge=20, le=2000)
    max_length: int = Field(ge=50, le=3000)


@dataclass
class EmailWritingGenerationContext:
    role: str
    scenario_hint: Optional[str] = None


def _email_writing_prompt(context: EmailWritingGenerationContext) -> tuple:
    system = (
        GENERATION_SYSTEM_PROMPT_HEADER
        + "\n\nYou generate the INCOMING request the participant must respond to by writing an email -- "
        "you never write the response yourself. required_points are the specific pieces of "
        "information a good response should cover (used later to grade the participant's own "
        "writing); forbidden_points are things a response should NOT include (e.g. confidential "
        "details, promises that shouldn't be made). min_length/max_length are the expected reply "
        "length in characters, matched to how much a response addressing all required_points "
        "realistically needs."
    )
    user = (
        f"Generate an email-writing exercise: the participant plays a {context.role} who received an "
        f"incoming request and must write a professional reply. Produce a short scenario title, a "
        f"one-sentence description of the exercise, a realistic sender name and role, a subject line, "
        f"1-3 sentences of context, the original request's own text, a one-sentence objective for the "
        f"reply, an urgency level 0-5, {MIN_REQUIRED_POINTS}-{MAX_REQUIRED_POINTS} required_points the "
        f"reply should cover, 0-2 forbidden_points, and a reasonable min_length/max_length in characters."
    )
    if context.scenario_hint:
        user += f" Scenario context: {context.scenario_hint}"
    user += (
        '\n\nRespond with ONLY a JSON object of the exact shape {"title": "...", "description": "...", '
        '"sender": "...", "sender_role": "...", "subject": "...", "context": "...", '
        '"original_request": "...", "objective": "...", "urgency": 0-5, '
        '"required_points": ["...", ...], "forbidden_points": ["...", ...], '
        '"min_length": int, "max_length": int}. No other keys, no markdown fencing.'
    )
    return system, user


def _validate_email_writing_content(content: GeneratedEmailWritingContent) -> None:
    if content.max_length <= content.min_length:
        raise GenerationError(f"max_length ({content.max_length}) must exceed min_length ({content.min_length})")
    cleaned = [p.strip() for p in content.required_points if p.strip()]
    if len(cleaned) < MIN_REQUIRED_POINTS:
        raise GenerationError("generated email-writing scenario has too few non-empty required_points")
    if not content.subject.strip() or not content.original_request.strip():
        raise GenerationError("generated email-writing scenario has an empty subject or original_request")


async def generate_email_writing_task(context: EmailWritingGenerationContext) -> Dict[str, Any]:
    """Returns instance_data shaped exactly like the existing deterministic
    generator's output (app/tasks/email_writing.py's
    generate_email_writing_instance) -- a drop-in replacement wherever
    Task.instance_data is consumed (the scorer, the frontend)."""
    if not OPENAI_API_KEY:
        raise GenerationError("OPENAI_API_KEY is not configured")
    system, user = _email_writing_prompt(context)
    try:
        content = await openai_service.generate_structured(
            system, user, GeneratedEmailWritingContent,
            max_tokens=EMAIL_WRITING_GENERATION_MAX_TOKENS, timeout=EMAIL_WRITING_GENERATION_TIMEOUT_SECONDS,
        )
    except OpenAIServiceError as exc:
        raise GenerationError(str(exc)) from exc

    _validate_email_writing_content(content)

    return {
        "sender": content.sender, "sender_role": content.sender_role, "subject": content.subject,
        "context": content.context, "original_request": content.original_request, "objective": content.objective,
        "urgency": content.urgency, "required_points": content.required_points,
        "forbidden_points": content.forbidden_points, "min_length": content.min_length, "max_length": content.max_length,
    }


# ── Urgent Request (cahier: "reponse a des demandes urgentes") ───────────
class GeneratedUrgentRequestOption(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    label: str = Field(min_length=1, max_length=150)


class GeneratedUrgentRequestContent(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    description: str = Field(min_length=1, max_length=600)
    sender: str = Field(min_length=1, max_length=100)
    sender_role: str = Field(min_length=1, max_length=100)
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=1200)
    urgency: int = Field(ge=0, le=5)
    options: List[GeneratedUrgentRequestOption] = Field(
        min_length=MIN_URGENT_REQUEST_OPTIONS, max_length=MAX_URGENT_REQUEST_OPTIONS
    )
    correct_action: str = Field(min_length=1, max_length=40)


@dataclass
class UrgentRequestGenerationContext:
    role: str
    scenario_hint: Optional[str] = None


def _urgent_request_prompt(context: UrgentRequestGenerationContext) -> tuple:
    system = (
        GENERATION_SYSTEM_PROMPT_HEADER
        + "\n\nYou generate an urgent workplace situation and a fixed set of possible response actions -- "
        "you decide which single action is the objectively most appropriate one (correct_action), but "
        "you never expose that judgment as anything other than picking one of the option ids you "
        "yourself generated. Each option needs a short machine-friendly id (lowercase, underscores) "
        "and a human-readable label."
    )
    user = (
        f"Generate an urgent-request exercise: the participant plays a {context.role} who receives an "
        f"urgent message and must choose how to respond. Produce a short scenario title, a one-sentence "
        f"description, a realistic sender name and role, a subject line, the urgent message text, an "
        f"urgency level 0-5 (should be on the higher end, 3-5, since this is explicitly an URGENT "
        f"request), and {MIN_URGENT_REQUEST_OPTIONS}-{MAX_URGENT_REQUEST_OPTIONS} distinct response-action "
        f"options (e.g. escalate to a manager, handle it personally right away, delegate to someone else, "
        f"defer until later, request more information) -- exactly one of which is clearly the best response "
        f"given the scenario. Set correct_action to that option's id."
    )
    if context.scenario_hint:
        user += f" Scenario context: {context.scenario_hint}"
    user += (
        '\n\nRespond with ONLY a JSON object of the exact shape {"title": "...", "description": "...", '
        '"sender": "...", "sender_role": "...", "subject": "...", "message": "...", "urgency": 0-5, '
        '"options": [{"id": "...", "label": "..."}, ...], "correct_action": "..."}. '
        "No other keys, no markdown fencing."
    )
    return system, user


def _validate_urgent_request_content(content: GeneratedUrgentRequestContent) -> None:
    ids = [opt.id.strip() for opt in content.options]
    if len(set(ids)) != len(ids):
        raise GenerationError("generated urgent-request options contain duplicate ids")
    if any(not i for i in ids):
        raise GenerationError("a generated urgent-request option has an empty id")
    if content.correct_action not in ids:
        raise GenerationError(
            f"correct_action '{content.correct_action}' does not match any generated option id {ids}"
        )
    if not content.message.strip():
        raise GenerationError("generated urgent-request scenario has an empty message")


async def generate_urgent_request_task(context: UrgentRequestGenerationContext) -> Dict[str, Any]:
    """Returns instance_data shaped exactly like app/tasks/urgent_request.py's
    generate_urgent_request_instance."""
    if not OPENAI_API_KEY:
        raise GenerationError("OPENAI_API_KEY is not configured")
    system, user = _urgent_request_prompt(context)
    try:
        content = await openai_service.generate_structured(
            system, user, GeneratedUrgentRequestContent,
            max_tokens=URGENT_REQUEST_GENERATION_MAX_TOKENS, timeout=URGENT_REQUEST_GENERATION_TIMEOUT_SECONDS,
        )
    except OpenAIServiceError as exc:
        raise GenerationError(str(exc)) from exc

    _validate_urgent_request_content(content)

    return {
        "sender": content.sender, "sender_role": content.sender_role, "subject": content.subject,
        "message": content.message, "urgency": content.urgency,
        "options": [{"id": opt.id, "label": opt.label} for opt in content.options],
        "correct_action": content.correct_action,
    }


# ── Sync bridge + unified interface ──────────────────────────────────────
def _run_sync(coro):
    """Bridges an async generation call into the two existing (plain `def`,
    threadpool-executed) task-creation routes -- no event loop is active on
    that worker thread, so a scoped asyncio.run() here is safe and avoids
    converting either route to async or touching task_engine.py's public
    contract. Bounded by OpenAIService's own OPENAI_REQUEST_TIMEOUT_SECONDS
    internally -- this never hangs indefinitely.
    """
    return asyncio.run(coro)


def generate_task(task_type, generation_context) -> Dict[str, Any]:
    """Single controlled entry point, dispatching on the existing TaskType
    enum. task_type is decided entirely by the caller (backend
    configuration / template selection) -- this function has no say in
    WHICH task type runs; it only ever generates CONTENT for the type it's
    told to. Synchronous, so both existing sync routes can call it
    directly. Raises GenerationError on any failure -- callers must catch
    it and fall back to the deterministic generator.
    """
    from app.models.enums import TaskType

    if task_type == TaskType.document_organization:
        return _run_sync(generate_document_organization_task(generation_context))
    if task_type == TaskType.email_prioritization:
        return _run_sync(generate_email_prioritization_task(generation_context))
    if task_type == TaskType.email_writing:
        return _run_sync(generate_email_writing_task(generation_context))
    if task_type == TaskType.urgent_request:
        return _run_sync(generate_urgent_request_task(generation_context))
    raise GenerationError(f"automatic generation is not supported for task_type '{task_type}'")
