import { REPORT_COLORS as C, STRESS_LEVEL_LABELS_FR } from "../reportTheme";
import type { SessionAnalytics } from "../reportTypes";
import { MetricCard, SectionCard } from "./primitives";

// Only ever renders a metric the backend actually returned -- no fallback
// values, no invented numbers (cahier section 1: "Only display a metric
// if the backend actually provides it").
export default function SynthesisSection({ report }: { report: SessionAnalytics }) {
  const { report_data, productivity_index, fatigue_score, stress } = report;
  const completionRate =
    report_data.total_tasks_assigned > 0
      ? Math.round((report_data.total_tasks_completed / report_data.total_tasks_assigned) * 100)
      : null;

  return (
    <SectionCard title="Summary" subtitle="Overview of this session's key indicators.">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {productivity_index !== null && (
          <MetricCard
            label="Performance"
            value={`${productivity_index} / 100`}
            caption="Overall behavioral index"
            accent={C.primary}
          />
        )}
        {report_data.avg_score_overall !== null && (
          <MetricCard
            label="Accuracy"
            value={`${report_data.avg_score_overall}%`}
            caption="Average task accuracy"
          />
        )}
        {completionRate !== null && (
          <MetricCard label="Completion" value={`${completionRate}%`} caption="Tasks completed / assigned" />
        )}
        <MetricCard label="Fatigue" value={`${fatigue_score} / 100`} caption="Behavioral indicator" accent={C.mutedWarning} />
        {stress !== null && (
          <MetricCard
            label="Declared pressure"
            value={`${stress.latest} / 5`}
            caption={`Last declared level — ${STRESS_LEVEL_LABELS_FR[stress.latest] ?? ""}`}
            accent={C.mutedDanger}
          />
        )}
      </div>
    </SectionCard>
  );
}
