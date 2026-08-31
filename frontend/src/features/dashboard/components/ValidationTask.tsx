import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/api/client";

interface ValidationRecord {
  id: number;
  is_valid: boolean;
  [field: string]: string | number | boolean;
}

interface ValidationInstanceData {
  columns: string[];
  records: ValidationRecord[];
}

// Shape of the raw JSON returned by GET /sessions/{id}/next-task
// (the backend's TaskOut schema), not the app's curated Task UI type.
export interface ValidationTaskData {
  id: string;
  type: string;
  title: string;
  description: string | null;
  instance_data: ValidationInstanceData;
  deadline_seconds: number | null;
  priority: string;
  difficulty: string | null;
  status: string;
}

interface ValidationTaskProps {
  task: ValidationTaskData;
  onSubmitted?: () => void;
}

// Harder tasks get a shorter clock — that's the pressure ramp the
// simulator is built around. Only used when the backend didn't already
// send a deadline_seconds for this task.
const DIFFICULTY_FALLBACK_SECONDS: Record<string, number> = {
  easy: 300,
  medium: 210,
  hard: 120,
};

function resolveDurationSeconds(task: ValidationTaskData): number {
  if (task.deadline_seconds && task.deadline_seconds > 0) return task.deadline_seconds;
  const key = (task.difficulty ?? "medium").toLowerCase();
  return DIFFICULTY_FALLBACK_SECONDS[key] ?? 240;
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function ValidationTask({ task, onSubmitted }: ValidationTaskProps) {
  const { columns, records } = task.instance_data;
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const totalSeconds = useMemo(() => resolveDurationSeconds(task), [task]);
  const [remaining, setRemaining] = useState(totalSeconds);
  const autoSubmitted = useRef(false);
  const checkedRef = useRef(checked);
  checkedRef.current = checked;

  const toggle = (recordId: number) => {
    if (submitted) return;
    setChecked((prev) => ({ ...prev, [recordId]: !prev[recordId] }));
  };

  const flaggedCount = Object.values(checked).filter(Boolean).length;

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const flaggedIds = Object.entries(checkedRef.current)
        .filter(([, isFlagged]) => isFlagged)
        .map(([id]) => Number(id));
      await apiRequest(`/tasks/${task.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ flagged_ids: flaggedIds }),
      });
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  // Per-task countdown. When it hits zero the task is auto-submitted with
  // whatever is currently flagged, then TasksPage moves on to the next one.
  useEffect(() => {
    if (submitted) return;
    if (remaining <= 0) {
      if (!autoSubmitted.current && !submitting) {
        autoSubmitted.current = true;
        void handleSubmit();
      }
      return;
    }
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, submitted, submitting]);

  const timeRatio = totalSeconds > 0 ? remaining / totalSeconds : 1;
  const timerColor = timeRatio <= 0.25 ? "#c0505a" : timeRatio <= 0.5 ? "#c98a2c" : "#5B84C6";
  const timerBg = timeRatio <= 0.25 ? "rgba(192,80,90,0.1)" : timeRatio <= 0.5 ? "rgba(201,138,44,0.1)" : "rgba(91,132,198,0.08)";

  return (
    <div
      className="glass-card"
      style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: "#5B84C6",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              marginBottom: 6,
            }}
          >
            Data Validation
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1A2B3C", margin: 0, letterSpacing: "-0.025em" }}>
            {task.title}
          </h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: timerColor,
              background: timerBg,
              padding: "5px 12px",
              borderRadius: 99,
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3.5 2" strokeLinecap="round" />
            </svg>
            {submitted ? "Done" : formatClock(remaining)}
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#5B84C6",
              background: "rgba(91,132,198,0.08)",
              padding: "5px 12px",
              borderRadius: 99,
              whiteSpace: "nowrap",
            }}
          >
            {flaggedCount} flagged
          </span>
        </div>
      </div>

      {!submitted && (
        <div style={{ height: 4, borderRadius: 99, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${Math.max(0, Math.min(100, timeRatio * 100))}%`,
              background: timerColor,
              borderRadius: 99,
              transition: "width 1s linear, background 0.3s",
            }}
          />
        </div>
      )}

      {task.description && (
        <p style={{ margin: 0, fontSize: 13.5, color: "#4B5A6A", lineHeight: 1.6 }}>{task.description}</p>
      )}

      <div style={{ overflowX: "auto", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "rgba(0,0,0,0.02)" }}>
              <th
                style={{
                  textAlign: "left",
                  padding: "10px 14px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#6B7A8D",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Flag
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  style={{
                    textAlign: "left",
                    padding: "10px 14px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#6B7A8D",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                <td style={{ padding: "10px 14px" }}>
                  <input
                    type="checkbox"
                    checked={!!checked[record.id]}
                    onChange={() => toggle(record.id)}
                    disabled={submitted}
                    style={{ cursor: submitted ? "default" : "pointer" }}
                  />
                </td>
                {columns.map((col) => (
                  <td key={col} style={{ padding: "10px 14px", color: "#1A2B3C" }}>
                    {String(record[col] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: submitError ? "#c0505a" : "#94a3b8" }}>
          {submitError
            ? submitError
            : submitted
              ? autoSubmitted.current
                ? "Time's up — submitted automatically."
                : "Submitted — waiting for the next task."
              : `${records.length} records, ${flaggedCount} flagged so far.`}
        </span>
        <button
          onClick={() => void handleSubmit()}
          disabled={submitting || submitted}
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            border: "none",
            background: submitted ? "rgba(34,197,94,0.15)" : "linear-gradient(135deg, #5B84C6, #8D74FF)",
            color: submitted ? "#16a34a" : "white",
            fontWeight: 700,
            fontSize: 13,
            cursor: submitting || submitted ? "default" : "pointer",
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitted ? "Submitted ✓" : submitting ? "Submitting..." : "Submit Answers"}
        </button>
      </div>
    </div>
  );
}
