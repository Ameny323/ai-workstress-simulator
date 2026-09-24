import { REPORT_COLORS as C } from "../reportTheme";
import type { BehavioralEvaluation, EvolutionMetric } from "../reportTypes";
import { EmptyState, MethodologyNote, Pill, SectionCard } from "./primitives";

// Renders the backend's authoritative behavioral interpretation
// (app/reports/behavioral_evaluation.py via BehavioralEvaluationOut) --
// this component performs NO classification of its own: every label,
// evolution direction, observation, and confidence level shown here is
// exactly what the backend computed. See CockpitPage/FinalSummarySection
// for the project's standing rule that the frontend renders, it never
// decides (cahier's own "backend is the authoritative analytical layer").

const EVOLUTION_LABELS_FR: Record<string, string> = {
  IMPROVING: "Improving",
  DECLINING: "Declining",
  ACCELERATING: "Accelerating",
  SLOWING: "Slowing",
  INCREASING: "Increasing",
  DECREASING: "Decreasing",
  STABLE: "Stable",
  INSUFFICIENT_DATA: "Insufficient data",
};

const EVOLUTION_COLORS: Record<string, string> = {
  IMPROVING: C.mutedSuccess,
  ACCELERATING: C.mutedSuccess,
  DECREASING: C.mutedSuccess,
  DECLINING: C.mutedDanger,
  SLOWING: C.mutedWarning,
  INCREASING: C.mutedWarning,
  STABLE: C.secondary,
  INSUFFICIENT_DATA: C.secondary,
};

const CONFIDENCE_LABELS_FR: Record<string, string> = {
  HIGH: "High",
  MODERATE: "Moderate",
  LOW: "Low",
  INSUFFICIENT_DATA: "Insufficient data",
};

function EvolutionRow({ label, metric, unit }: { label: string; metric: EvolutionMetric; unit?: string }) {
  const color = EVOLUTION_COLORS[metric.evolution] ?? C.secondary;
  const fmt = (v: number | null) => (v === null ? "--" : `${v}${unit ?? ""}`);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 0",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <span style={{ fontSize: 12.5, color: C.text, fontWeight: 500 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {metric.evolution !== "INSUFFICIENT_DATA" && (
          <span style={{ fontSize: 11.5, color: C.secondary }}>
            {fmt(metric.early_value)} → {fmt(metric.late_value)}
          </span>
        )}
        <Pill text={EVOLUTION_LABELS_FR[metric.evolution] ?? metric.evolution} color={color} />
      </div>
    </div>
  );
}

export default function BehavioralInterpretationSection({ evaluation }: { evaluation: BehavioralEvaluation | null }) {
  if (evaluation === null) {
    return (
      <SectionCard
        title="Behavioral interpretation"
        subtitle="Analysis of the behavior evolution observed between the start and end of the simulation."
      >
        <EmptyState>Insufficient data to produce a behavioral interpretation for this session.</EmptyState>
      </SectionCard>
    );
  }

  const { primary_observation, observations, confidence, typing } = evaluation;
  const confidenceColor =
    confidence === "HIGH" ? C.mutedSuccess : confidence === "MODERATE" ? C.primary : confidence === "LOW" ? C.mutedWarning : C.secondary;

  return (
    <SectionCard
      title="Behavioral interpretation"
      subtitle="Deterministic analysis of the behavior evolution observed between the start and end of the simulation -- computed by the server, never by the language model."
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        {primary_observation ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.secondary, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Primary observation
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginTop: 2 }}>{primary_observation.title}</div>
            <div style={{ fontSize: 12.5, color: C.text, marginTop: 3, lineHeight: 1.5, maxWidth: 560 }}>
              {primary_observation.description}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: C.secondary }}>No primary observation could be determined for this session.</div>
        )}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.secondary, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Confidence level
          </div>
          <div style={{ marginTop: 4 }}>
            <Pill text={CONFIDENCE_LABELS_FR[confidence] ?? confidence} color={confidenceColor} />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }} className="report-grid-2">
        <div>
          <EvolutionRow label="Performance" metric={evaluation.performance} unit="%" />
          <EvolutionRow label="Execution pace" metric={evaluation.pace} />
          <EvolutionRow label="Errors (per task)" metric={evaluation.errors} />
        </div>
        <div>
          <EvolutionRow label="Pauses (per task)" metric={evaluation.pauses} />
          <EvolutionRow label="Transitions between tasks" metric={evaluation.workflow} unit="s" />
          <EvolutionRow label="Declared pressure evolution" metric={evaluation.stress} />
        </div>
      </div>

      {typing !== null && (
        <div style={{ marginTop: 4 }}>
          <EvolutionRow label="Typing speed" metric={typing.speed} unit=" chars/s" />
          <EvolutionRow label="Typing speed variation" metric={typing.variation} />
        </div>
      )}

      {observations.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.secondary, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
            Observed signals
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {observations.map((obs) => (
              <div key={obs.code} style={{ padding: "8px 12px", background: C.background, borderRadius: 8, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{obs.title}</div>
                <div style={{ fontSize: 11.5, color: C.secondary, marginTop: 2, lineHeight: 1.45 }}>{obs.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <MethodologyNote>{evaluation.disclaimer}</MethodologyNote>
    </SectionCard>
  );
}
