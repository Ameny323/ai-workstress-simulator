import enum


class SessionPhase(str, enum.Enum):
    accueil = "accueil"
    montee_pression = "montee_pression"
    pic_charge = "pic_charge"
    debriefing = "debriefing"


class SessionStatus(str, enum.Enum):
    in_progress = "in_progress"
    completed = "completed"
    abandoned = "abandoned"


class TaskType(str, enum.Enum):
    data_validation = "data_validation"
    document_organization = "document_organization"
    email_writing = "email_writing"
    urgent_request = "urgent_request"
    image_matching = "image_matching"
    email_prioritization = "email_prioritization"


class TaskStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    expired = "expired"


class TaskDifficulty(str, enum.Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


class Priority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class ManagerTone(str, enum.Enum):
    bienveillant = "bienveillant"
    neutre = "neutre"
    exigeant = "exigeant"
    intrusif = "intrusif"


class RecommendationCategory(str, enum.Enum):
    gestion_temps = "gestion_temps"
    pause = "pause"
    communication = "communication"
    charge_travail = "charge_travail"


# Email Prioritization (Task 02) -- ordinal values (LOW=0 .. CRITICAL=3) are
# NOT stored on the enum itself; PRIORITY_ORDER in
# app/orchestrators/priority_evaluation.py is the single source of truth
# for that mapping, used to compute decision-distance/scoring.
class PriorityLevel(str, enum.Enum):
    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class AccuracyLevel(str, enum.Enum):
    EXACT = "EXACT"
    CLOSE = "CLOSE"
    MISPRIORITIZED = "MISPRIORITIZED"
    SEVERELY_MISPRIORITIZED = "SEVERELY_MISPRIORITIZED"


# Adaptive AI Manager (ARIA v2): how a ManagerMessage's content was
# produced. Richer than the boolean was_fallback it sits alongside (kept
# for backward compatibility with existing readers) -- SYSTEM covers
# messages that are pure fact statements with no generation step at all
# (not currently emitted, reserved for e.g. a plain phase-transition
# notice with no accompanying commentary).
class GenerationType(str, enum.Enum):
    LLM = "LLM"
    FALLBACK = "FALLBACK"
    SYSTEM = "SYSTEM"
    # Task-generation reuse (Task 03, automatic task-instance generation):
    # content came from the original deterministic/template-driven
    # generator with NO LLM call ever attempted for this task type
    # (data_validation, image_matching) -- distinct from FALLBACK, which
    # means LLM generation WAS attempted for this instance and failed.
    STATIC = "STATIC"


# EmailScenario provenance (section 48, reproducibility) -- SEED for the
# hand-authored JSON scenario, GENERATED for one produced via the new
# LLM-assisted task-generation path (task_generation.py). The deterministic
# PriorityEvaluationService computes expected_priority for EITHER source
# identically; this field is purely provenance/reproducibility metadata.
class ScenarioSource(str, enum.Enum):
    SEED = "SEED"
    GENERATED = "GENERATED"
