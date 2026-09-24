import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { REPORT_COLORS as C } from "../reportTheme";
import type { SessionAnalytics } from "../reportTypes";
import { EmptyState, MetricCard, MethodologyNote, SectionCard, axisTick, tooltipStyle } from "./primitives";

function Methodology({ children }: { children: string }) {
  return (
    <details style={{ marginTop: 10 }}>
      <summary style={{ fontSize: 11.5, fontWeight: 600, color: C.primary, cursor: "pointer" }}>
        How this indicator is calculated
      </summary>
      <MethodologyNote>{children}</MethodologyNote>
    </details>
  );
}

export default function BehavioralIndicatorsSection({ report }: { report: SessionAnalytics }) {
  const { productivity_index, cognitive_load_estimate, fatigue_score, report_data } = report;

  const hasHalfSplit = report_data.avg_score_first_half !== null || report_data.avg_score_second_half !== null;
  const degradationData = [
    { label: "Initial performance", score: report_data.avg_score_first_half },
    { label: "Final performance", score: report_data.avg_score_second_half },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionCard title="Productivity">
        {productivity_index !== null ? (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <MetricCard label="Productivity index" value={`${productivity_index} / 100`} accent={C.primary} />
              {report_data.avg_score_overall !== null && (
                <MetricCard label="Completion / accuracy" value={`${report_data.avg_score_overall}%`} caption="Average accuracy" />
              )}
              {report_data.avg_time_taken_seconds_overall !== null && (
                <MetricCard label="Time efficiency" value={`${report_data.avg_time_taken_seconds_overall}s`} caption="Average time per task" />
              )}
            </div>
            <Methodology>
              Behavioral index computed from the completion, accuracy, and time efficiency observed during
              the simulation. Time efficiency is measured against the time allotted to each task -- a time
              that may itself have been adjusted during the session based on recent performance, not a fixed
              reference. This is not a universal law but an indicator specific to this session.
            </Methodology>
          </>
        ) : (
          <EmptyState>Not enough completed tasks to compute a productivity index.</EmptyState>
        )}
      </SectionCard>

      <SectionCard title="Estimated cognitive load">
        {cognitive_load_estimate !== null ? (
          <>
            <MetricCard label="Estimated cognitive load" value={`${cognitive_load_estimate} / 100`} accent={C.subtleAi} />
            <Methodology>
              Indicator of task-related time load, based solely on the ratio between the time used and the
              time allotted for each task (a time that may itself have been adjusted during the session).
              This is not a direct, psychological, or neuroscientific measurement of actual cognitive load,
              but a behavioral indicator (proxy) built from the observed time.
            </Methodology>
          </>
        ) : (
          <EmptyState>No task with a defined deadline was completed: indicator unavailable.</EmptyState>
        )}
      </SectionCard>

      <SectionCard title="Fatigue and performance evolution">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: hasHalfSplit ? 16 : 0 }}>
          <MetricCard label="Fatigue index" value={`${fatigue_score} / 100`} caption="Behavioral indicator" accent={C.mutedWarning} />
        </div>
        {hasHalfSplit ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={degradationData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={C.border} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: C.border }} tickLine={false} />
              <YAxis domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="score" fill={C.mutedWarning} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState>Not enough completed tasks to compare the start and end of the session.</EmptyState>
        )}
        <MethodologyNote>
          Evolution observed between the first and second half of the session. This indicator estimates a
          gradual decline in the performance observed during the simulation -- it is not a measurement of
          mental fatigue.
        </MethodologyNote>
      </SectionCard>
    </div>
  );
}
