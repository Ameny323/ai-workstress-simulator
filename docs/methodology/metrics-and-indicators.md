# Metrics and Indicators

Every formula below was verified directly against the current source file cited. Non-positive-value handling and missing-data behavior are documented exactly as implemented — no formula has been altered, simplified, or "corrected" for this document.

---

## Completion rate

- **Definition**: fraction of assigned tasks that reached `completed` status.
- **Formula**: `completed_in_session / (completed_in_session + pending_count)`.
- **Input data**: `Task.status` counts, session-scoped.
- **Source**: `backend/app/orchestrators/performance_tracker.py`.
- **Unit**: fraction (0–1).
- **Classification**: DERIVED.
- **Interpretation**: proportion of the assigned workload actually finished.
- **Limitations**: does not distinguish a task abandoned near completion from one never opened.

## Accuracy (`avg_score`)

- **Definition**: mean `content_score` over a recent window of completed tasks (default window size 4).
- **Formula**: `sum(content_score for scored tasks) / count(scored tasks)`; tasks with `content_score = None` (a type with no scorer) are excluded, never treated as 0.
- **Input data**: `Task.content_score`.
- **Source**: `performance_tracker.py:get_performance_snapshot`.
- **Unit**: 0–100 scale (percentage-like, but not a percentage of a fixed total across all task types).
- **Classification**: DERIVED (from deterministic per-task scoring, itself DERIVED from a direct correctness comparison — see task-type scorers).
- **Limitations**: mixes different task types' scoring scales without difficulty normalization.

## Error rate

- **Definition**: fraction of a recent window of completed tasks with `error_count > 0`.
- **Formula**: `count(error_count>0) / count(scored)` over the window.
- **Source**: `performance_tracker.py`.
- **Unit**: fraction (0–1).
- **Classification**: DERIVED.

## Execution time (`time_taken_seconds`)

- **Definition**: elapsed time from either the real engagement timestamp or, if none exists, task assignment, to completion.
- **Formula**: `now − (Task.started_at or Task.assigned_at)`, computed once at submission.
- **Source**: `backend/app/api/tasks.py:submit_task`.
- **Unit**: seconds.
- **Classification**: DERIVED.
- **Limitations**: for any task that never called `/engage`, this measures assignment-to-completion time, which includes any delay before the participant actually began working — see "assignment delay" below.

## Assignment delay

- **Definition**: time between a task being assigned and the participant's first recorded engagement with it.
- **Formula**: `started_at − assigned_at`.
- **Source**: computed on demand in `backend/app/reports/behavioral_evaluation.py` (not a stored column).
- **Unit**: seconds.
- **Classification**: DERIVED.
- **Availability**: only when `started_at` is real (i.e. `/tasks/{id}/engage` was called).

## Active execution time

- **Definition**: time actually spent engaged with a task, excluding any pre-engagement delay.
- **Formula**: `completed_at − started_at` (only when `started_at` is real); falls back to `time_taken_seconds` for a task with no real `started_at`, in which case the sample is explicitly flagged as a legacy fallback and never presented as equivalent data.
- **Source**: `behavioral_evaluation.py:task_active_execution_seconds`.
- **Unit**: seconds.
- **Classification**: DERIVED.

## Pace efficiency

