import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { REPORT_COLORS as C, STRESS_LEVEL_LABELS_FR } from "../reportTheme";
import type { SessionReportData, StressSummary } from "../reportTypes";
import { EmptyState, MetricCard, MethodologyNote, SectionCard, axisTick, tooltipStyle } from "./primitives";

function minutesSince(startIso: string, iso: string): number {
  return Math.round((new Date(iso).getTime() - new Date(startIso).getTime()) / 60000);
}

// Self-reported only (1-5 scale) -- kept structurally separate from every
// behavioral proxy elsewhere in the report. Never inferred from behavior.
export default function StressSection({
  reportData,
  stress,
}: {
  reportData: SessionReportData;
  stress: StressSummary | null;
}) {
  const points = reportData.stress_declarations;
  const chartData = points.map((p) => ({
    label: `+${minutesSince(reportData.session_started_at, p.declared_at)} min`,
    value: p.value,
  }));

  return (
    <SectionCard title="Declared perceived pressure level" subtitle="Self-assessment on a scale of 1 to 5, declared by the participant.">
      {stress === null ? (
        <EmptyState>No pressure level was declared during this session.</EmptyState>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <MetricCard
              label="Initial level"
              value={`${points[0].value} / 5`}
              caption={STRESS_LEVEL_LABELS_FR[points[0].value]}
            />
            <MetricCard
              label="Last declared level"
              value={`${stress.latest} / 5`}
              caption={STRESS_LEVEL_LABELS_FR[stress.latest]}
              accent={C.mutedDanger}
            />
            <MetricCard
              label="Change"
              value={stress.change_from_first > 0 ? `+${stress.change_from_first}` : String(stress.change_from_first)}
              caption="Change since the first declaration"
            />
            <MetricCard label="Declarations" value={String(stress.declarations_count)} caption="Total number of declarations" />
          </div>
          {chartData.length >= 2 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={C.border} vertical={false} />
                <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: C.border }} tickLine={false} />
                <YAxis domain={[1, 5]} tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [STRESS_LEVEL_LABELS_FR[Number(v)] ?? String(v), "Level"]} />
                <Line type="monotone" dataKey="value" stroke={C.mutedDanger} strokeWidth={2.5} dot={{ r: 4, fill: C.mutedDanger }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState>Only one declaration was recorded -- no evolution to show.</EmptyState>
          )}
        </>
      )}
      <MethodologyNote>
        1 — Calm · 2 — Slightly under pressure · 3 — Moderately under pressure · 4 — Strongly under
        pressure · 5 — Extremely under pressure.
      </MethodologyNote>
    </SectionCard>
  );
}
