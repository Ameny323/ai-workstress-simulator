import { REPORT_COLORS as C } from "../reportTheme";
import type { BehavioralMetrics, TypingMetricsSummary } from "../reportTypes";
import { EmptyState, MetricCard, MethodologyNote, SectionCard } from "./primitives";

export default function InteractionBehaviorSection({
  typingMetrics,
  behavioralMetrics,
}: {
  typingMetrics: TypingMetricsSummary | null;
  behavioralMetrics: BehavioralMetrics;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Only rendered when typing_metrics != null -- no fake zero values
          for a session with no email-writing task (cahier section 9). */}
      {typingMetrics !== null && (
        <SectionCard
          title="Typing behavior"
          subtitle="These indicators only describe typing activity during tasks that require a written response."
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <MetricCard label="Characters typed" value={String(typingMetrics.total_character_count)} />
            <MetricCard label="Average speed" value={`${typingMetrics.average_chars_per_second} chars/s`} />
            <MetricCard label="Speed variation" value={String(typingMetrics.average_typing_speed_variation)} />
            <MetricCard label="Pauses while typing" value={String(typingMetrics.total_pause_count_during_typing)} />
          </div>
          <MethodologyNote>
            A speed variation was observed during writing. These indicators only describe typing activity --
            they are not interpreted psychologically.
          </MethodologyNote>
        </SectionCard>
      )}

      <SectionCard
        title="Pauses and idle periods"
        subtitle="An idle period is detected when a prolonged gap is observed between two interaction events."
      >
        {behavioralMetrics.pause_count === 0 ? (
          <EmptyState>No prolonged idle period was detected.</EmptyState>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <MetricCard label="Pauses detected" value={String(behavioralMetrics.pause_count)} accent={C.accent} />
            <MetricCard
              label="Total duration"
              value={`${Math.round(behavioralMetrics.total_pause_duration_seconds)}s`}
            />
            {behavioralMetrics.average_pause_duration_seconds !== null && (
              <MetricCard label="Average duration" value={`${behavioralMetrics.average_pause_duration_seconds}s`} />
            )}
          </div>
        )}
        <MethodologyNote>
          These observations are interaction indicators -- they are not interpreted as psychological
          symptoms.
        </MethodologyNote>
      </SectionCard>
    </div>
  );
}
