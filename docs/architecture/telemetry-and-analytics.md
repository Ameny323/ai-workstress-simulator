# Telemetry and Analytics

## Three data layers

This document distinguishes three layers that must never be conflated:

```
RAW OBSERVATIONS  →  DERIVED METRICS  →  BEHAVIORAL INTERPRETATION
```

- **Raw observations** are values written directly from a real event, with no computation applied: a timestamp, a submitted answer, a declared stress level.
- **Derived metrics** are computed from raw observations by a documented formula (e.g. an accuracy percentage, a pace efficiency score). These are never themselves "measurements" — they are calculations over measurements.
- **Behavioral interpretation** is a further abstraction over derived metrics: a classification label (e.g. "performance declining") or a descriptive combination of several derived metrics.

## `InteractionMetric` — the raw telemetry model

`backend/app/models/interaction_metric.py`:

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `session_id` | UUID, FK → `sessions.id` | Required |
| `task_id` | UUID, FK → `tasks.id`, nullable | `None` for session-scoped events (e.g. a stress declaration between tasks) |
| `action_type` | string | See event types below |
| `metadata_json` | JSON | Event-specific payload |
| `timestamp` | datetime | Set at row creation |

## Actual event types (`action_type` values observed in code)

| `action_type` | Written by | Payload contents |
|---|---|---|
| `task_started` | `aria_pipeline.emit_aria_reaction` (called from `get_next_task`) | `{source_event, event_id}` |
| `task_completed` | `aria_pipeline.emit_aria_reaction` (called from `submit_task`) | `{content_score, error_count, event_id}` |
| `difficulty_changed` | `task_engine.resolve_difficulty_pool_with_cooldown` (via `aria_pipeline`) | `{source_event, event_id}` |
| `mercy_rule_activated` | same | `{source_event, event_id}` |
| `stress_declared` | `sessions.py:declare_stress` (via `aria_pipeline`) | `{stress_level, event_id}` |
| `typing_metrics` | `tasks.py:submit_task`, only for `email_writing` submissions that captured typing telemetry | Aggregate-only fields: `typing_duration_seconds, character_count, word_count, average_chars_per_second, typing_speed_variation, pause_count_during_typing` — never raw keystrokes or the typed text itself |
| `reconsideration` | `tasks.py:submit_task`, only when `reconsideration_count > 0` | `{count}` |
| (Task 02 / `email_prioritization` specific events) | `email_event_pipeline.py` | Decision-scoped events, outside the default sequence |

## How telemetry is generated

Every write above originates from a real, traceable action:
- A task fetch (`GET next-task`) triggers `task_started`.
- A submission (`POST /tasks/{id}/complete`) triggers `task_completed`, and conditionally `typing_metrics`/`reconsideration`.
- A stress declaration (`POST /sessions/{id}/stress`) triggers `stress_declared`.
- The difficulty-pool adaptation logic triggers `difficulty_changed`/`mercy_rule_activated` when its own rule cascade (`app/orchestrators/adaptation.py`) produces a change.

No `InteractionMetric` row is ever created speculatively or on a timer; each one corresponds to a specific, identifiable backend code path executing in response to a real request.

## From raw telemetry to derived metrics

`backend/app/orchestrators/performance_tracker.py` and `backend/app/reports/aggregation.py` are the two modules that read raw `Task`/`InteractionMetric`/`StressDeclaration` rows and compute derived quantities — `avg_score`, `consecutive_errors`, `error_rate`, `idle_time_seconds`, `workload`, pause counts, timing samples, and the first/second-half split used throughout the analytics stack. See `docs/methodology/metrics-and-indicators.md` for the exact formula of every derived metric.

## From derived metrics to interpretation

`backend/app/reports/behavioral_evaluation.py` is the one module that takes derived metrics (already computed by `aggregation.py`) and produces classification labels (`EvolutionMetric.evolution` ∈ `{IMPROVING, DECLINING, STABLE, ACCELERATING, SLOWING, INCREASING, DECREASING, INSUFFICIENT_DATA}`) and descriptive combinations (`BehavioralObservation`). See `docs/architecture/behavioral-evaluation.md`.

## Terminology discipline

Throughout this documentation set:
- A quantity is called "observed" or "measured" only if it is a raw value with no arithmetic applied to it (a timestamp, a declared level, a submitted answer).
- Everything computed from those values — however simple the computation — is called "derived," never "measured."
- A classification label built on top of derived values is called an "interpretation" or "observation," never a "diagnosis," "detection," or "measurement."
