# Behavioral Model — Academic Framing

This document is the academic companion to `docs/architecture/behavioral-evaluation.md`; that document is the technical reference, this one frames it methodologically. Formulas and thresholds are not repeated in full here — see the architecture document for exact source.

## Conceptual model

```
RAW DATA → TASK METRICS → SESSION METRICS → EARLY/LATE EVOLUTION → SIGNAL INTERPRETATION → SYNTHESIS → RECOMMENDATIONS
```

Each arrow is a concrete, named function in `backend/app/reports/behavioral_evaluation.py`; no step is skipped and no step re-derives raw data that an earlier step already computed (e.g. performance evolution reuses `aggregation.py`'s existing first/second-half score split rather than recomputing it).

## Why an early/late comparison

A single session-wide average cannot distinguish a participant who performed consistently from one who started well and declined, or vice versa. Splitting the session's task sequence into a first and second half (`split_half`, described precisely in the architecture document) is the model's operational definition of "evolution" — a coarse, two-point comparison, not a continuous trend line. This is a deliberate simplification appropriate to a six-task default session, not a claim of finer-grained trend detection.

## The seven evolution categories

Performance, pace, errors, pauses, workflow, stress, and typing (see the architecture document for exact triggers and data requirements). Each yields one of a small, fixed vocabulary of labels (e.g. `IMPROVING`/`STABLE`/`DECLINING`), never a continuous score, and always `INSUFFICIENT_DATA` rather than a fabricated label when too little data exists.

## The eight behavioral signals

Each signal is a conjunction of two or three of the evolution labels above (e.g. `SLOW_INACCURATE` = pace slowing AND performance declining AND errors increasing). They are descriptive combinations, not new measurements — every signal can be traced back to the specific evolution labels that caused it to fire (`supporting_signals` on each `BehavioralObservation`).

## Synthesis and its priority order

When several signals fire simultaneously, the model reports exactly one as the `primary_observation`, selected by a fixed priority order that ranks accuracy/quality-concerning combinations above neutral or positive ones. This priority order is a **presentation choice about what to surface first**, not an implicit claim about which pattern is more scientifically significant. All fired signals remain visible in the full `observations` list regardless of which one is chosen as primary.

## Confidence as evidence coverage

The model reports a confidence band (`INSUFFICIENT_DATA`/`LOW`/`MODERATE`/`HIGH`) based solely on how many tasks were completed — a direct proxy for how much data the early/late split rests on. **This is not a statistical confidence interval and does not imply any probability calculation.** No hypothesis test, p-value, or inferential statistic is computed anywhere in this model. The label exists specifically so that a six-task session's necessarily thin evidence base is never presented with unwarranted certainty.

## Non-diagnostic scope

The behavioral model is explicitly restricted to descriptive, deterministic pattern-matching over already-computed metrics. It contains no clinical vocabulary, no personality classification, and no single aggregate "behavior score" — each output remains decomposable into the specific evolution metrics that produced it. It must not be presented, in the PFE report or elsewhere, as a diagnostic or predictive psychological instrument.