- **Definition**: how a task's active execution time compares to its expected/allocated duration.
- **Formula**:
  ```python
  pace_efficiency = min(100, 100 * expected_duration_seconds / active_execution_seconds)
  ```
  where `expected_duration_seconds = Task.deadline_seconds` (itself derived from `TaskTemplate.estimated_duration`, authored per `TaskTemplate.difficulty`, then adjusted per the participant's recent performance by `app/orchestrators/adaptation.py:adjust_priority_and_deadline`). An active execution time of exactly 0 seconds scores 100 (no division by zero); a missing expected duration or missing active time returns `None`, never a guessed value.
- **Source**: `behavioral_evaluation.py:task_pace_efficiency`.
- **Unit**: 0–100 (capped).
- **Classification**: DERIVED.
- **Interpretation**: relative execution efficiency against the task's own allotted time — not a psychological pace assessment.

## Workflow transition time

- **Definition**: time between finishing one task and beginning the next.
- **Formula**: `next_task.started_at − previous_task.completed_at`, for each consecutive pair in real sequence order; pairs missing a real `started_at` on the next task, or with a negative gap, are excluded rather than measured against a fallback timestamp.
- **Source**: `behavioral_evaluation.py:compute_transition_times`.
- **Unit**: seconds.
- **Classification**: DERIVED.

## Pause / idle behavior

- **Definition**: a pause is any gap of at least the configured threshold between two consecutive `InteractionMetric` events for the session.
- **Formula**: threshold = 90 seconds (`HIGH_IDLE_SECONDS`, `app/orchestrators/aria_policy.py`, reused unchanged by the reporting layer as `PAUSE_THRESHOLD_SECONDS`). `pause_count` = number of qualifying gaps; `average_pause_duration_seconds` is `None` (not 0) when there are no qualifying gaps.
- **Source**: `app/reports/aggregation.py:compute_pause_episodes`.
- **Unit**: count, seconds.
- **Classification**: DERIVED.

## Correction / reconsideration count

- **Definition**: how many times a participant changed a decision before final submission.
- **Formula**: for `email_prioritization`, `EmailDecision.change_count`, summed; for `urgent_request`, a client-reported `reconsideration_count` recorded as telemetry only (never affects scoring).
- **Source**: `performance_tracker.py` (email_prioritization), `app/api/tasks.py` (urgent_request telemetry).
- **Unit**: count.
- **Classification**: DERIVED (a count of directly observed reconsideration events).
- **Limitations**: only populated for these two task types; 0 for the others, honestly, not fabricated.

## Workload

- **Definition**: completions per minute of active session time.
- **Formula**: `completions / elapsed_minutes`, where `elapsed_minutes` spans the first to last `InteractionMetric` timestamp.
- **Source**: `performance_tracker.py`.
- **Unit**: completions/minute.
- **Classification**: DERIVED.
- **Note**: computed but not currently surfaced in the participant-facing report; used only as an ARIA-facing telemetry field.

## Pressure score

See `docs/architecture/aria-architecture.md` for the full formula. **Classification: DERIVED / HEURISTIC** — the five component weights (`0.30/0.20/0.15/0.20/0.15`) are a documented design choice, not an empirically fitted model.

## Productivity index

- **Formula** (`backend/app/reports/productivity.py`):
  ```python
  completion_component      = 100 * completed / assigned                      # if assigned > 0
  accuracy_component        = avg_score_overall                               # if not None
  time_efficiency_component = mean( min(100, 100*deadline_seconds/time_taken_seconds) for each completed task with a real deadline )
                               # a task with time_taken_seconds <= 0 scores 100 for this component (no division by zero)
  productivity_index = Σ(component * weight) / Σ(weight of PRESENT components)
  weights = {completion: 0.35, accuracy: 0.35, time_efficiency: 0.30}
  ```
  **Missing-component behavior**: any component whose inputs are unavailable is excluded entirely, and the remaining weights are re-normalized against each other — never defaulted to 0 or 100. Returns `None` only when *no* component is computable (e.g. zero tasks ever assigned).
  **Adapted-deadline note (calibration review finding)**: `deadline_seconds` here is the same adapted, not fixed, value discussed in the Pace section below — it can have been loosened or tightened per the participant's own recent performance (`adaptation.py:adjust_priority_and_deadline`) before this component is computed. `time_efficiency_component` therefore measures performance against a moving expectation, not a stable baseline; this should be kept in mind whenever comparing this component across sessions or across tasks within the same session.
- **Input data**: `Task.status`, `content_score`, `time_taken_seconds`, `deadline_seconds`.
- **Unit**: 0–100.
- **Classification**: DERIVED / HEURISTIC (the three weights are a design choice).
- **Interpretation**: "indice de productivité" — a simulation indicator, not a validated workplace productivity measurement.

## Cognitive-load proxy

- **Formula** (`backend/app/reports/cognitive_load.py`):
  ```python
  task_load = min(100, 100 * time_taken_seconds / deadline_seconds)   # 0 if time_taken_seconds <= 0
  cognitive_load_estimate = mean(task_load) over completed tasks with a real deadline
  ```
  Returns `None` (never a fabricated 0) when no completed task had a real deadline.
- **Input data**: `time_taken_seconds`, `deadline_seconds`.
- **Unit**: 0–100.
- **Classification**: HEURISTIC.
- **Interpretation**: **an estimation/proxy of cognitive load based on temporal task load — how much of the allotted time was consumed — not a direct psychological or physiological measurement of cognitive load.** It ignores error content, task difficulty, and any biometric signal.

## Fatigue indicator

- **Formula** (`backend/app/reports/fatigue.py`):
  ```python
  decline      = clamp(avg_score_first_half - avg_score_second_half, 0, 100)          # 0 if fewer than 2 completed tasks, or improving
  slowdown     = clamp((avg_time_second_half - avg_time_first_half) / avg_time_first_half * 100, 0, 100)  # 0 if <2 tasks or first_half==0
  error_trend  = clamp((Σ error_count[i] * i/(n-1)) / Σ error_count[i] * 100, 0, 100)  # 0 if n<2 or zero errors; position-weighted concentration
  stress       = clamp((peak_declared_stress - 1) / 4 * 100, 0, 100)                   # 0 if never declared; uses the PEAK value, not latest or average
  fatigue_score = round(0.30*decline + 0.20*slowdown + 0.20*error_trend + 0.30*stress)
  ```
- **Input data**: `avg_score_first_half`/`_second_half`, `avg_time_taken_seconds_first_half`/`_second_half`, `error_count_trend`, `StressDeclaration` peak value.
- **Unit**: 0–100 (rounded to an integer).
- **Classification**: HEURISTIC.
- **Interpretation**: **"indicateur heuristique de fatigue" — this formula specifically measures decline (performance getting worse over the session), not absolute badness.** A participant who scores consistently low without ever improving or worsening receives `decline = 0`, identical to someone who improved — a low-but-stable performer and a genuinely fatigued one are not distinguished by this number alone. The four weights (`0.30/0.20/0.20/0.30`) are a documented starting point, explicitly not empirically tuned (see the module's own source comments).

## Declared pressure / stress

- **Definition**: the participant's self-reported perceived pressure level.
- **Formula**: none — a direct 1–5 integer value, range-validated (`ge=1, le=5`) and persisted as-is.
- **Source**: `app/models/stress_declaration.py`, `app/schemas/session.py:StressDeclarationCreate`.
- **Unit**: ordinal scale, 1 (Calm) to 5 (Extremely pressured).
- **Classification**: SELF-REPORTED.
- **Interpretation**: "niveau de pression ressenti / déclaré" — a participant's own subjective report, never described as an objective or clinical stress measurement anywhere in this documentation or in the system's own user-facing text and ARIA prompt instructions.

## Summary classification table

| Metric | Classification |
|---|---|
| Completion rate | DERIVED |
| Accuracy | DERIVED |
| Error rate | DERIVED |
| Execution time | DERIVED |
| Assignment delay | DERIVED |
| Active execution time | DERIVED |
| Pace efficiency | DERIVED |
| Workflow transition time | DERIVED |
| Pause/idle | DERIVED |
| Correction/reconsideration | DERIVED |
| Workload | DERIVED |
| Pressure score | DERIVED / HEURISTIC |
| Productivity index | DERIVED / HEURISTIC |
| Cognitive-load proxy | HEURISTIC |
| Fatigue indicator | HEURISTIC |
| Declared pressure/stress | SELF-REPORTED |
