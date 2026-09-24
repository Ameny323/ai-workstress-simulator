# WorkPulse AI — Academic Methodology Documentation

## Purpose

This directory documents the academic methodology underlying WorkPulse AI's simulation and analysis, as actually implemented in the frozen codebase. It is written for the PFE (*Projet de Fin d'Études*) technical report and defense, and is intended to be cited or adapted directly.

## Relationship to the architecture documentation

`docs/architecture/` describes **what the system does and how**. This directory describes **what can be legitimately claimed from what the system does** — the methodological framing, the classification of every output by its epistemic status (measured, derived, self-reported, or heuristic), and the limitations that bound any research claim built on this platform.

## Document index

| Document | Covers |
|---|---|
| [research-methodology.md](research-methodology.md) | The research concept, simulation principle, and the observation/interpretation and deterministic/LLM separations |
| [metrics-and-indicators.md](metrics-and-indicators.md) | Every implemented metric, its exact formula, and its classification |
| [behavioral-model.md](behavioral-model.md) | The behavioral evaluation model's academic framing: evolution, signals, synthesis, confidence |
| [experimental-protocol.md](experimental-protocol.md) | The current simulation protocol and the data categories it produces |
| [limitations.md](limitations.md) | Verified methodological, software, deployment, and research limitations |

## Governing principle

No claim in this documentation set exceeds what the code actually computes. Where a plain-language description could be read as a clinical, medical, or psychological claim, the precise, hedged phrasing is used instead — see the "Academic claim discipline" section of `research-methodology.md`.
