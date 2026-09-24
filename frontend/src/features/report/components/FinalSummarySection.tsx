import { REPORT_COLORS as C, taskTypeLabelFr } from "../reportTheme";
import type { SessionAnalytics } from "../reportTypes";
import { SectionCard } from "./primitives";

// Deterministic selection over already backend-computed fields -- no new
// metric or formula is introduced here, only presentation logic (which
// existing number to lead with). Never an LLM-generated paragraph (cahier
// section 13's explicit constraint): every sentence below is a template
// filled from a real value already present in `report`.
function strongPoint(report: SessionAnalytics): string {
  const { productivity_index, report_data } = report;
  if (report_data.avg_score_overall !== null && report_data.avg_score_overall >= 80) {
    return `A high average accuracy (${report_data.avg_score_overall}%) was maintained throughout the simulation.`;
  }
  if (productivity_index !== null && productivity_index >= 80) {
    return `A high productivity index (${productivity_index}/100) was observed over the whole session.`;
  }
  if (report.fatigue_score < 25 && report_data.total_tasks_completed >= 2) {
    return "A steady work pace was maintained, with few signs of decline.";
  }
  return `${report_data.total_tasks_completed} task(s) were completed during this session.`;
}

function attentionPoint(report: SessionAnalytics): string {
  const { behavioral_metrics, fatigue_score } = report;
  const errorEntries = Object.entries(behavioral_metrics.errors_by_type).filter(([, count]) => count > 0);
  if (errorEntries.length > 0) {
    const [type, count] = errorEntries.sort((a, b) => b[1] - a[1])[0];
    return `Errors were observed on tasks of type "${taskTypeLabelFr(type)}" (${count}).`;
  }
  if (fatigue_score >= 50) {
    return `The behavioral fatigue indicator (${fatigue_score}/100) is notable for this session.`;
  }
  return "No major point of attention was detected during this session.";
}

// Reads the BACKEND's own performance-evolution classification
// (app/reports/behavioral_evaluation.py's compute_performance_evolution,
// via behavioral_evaluation.performance) instead of independently
// re-deriving "improved/declined/stable" from a locally-chosen threshold
// -- this was previously the one place in the report that duplicated the
// backend's classification logic with its own, non-centralized diff>5/-5
// check; the audit that found this gap is why it was removed.
function mainEvolution(report: SessionAnalytics): string {
  const { stress, behavioral_evaluation } = report;
  const performance = behavioral_evaluation?.performance;
  if (performance && performance.evolution !== "INSUFFICIENT_DATA" && performance.change !== null) {
    const diff = performance.change;
    if (performance.evolution === "IMPROVING") return `Accuracy improved between the first and second half of the session (+${diff.toFixed(0)} points).`;
    if (performance.evolution === "DECLINING") return `Accuracy decreased between the first and second half of the session (${diff.toFixed(0)} points).`;
    return "Accuracy stayed stable between the start and end of the session.";
  }
  if (stress !== null && stress.change_from_first !== 0) {
    return `The declared pressure level changed by ${stress.change_from_first > 0 ? "+" : ""}${stress.change_from_first} point(s) over the course of the session.`;
  }
  return "Not enough data to identify a meaningful trend.";
}

export default function FinalSummarySection({ report }: { report: SessionAnalytics }) {
  const items = [
    { label: "Strength observed", text: strongPoint(report), color: C.mutedSuccess },
    { label: "Point of attention", text: attentionPoint(report), color: C.mutedWarning },
    { label: "Main trend", text: mainEvolution(report), color: C.primary },
  ];

  return (
    <SectionCard title="What your simulation shows">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((item) => (
          <div key={item.label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: item.color, marginTop: 6, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.secondary, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {item.label}
              </div>
              <div style={{ fontSize: 13, color: C.text, marginTop: 2, lineHeight: 1.5 }}>{item.text}</div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
