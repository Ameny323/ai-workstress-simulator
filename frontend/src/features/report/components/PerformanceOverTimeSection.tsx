import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { REPORT_COLORS as C, taskTypeLabelFr } from "../reportTheme";
import type { TaskBreakdownItem } from "../reportTypes";
import { EmptyState, SectionCard, axisTick, tooltipStyle } from "./primitives";

// Discrete per-task samples only -- task_breakdown is a real, ordered list
// of completed Task rows (backend-authoritative), never a fabricated
// continuous time series interpolated from a single scalar (cahier
// section 2's explicit constraint).
export default function PerformanceOverTimeSection({ tasks }: { tasks: TaskBreakdownItem[] }) {
  const completed = tasks.filter((t) => t.status === "completed");
  const data = completed.map((t, i) => ({
    label: `Task ${i + 1}`,
    type: taskTypeLabelFr(t.task_type),
    score: t.content_score,
    time: t.time_taken_seconds,
  }));

  const hasScores = data.some((d) => d.score !== null);
  const hasTimes = data.some((d) => d.time !== null);

  return (
    <SectionCard
      title="Performance over the session"
      subtitle="Score and execution-time trend, task by task, in the real order of completion."
    >
      {data.length === 0 ? (
        <EmptyState>No task completed during this session.</EmptyState>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="report-grid-2">
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}>Score per task</div>
            {hasScores ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: C.border }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v) => [`${v}`, "Score"]}
                    labelFormatter={(label, payload) => `${label} — ${payload?.[0]?.payload?.type ?? ""}`}
                  />
                  <Line type="monotone" dataKey="score" stroke={C.primary} strokeWidth={2.5} dot={{ r: 4, fill: C.primary }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState>No score available for the completed tasks.</EmptyState>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}>Execution time per task (s)</div>
            {hasTimes ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: C.border }} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v) => [`${v}s`, "Time"]}
                    labelFormatter={(label, payload) => `${label} — ${payload?.[0]?.payload?.type ?? ""}`}
                  />
                  <Bar dataKey="time" fill={C.accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState>No execution time available.</EmptyState>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
