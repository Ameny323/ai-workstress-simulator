# Experimental Protocol (Current Implementation)

This document describes the simulation protocol **as it is currently implemented and runnable**. It does not describe a study that has been conducted; no participant counts, control groups, or statistical results exist in this codebase, and none are asserted here.

## Session initialization

A participant registers or logs in, then starts a session (`POST /sessions/`). The backend stamps the session with the fixed default task sequence and a 1800-second global duration at this moment; nothing about the sequence or duration is client-configurable.

## Fixed default sequence

`data_validation → data_validation → document_organization → document_organization → email_writing → urgent_request` — six tasks, in this exact order, for every session created with default configuration.

## Maximum duration

1800 seconds (30 minutes) for the whole session, checked at every task-retrieval call; independently, each individual task also carries its own per-task deadline (`Task.deadline_seconds`).

## Participant task interaction

The participant is shown exactly one task at a time, works within its own real interface, and submits it through the same generic completion endpoint every task type shares.

## Task engagement

The frontend signals the participant's first genuine interaction with a task via `POST /tasks/{id}/engage`, establishing the timing baseline described in `docs/architecture/session-and-task-engine.md`.

## Completion

Each submission is scored immediately and deterministically against the task's own generated ground truth; the sequence advances by exactly one position.

## Perceived-pressure declarations

At any point during an active session, the participant may declare a 1–5 perceived pressure level, subject to a minimum re-declaration interval (default 300 seconds) and rejected once the simulation content has ended.

## ARIA interactions

Throughout the session, the participant may receive short natural-language messages from ARIA, reflecting the deterministically-computed supervision tone at that moment (see `docs/architecture/aria-architecture.md`).

## Session completion

After the sixth task, or if the global timer expires first, no further tasks are assigned and the session enters its debriefing phase. The participant (or the frontend, automatically) then calls the session-end endpoint, after which the report becomes available.

## Report generation

The report aggregates the session's quantitative results, behavioral interpretation, and recommendations, as described in `docs/architecture/reporting-and-recommendations.md`.

## Data categories produced

### Objective / behavioral data
Task assignment/engagement/completion timestamps, submitted answers, computed correctness, error counts, telemetry events (typing metrics, reconsiderations, pauses).

### Self-reported data
The participant's declared pressure level(s), with their timestamp and session phase at declaration.

### System-generated indicators
Every derived metric (§ `metrics-and-indicators.md`) and every behavioral-evaluation classification (§ `behavioral-model.md`), computed entirely from the two categories above.

## Potential future validation — FUTURE

The current implementation does not include: a control condition, a validated comparison against an established stress or productivity instrument, inter-rater or test-retest reliability analysis, or any empirical calibration of the heuristic weights described in `docs/methodology/metrics-and-indicators.md`. Any of these would constitute a **future** validation study built on top of the current platform; none currently exists in this codebase, and this document makes no claim that they do.
