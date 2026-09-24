# Methodological Limitations

Each limitation below was verified against the current implementation. None is described as a bug unless it demonstrably is one; none is accompanied by a proposed code change.

## 1. Heuristic weights and thresholds — *methodological limitation*

**What it is**: every weighted formula (productivity 0.35/0.35/0.30, fatigue 0.30/0.20/0.20/0.30, pressure score 0.30/0.20/0.15/0.20/0.15) and every behavioral-evaluation stable-band threshold is a fixed constant chosen at design time.
**Why it matters academically**: composite indices built from unweighted-by-evidence coefficients cannot be defended as validated instruments without external calibration.
**What claim it limits**: any statement that a specific productivity/fatigue/pressure value corresponds to a real-world equivalent quantity.

## 2. No empirical calibration — *methodological limitation*

**What it is**: no threshold or weight anywhere in the codebase was fit against observed data, a validated scale, or a prior study; every relevant docstring self-discloses this.
**Why it matters academically**: this is the single largest limitation of the analytics stack as a research instrument.
**What claim it limits**: any generalization beyond "this is what the simulation's own formulas currently output."

## 3. Six-task default sample — *research limitation*

**What it is**: the default sequence produces only six data points per session, three per early/late half.
**Why it matters academically**: any trend statistic computed from n=3 per half is statistically thin.
**What claim it limits**: strength or reliability claims about any "evolution" label.

## 4. Early/late split limitations — *methodological limitation*

**What it is**: `split_half` is a task-count-based split, not time-based; the pause-evolution boundary can under-count a single pause whose gap straddles the split point.
**Why it matters academically**: the "early vs late" framing is a coarse two-point comparison, not a continuous trend, and boundary-adjacent events may not be attributed to either half.
**What claim it limits**: precision claims about exactly when in the session a change occurred.

## 5. Difficulty normalization absence — *software / methodological limitation*

**What it is**: no scoring, productivity, cognitive-load, fatigue, or pace formula reads `Task.difficulty`.
**Why it matters academically**: a `hard` task and an `easy` task of the same type contribute identically to every composite metric, understating task difficulty as a confound.
**What claim it limits**: cross-task or cross-participant comparisons where difficulty pools may have differed.

## 6. Typing-data availability — *software limitation*

**What it is**: typing telemetry exists only for `email_writing` submissions; the default sequence contains exactly one such task, so typing evolution (which needs ≥2 data points) is `None` for essentially every session run against the default sequence.
**Why it matters academically**: any claim about "typing behavior evolution" cannot currently be supported by the default protocol.
**What claim it limits**: typing-based behavioral claims.

## 7. Legacy timing fallback — *software limitation*

**What it is**: a task that never called `/engage` (legacy sessions predating this feature, or a task that timed out before interaction) has its active-execution-time metric fall back to the older assignment-to-completion measure.
**Why it matters academically**: pace/workflow figures computed from a mix of engaged and legacy-fallback tasks are not on a strictly identical timing basis, though the fallback is explicitly flagged internally.
**What claim it limits**: cross-session comparisons spanning the feature's introduction.

## 8. Self-reported pressure — *research limitation*

**What it is**: the only stress-related input is a 1–5 self-report, collected voluntarily and infrequently.
**Why it matters academically**: self-report is subject to the same reliability considerations as any single-item self-report scale (recall, framing, willingness to disclose), and cannot be treated as an objective physiological signal.
**What claim it limits**: any claim of measured, as opposed to declared, stress.

## 9. Cognitive-load proxy limitation — *methodological limitation*

**What it is**: the cognitive-load estimate is a pure time-ratio (time used ÷ time allocated), with no error, content, or biometric input.
**Why it matters academically**: a fast, correct participant and a fast, careless one who ran out of attention to check their work can produce the same "low load" reading.
**What claim it limits**: any claim that this number reflects actual mental effort rather than time pressure alone.

## 10. Fatigue heuristic limitation — *methodological limitation*

**What it is**: the fatigue formula specifically measures *decline* (getting worse over the session); a consistently low performer who never changes scores 0 on this axis, identical to someone who improved.
**Why it matters academically**: the number cannot distinguish "was never good" from "genuinely fatigued," and must always be read alongside the raw accuracy figures.
**What claim it limits**: standalone interpretation of the fatigue score without its component breakdown.

## 11. Recommendation-rule testing limitation — *software limitation*

**What it is**: the nine recommendation rules have no dedicated unit tests exercising each rule's boundary conditions in isolation; they are only exercised transitively through integration/report tests.
**Why it matters academically**: correctness of each rule's exact trigger condition under edge-case inputs has not been independently verified beyond code review.
**What claim it limits**: confidence that every rule fires exactly as documented under all possible input combinations.

## 12. Single-process WebSocket architecture — *deployment limitation*

**What it is**: the real-time connection registry is in-memory and single-process (see `docs/architecture/websocket-architecture.md`).
**Why it matters academically**: not directly relevant to research validity, but relevant to any claim about the platform's readiness for multi-instance or high-concurrency deployment.
**What claim it limits**: scalability claims about the current implementation.

## 13. Legacy / dormant task and database components — *software limitation*

**What it is**: `TaskStatus.expired` (enum value), the `image_matching` task type (no frontend), and three database models (`PerformanceIndicator`, `Report`, `Recommendation`) exist in the schema/codebase with no live application-code call path.
**Why it matters academically**: not a functional defect (nothing currently depends on them), but a reader inspecting the schema or enum definitions in isolation could mistakenly infer these represent active functionality.
**What claim it limits**: any inventory of "what the system does" must exclude these unless their status is stated explicitly, as done throughout this documentation set.
