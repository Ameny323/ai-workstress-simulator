"""Centralized, tunable configuration for the ARIA adaptive-manager system
(simulation FSM, pressure scoring, hysteresis, communication frequency,
OpenAI settings). Every threshold the spec calls out as "must be
configurable, not hardcoded throughout the application" lives here, in one
place -- app/orchestrators/simulation_fsm.py, aria_policy.py, and
app/ai/* import from this module rather than each carrying their own
magic numbers.

Versioned (see aria_prompt_version / fsm_config_version below) so a later
change to these numbers doesn't silently make past sessions
non-reproducible -- see section 48/41 of the spec ("academic
reproducibility" / "prompt context versioning").
"""
from app.models.enums import ManagerTone, SessionPhase

# ── Versioning (section 41/48) ──────────────────────────────────────────────
ARIA_PROMPT_VERSION = "v1.0"
FSM_CONFIG_VERSION = "v1.0"

# ── Phase transition thresholds (section 6) ─────────────────────────────────
# WELCOME -> PRESSURE_RAMP after this many seconds OR this many completed
# tasks, whichever comes first -- a pure time-in-phase floor so the FSM
# doesn't sit in WELCOME forever on a quiet session, but also advances
# quickly for an active one.
WELCOME_MIN_SECONDS = 60
WELCOME_MIN_TASKS = 1

# PRESSURE_RAMP -> PEAK_LOAD requires the pressure score (0-100, see below)
# to cross this line, OR the remaining-time ratio to drop below this
# fraction of the session's total budget -- "performance deteriorates ...
# or remaining time decreases" from the spec, evaluated as an OR so either
# alone is sufficient.
PEAK_LOAD_PRESSURE_THRESHOLD = 55
PEAK_LOAD_REMAINING_TIME_RATIO = 0.25

# ── Pressure score formula weights (section 8) ──────────────────────────────
# Each component is normalized to 0-100 before weighting; weights need not
# sum to 1 (see simulation_fsm.py's normalize-by-sum-of-weights pattern,
# same approach priority_evaluation.py's calculate_weighted_score already
# uses for Task 02, reused here rather than inventing a second convention).
PRESSURE_WEIGHTS = {
    "error_rate": 0.30,
    "response_time_deviation": 0.20,
    "inactivity": 0.15,
    "remaining_time": 0.20,
    "reconsiderations": 0.15,
}

# ── Manager-tone thresholds (section 8) ─────────────────────────────────────
# The pressure score (0-100) maps to a target ManagerTone via these bands.
# This is only the TARGET -- hysteresis below decides whether the FSM
# actually moves there this evaluation.
TONE_BANDS = [
    (0, 25, ManagerTone.bienveillant),
    (25, 50, ManagerTone.neutre),
    (50, 75, ManagerTone.exigeant),
    (75, 101, ManagerTone.intrusif),
]

# ── Hysteresis (section 9) ───────────────────────────────────────────────────
# Increasing pressure needs only this many consecutive observations
# agreeing; decreasing needs more -- realistic escalation ("easy to make
# worse, slow to earn back trust"), not oscillation after every event.
CONSECUTIVE_OBSERVATIONS_TO_INCREASE = 1
CONSECUTIVE_OBSERVATIONS_TO_DECREASE = 3
# How many recent raw pressure-band votes are kept to evaluate the above
# (a short rolling window, persisted on Session.pressure_history -- see
# that column's own docstring).
PRESSURE_HISTORY_WINDOW = 5

# ── Communication frequency (section 16) ────────────────────────────────────
# Minimum seconds between two PROACTIVE ARIA messages, by current tone.
# Critical/high-severity triggers bypass this outright (section 17) --
# see aria_policy.CRITICAL_SEVERITY_BYPASS, unchanged from Task 02.
COMMUNICATION_FREQUENCY_SECONDS = {
    ManagerTone.bienveillant: 45,
    ManagerTone.neutre: 30,
    ManagerTone.exigeant: 20,
    ManagerTone.intrusif: 10,
}
# Same-trigger-repeat cooldown, also by tone -- more insistent tones repeat
# the same observation sooner than calmer ones would.
SAME_TRIGGER_COOLDOWN_SECONDS = {
    ManagerTone.bienveillant: 90,
    ManagerTone.neutre: 60,
    ManagerTone.exigeant: 40,
    ManagerTone.intrusif: 20,
}

# ── OpenAI (section 26/30) ───────────────────────────────────────────────────
OPENAI_REQUEST_TIMEOUT_SECONDS = 5.0
OPENAI_MAX_RESPONSE_TOKENS = 200

# Default per-phase manager tone the FSM starts a fresh phase transition
# from before any pressure evidence exists yet (section 5's example
# mapping) -- only a starting bias, pressure score can move off it
# immediately once real observations arrive.
DEFAULT_TONE_BY_PHASE = {
    SessionPhase.accueil: ManagerTone.bienveillant,
    SessionPhase.montee_pression: ManagerTone.neutre,
    SessionPhase.pic_charge: ManagerTone.exigeant,
    SessionPhase.debriefing: ManagerTone.bienveillant,
}
