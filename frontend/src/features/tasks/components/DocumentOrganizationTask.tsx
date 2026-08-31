import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/api/client";

interface DocumentRecord {
  id: number;
  filename: string;
  correct_category: string;
  [field: string]: string | number;
}

interface DocumentOrganizationInstanceData {
  categories: string[];
  records: DocumentRecord[];
}

// Shape of the raw JSON returned by GET /sessions/{id}/next-task for a
// document_organization task (the backend's TaskOut schema).
export interface DocumentOrganizationTaskData {
  id: string;
  type: string;
  title: string;
  description: string | null;
  instance_data: DocumentOrganizationInstanceData;
  deadline_seconds: number | null;
  priority: string;
  difficulty: string | null;
  status: string;
}

interface DocumentOrganizationTaskProps {
  task: DocumentOrganizationTaskData;
  onSubmitted?: () => void;
}

// Same fallback table as ValidationTask, kept in sync deliberately —
// both task types share the same pressure-ramp-by-difficulty design.
const DIFFICULTY_FALLBACK_SECONDS: Record<string, number> = {
  easy: 300,
  medium: 210,
  hard: 120,
};

function resolveDurationSeconds(task: DocumentOrganizationTaskData): number {
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

export default function DocumentOrganizationTask({ task, onSubmitted }: DocumentOrganizationTaskProps) {
  const { categories, records } = task.instance_data;
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const totalSeconds = useMemo(() => resolveDurationSeconds(task), [task]);
  const [remaining, setRemaining] = useState(totalSeconds);
  const autoSubmitted = useRef(false);
  const assignmentsRef = useRef(assignments);
  assignmentsRef.current = assignments;

  const assign = (recordId: number, category: string) => {
    if (submitted) return;
    setAssignments((prev) => ({ ...prev, [recordId]: category }));
  };

  const assignedCount = Object.keys(assignments).length;

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiRequest(`/tasks/${task.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ assignments: assignmentsRef.current }),
      });
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  // Same per-task countdown + auto-submit-on-timeout behavior as ValidationTask.
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
            Document Organization
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
            {assignedCount}/{records.length} sorted
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

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {records.map((record) => (
          <div
            key={record.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.06)",
              background: assignments[record.id] ? "rgba(91,132,198,0.04)" : "transparent",
              transition: "background 0.15s",
            }}
          >
            <span style={{ fontSize: 16 }}>📄</span>
            <span style={{ flex: 1, fontSize: 13, color: "#1A2B3C", fontWeight: 500 }}>{record.filename}</span>
            <select
              value={assignments[record.id] ?? ""}
              onChange={(e) => assign(record.id, e.target.value)}
              disabled={submitted}
              style={{
                padding: "6px 10px",
                borderRadius: 7,
                border: "1px solid rgba(0,0,0,0.1)",
                fontSize: 12.5,
                color: assignments[record.id] ? "#1A2B3C" : "#94a3b8",
                background: "white",
                cursor: submitted ? "default" : "pointer",
                minWidth: 150,
              }}
            >
              <option value="" disabled>
                Choose category...
              </option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: submitError ? "#c0505a" : "#94a3b8" }}>
          {submitError
            ? submitError
            : submitted
              ? autoSubmitted.current
                ? "Time's up — submitted automatically."
                : "Submitted — waiting for the next task."
              : `${records.length} documents, ${assignedCount} sorted so far.`}
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
