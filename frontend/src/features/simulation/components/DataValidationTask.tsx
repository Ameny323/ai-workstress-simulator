import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/api/client";
import type { TaskCompletionResult } from "@/components/task/TaskCompletionScreen";

// Real data_validation workspace -- same visual language as CockpitPage's
// own document_organization/email_prioritization panels (rounded-xl white
// cards, #D9E2E8 borders, #718493 secondary labels), self-contained like
// the email prioritization task: owns its own countdown, submission, and
// completion, and calls back once POST /tasks/{id}/complete resolves.
// Mirrors backend/app/tasks/data_validation.py's real contract exactly --
// instance_data = {columns, records: [{id, ...fields, is_valid}]},
// submission = {flagged_ids: number[]}.
interface DataValidationRecord {
  id: number;
  is_valid: boolean;
  [field: string]: string | number | boolean;
}

export interface DataValidationTaskData {
  id: string;
  title: string;
  description: string | null;
  instance_data: {
    columns: string[];
    records: DataValidationRecord[];
  };
  deadline_seconds: number | null;
}

interface DataValidationTaskProps {
  task: DataValidationTaskData;
  onCompleted: (result: TaskCompletionResult) => void;
}

const DEFAULT_TOTAL_TIME = 240;

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function DataValidationTask({ task, onCompleted }: DataValidationTaskProps) {
  const { columns, records } = task.instance_data;
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const totalTime = task.deadline_seconds && task.deadline_seconds > 0 ? task.deadline_seconds : DEFAULT_TOTAL_TIME;
  const [remaining, setRemaining] = useState(totalTime);
  const autoSubmitted = useRef(false);
  const checkedRef = useRef(checked);
  checkedRef.current = checked;

  const flaggedCount = Object.values(checked).filter(Boolean).length;
  const timerUrgent = remaining < Math.round(totalTime * 0.25);
  const timerWarning = !timerUrgent && remaining < Math.round(totalTime * 0.5);

  // The one authoritative, server-side engagement signal (POST
  // /tasks/{id}/engage -- see app/api/tasks.py's engage_task) -- fired
  // exactly once, on the first genuine data interaction, never on mount/
  // render. The endpoint itself is idempotent, but this ref keeps it from
  // even being called more than once per task instance.
  const engagedRef = useRef(false);
  const engage = () => {
    if (engagedRef.current) return;
    engagedRef.current = true;
    void apiRequest(`/tasks/${task.id}/engage`, { method: "POST" }).catch(() => {
      /* best-effort telemetry -- a failed engagement ping must never block the task */
    });
  };

  const toggle = (recordId: number) => {
    engage();
    setChecked((prev) => ({ ...prev, [recordId]: !prev[recordId] }));
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const flaggedIds = Object.entries(checkedRef.current)
        .filter(([, isFlagged]) => isFlagged)
        .map(([id]) => Number(id));
      const result = await apiRequest<{
        content_score: number | null;
        time_taken_seconds: number | null;
        error_count: number;
      }>(`/tasks/${task.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ flagged_ids: flaggedIds }),
      });
      onCompleted({
        contentScore: result.content_score,
        timeTakenSeconds: result.time_taken_seconds,
        errorCount: result.error_count,
        timedOut: autoSubmitted.current,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit");
      setSubmitting(false);
    }
  };

  useEffect(() => {
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
  }, [remaining, submitting]);

  return (
    <div className="flex flex-col lg:flex-row gap-4 flex-1">
      <div className="flex flex-col rounded-xl overflow-hidden flex-1" style={{ background: "#fff", border: "1px solid #D9E2E8" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid #D9E2E8" }}>
          <div className="text-[9px] font-semibold tracking-widest uppercase mb-1" style={{ color: "#718493" }}>
            Data Validation
          </div>
          <h2 className="text-base font-semibold mb-1.5" style={{ color: "#243746" }}>{task.title}</h2>
          {task.description && (
            <p className="text-[11px] leading-relaxed max-w-lg" style={{ color: "#718493" }}>{task.description}</p>
          )}
          <p className="text-[11px] mt-1.5" style={{ color: "#587A92" }}>
            Instructions: identify and check the records whose data is invalid or malformed.
          </p>
        </div>

        <div className="flex items-center justify-between px-5 py-2.5" style={{ borderBottom: "1px solid #D9E2E8", background: "#F7F9FB" }}>
          <span className="text-[10px]" style={{ color: "#718493" }}>{records.length} records</span>
          <div className="flex items-center gap-3">
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded"
              style={{ background: "rgba(88,122,146,0.09)", color: "#587A92" }}
            >
              {flaggedCount} flagged
            </span>
            <span
              className="text-[11px] font-semibold tabular-nums"
              style={{ color: timerUrgent ? "#B97878" : timerWarning ? "#B89A61" : "#243746" }}
            >
              {fmtTime(remaining)}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-2 py-2">
          <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th className="text-[9px] font-semibold uppercase tracking-wide px-3 py-2" style={{ color: "#718493" }}>
                  Review
                </th>
                {columns.map((col) => (
                  <th key={col} className="text-[9px] font-semibold uppercase tracking-wide px-3 py-2" style={{ color: "#718493" }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const isChecked = !!checked[record.id];
                return (
                  <tr
                    key={record.id}
                    style={{
                      background: isChecked ? "rgba(185,120,120,0.05)" : "#fff",
                      borderTop: "1px solid #F3F6F8",
                    }}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(record.id)}
                        disabled={submitting}
                        aria-label={`Flag record ${record.id} as invalid`}
                        style={{ cursor: submitting ? "default" : "pointer" }}
                      />
                    </td>
                    {columns.map((col) => (
                      <td key={col} className="text-[11px] px-3 py-2.5" style={{ color: "#243746" }}>
                        {String(record[col] ?? "")}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid #D9E2E8", background: "#F7F9FB" }}>
          <span className="text-[10px]" style={{ color: submitError ? "#B97878" : "#718493" }}>
            {submitError ?? "Check each record before submitting."}
          </span>
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="text-[11px] px-4 py-1.5 rounded-lg font-semibold tracking-wide"
            style={{
              background: submitting ? "#D9E2E8" : "#587A92",
              color: submitting ? "#718493" : "#fff",
              cursor: submitting ? "default" : "pointer",
            }}
          >
            {submitting ? "Envoi…" : "SUBMIT TASK →"}
          </button>
        </div>
      </div>
    </div>
  );
}
