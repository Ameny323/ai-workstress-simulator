# WorkPulse AI — Architecture Documentation

## Status

This documentation describes the **frozen implementation** of WorkPulse AI as it exists in the current codebase (backend: 401/401 checks passing, frontend: 111/111 tests passing, TypeScript clean, build clean, sequential-task E2E 34/34, behavioral-evaluation E2E 68/68). It was produced by a read-only audit of the actual source code, not from design intentions or prior specifications.

## Source-of-truth principle

Wherever this documentation might disagree with an earlier design document, a comment, or a README, **the current code is authoritative**. Every architectural statement in this documentation set was verified against a specific source file before being written. Capabilities are labeled explicitly:

- **Implemented** — built, wired, and reachable through the running system.
- **Implemented but not default** — built and reachable, but not part of the default participant path (e.g. `email_prioritization`).
- **Dormant / legacy** — code or schema that exists but has no live call path (e.g. `TaskStatus.expired`, the `Report`/`PerformanceIndicator`/`Recommendation` database models).
- **Future / not implemented** — code that exists in a pre-built form but is not invoked anywhere (e.g. `generate_debrief`), or a capability that does not exist at all (e.g. empirically calibrated thresholds).

No functionality is described as active unless a concrete call path was traced from a user action to that functionality.

## Purpose of this documentation set

This documentation is the technical reference for:

1. The PFE (*Projet de Fin d'Études*) technical report
2. The PFE defense/presentation
3. Future maintenance of the codebase
4. The academic methodology baseline (see `docs/methodology/`)

## High-level architecture: the seven layers

The implementation is organized, in practice, into seven layers. This is a descriptive model reconstructed from the code, not a name any module declares:

| Layer | Responsibility | Primary modules |
|---|---|---|
| 1 — Simulation | Session and task lifecycle, sequencing, timing | `Session`, `Task`, `task_engine.py`, `sequence_config.py` |
| 2 — Observation | Raw telemetry capture | `InteractionMetric`, `StressDeclaration`, timestamps on `Task` |
| 3 — Metrics | Deterministic quantitative indicators | `aggregation.py`, `productivity.py`, `cognitive_load.py`, `fatigue.py`, `performance_tracker.py` |
| 4 — Behavioral Evaluation | Early/late evolution, descriptive signals, synthesis | `behavioral_evaluation.py` |
| 5 — Adaptive Supervision | ARIA's finite-state machine and trigger policy | `simulation_fsm.py`, `aria_policy.py` |
| 6 — Language Generation | Natural-language wording for ARIA messages | `prompt_builder.py`, `openai_service.py` |
| 7 — Results | Report assembly and recommendations | `sessions.py` (`get_session_report`), `recommendations/engine.py` |

**Important boundary**: Layer 6 (Language Generation) currently feeds only Layer 5's ARIA messages. It is **not** wired into Layer 7 — the final report contains no LLM-generated narrative today. A pre-built function for a future debrief narrative (`generate_debrief`) exists but has zero call sites (see `docs/architecture/openai-integration.md`).

Layers 1–5 and 7 are entirely deterministic. Layer 6 is the only place natural-language generation occurs, and it never writes back into layers 1–5 or 7's numeric/state outputs — see each document's own "LLM boundary" section for the verified evidence.

## Document index

| Document | Covers |
|---|---|
| [system-architecture.md](system-architecture.md) | Frontend/backend/database stack, component responsibilities |
| [runtime-architecture.md](runtime-architecture.md) | Full request/response and parallel-pipeline runtime flow |
| [session-and-task-engine.md](session-and-task-engine.md) | Sequential task engine, timing model, task-type inventory |
| [telemetry-and-analytics.md](telemetry-and-analytics.md) | `InteractionMetric` model, raw/derived/interpreted data layers |
| [behavioral-evaluation.md](behavioral-evaluation.md) | Evolution metrics, behavioral signals, synthesis, confidence |
| [aria-architecture.md](aria-architecture.md) | Pressure score, FSM, trigger policy, hysteresis |
| [openai-integration.md](openai-integration.md) | LLM boundary, prompt construction, fallback behavior |
| [websocket-architecture.md](websocket-architecture.md) | Real-time channel, auth, reconnect, event types |
| [reporting-and-recommendations.md](reporting-and-recommendations.md) | Report assembly, the 9 recommendation rules |
| [security-architecture.md](security-architecture.md) | Authentication, authorization, verified controls |

Methodology documents live in [`docs/methodology/`](../methodology/README.md).

## Traceability table

| Architectural concept | Implementation location |
|---|---|
| Default task sequence | `backend/app/core/sequence_config.py` |
| Sequential task engine | `backend/app/api/tasks.py` (`get_next_task`, `submit_task`), `backend/app/orchestrators/task_engine.py` |
| Task engagement timestamp | `backend/app/api/tasks.py` (`engage_task`) |
| Telemetry model | `backend/app/models/interaction_metric.py` |
| Session/behavioral metrics | `backend/app/reports/aggregation.py`, `productivity.py`, `cognitive_load.py`, `fatigue.py`, `backend/app/orchestrators/performance_tracker.py` |
| Behavioral evaluation | `backend/app/reports/behavioral_evaluation.py` |
| ARIA finite-state machine | `backend/app/orchestrators/simulation_fsm.py` |
| ARIA trigger policy | `backend/app/orchestrators/aria_policy.py` |
| ARIA/behavioral shared configuration | `backend/app/core/aria_config.py` |
| OpenAI integration | `backend/app/ai/openai_service.py`, `backend/app/ai/prompt_builder.py` |
| WebSocket channel | `backend/app/main.py` (`/ws/sessions/{session_id}`), `backend/app/ws/connection_manager.py` |
| Report assembly | `backend/app/api/sessions.py` (`get_session_report`) |
| Recommendation engine | `backend/app/recommendations/engine.py` |
| Stress declaration | `backend/app/api/sessions.py` (`declare_stress`), `backend/app/models/stress_declaration.py` |
| Cockpit (frontend simulation UI) | `frontend/src/features/simulation/CockpitPage.tsx` |
| ARIA panel (frontend) | `frontend/src/features/simulation/components/AISupervisorPanel.tsx` |
| Report UI (frontend) | `frontend/src/features/report/SessionReportPage.tsx` |
