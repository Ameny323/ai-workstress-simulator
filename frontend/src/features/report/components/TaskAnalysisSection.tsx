import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { REPORT_COLORS as C, TASK_STATUS_LABELS_FR, taskTypeLabelFr } from "../reportTheme";
import type { TaskBreakdownItem } from "../reportTypes";
import { EmptyState, SectionCard, axisTick, tooltipStyle } from "./primitives";

function formatTime(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function TaskAnalysisSection({
  errorsByType,
  tasks,
}: {
  errorsByType: Record<string, number>;
  tasks: TaskBreakdownItem[];
}) {
  const errorData = Object.entries(errorsByType).map(([type, count]) => ({
    label: taskTypeLabelFr(type),
    count,
  }));
  const totalErrors = errorData.reduce((sum, d) => sum + d.count, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionCard title="Error analysis" subtitle="Number of errors detected, by task type.">
        {errorData.length === 0 ? (
          <EmptyState>No error recorded during this simulation.</EmptyState>
        ) : totalErrors === 0 ? (
          <EmptyState>No error recorded during this simulation.</EmptyState>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, errorData.length * 42)}>
            <BarChart data={errorData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
              <CartesianGrid stroke={C.border} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={160} tick={axisTick} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill={C.mutedDanger} radius={[0, 4, 4, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      <SectionCard title="Completed task detail">
        {tasks.length === 0 ? (
          <EmptyState>No task completed during this session.</EmptyState>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.secondary, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  <th style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}` }}>Task</th>
                  <th style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}` }}>Score</th>
                  <th style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}` }}>Time</th>
                  <th style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}` }}>Errors</th>
                  <th style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}` }}>Status</th>
                  <th style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}` }}>Time of day</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.task_id}>
                    <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, color: C.text, fontWeight: 500 }}>
                      {taskTypeLabelFr(t.task_type)}
                    </td>
                    <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, color: C.text }}>
                      {t.content_score !== null ? `${t.content_score}%` : "--"}
                    </td>
                    <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, color: C.text }}>
                      {t.time_taken_seconds !== null ? `${t.time_taken_seconds}s` : "--"}
                    </td>
                    <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, color: t.error_count > 0 ? C.mutedDanger : C.text }}>
                      {t.error_count}
                    </td>
                    <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, color: C.secondary }}>
                      {TASK_STATUS_LABELS_FR[t.status] ?? t.status}
                    </td>
                    <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, color: C.secondary }}>
                      {formatTime(t.completed_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
