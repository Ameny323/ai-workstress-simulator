import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/api/client";
import type { TaskCompletionResult } from "@/components/task/TaskCompletionScreen";
import { useTypingTelemetry } from "../useTypingTelemetry";

// Real email_writing composer -- same visual language as CockpitPage's
// own document_organization/email_prioritization panels. Mirrors
// backend/app/tasks/email_writing.py's real contract: instance_data
// carries the task BRIEF (sender/subject/context/original_request/
// objective/required_points/forbidden_points), never an answer key to
// hide -- the participant still has to actually write the response.
// Typing telemetry is aggregate-only (useTypingTelemetry) -- the raw
// typed text travels separately as written_response, never as telemetry.
export interface EmailWritingInstanceData {
  sender: string;
  sender_role: string;
  subject: string;
  context: string;
  original_request: string;
  objective: string;
  urgency: number;
  required_points: string[];
  forbidden_points: string[];
  min_length: number;
  max_length: number;
}

export interface EmailWritingTaskData {
  id: string;
  title: string;
  description: string | null;
  instance_data: EmailWritingInstanceData;
  deadline_seconds: number | null;
}

interface EmailWritingTaskProps {
  task: EmailWritingTaskData;
  onCompleted: (result: TaskCompletionResult) => void;
}

const DEFAULT_TOTAL_TIME = 360;

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function EmailWritingTask({ task, onCompleted }: EmailWritingTaskProps) {
  const instance = task.instance_data;
  const [responseText, setResponseText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { recordKeystroke, computeMetrics } = useTypingTelemetry();

  // The one authoritative, server-side engagement signal (POST
  // /tasks/{id}/engage) -- fired exactly once, on the first genuine
  // editor keystroke, never on mount/render.
  const engagedRef = useRef(false);
  const engage = () => {
    if (engagedRef.current) return;
    engagedRef.current = true;
    void apiRequest(`/tasks/${task.id}/engage`, { method: "POST" }).catch(() => {});
  };

  const totalTime = task.deadline_seconds && task.deadline_seconds > 0 ? task.deadline_seconds : DEFAULT_TOTAL_TIME;
  const [remaining, setRemaining] = useState(totalTime);
  const autoSubmitted = useRef(false);
  const responseRef = useRef(responseText);
  responseRef.current = responseText;

  const timerUrgent = remaining < Math.round(totalTime * 0.25);
  const timerWarning = !timerUrgent && remaining < Math.round(totalTime * 0.5);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const finalText = responseRef.current;
      const typingMetrics = computeMetrics(finalText);
      const result = await apiRequest<{
        content_score: number | null;
        time_taken_seconds: number | null;
        error_count: number;
      }>(`/tasks/${task.id}/complete`, {
        method: "POST",
        body: JSON.stringify({
          written_response: finalText,
          ...(typingMetrics ? { typing_metrics: typingMetrics } : {}),
        }),
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
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[9px] font-semibold tracking-widest uppercase mb-1" style={{ color: "#718493" }}>
                Email Writing
              </div>
              <h2 className="text-base font-semibold mb-1" style={{ color: "#243746" }}>{task.title}</h2>
            </div>
            <span
              className="text-[11px] font-semibold tabular-nums shrink-0"
              style={{ color: timerUrgent ? "#B97878" : timerWarning ? "#B89A61" : "#243746" }}
            >
              {fmtTime(remaining)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2 text-[11px]" style={{ color: "#718493" }}>
            <div><span style={{ color: "#8D88A8" }}>From:</span> {instance.sender} <span style={{ color: "#B7C2CB" }}>({instance.sender_role})</span></div>
            <div><span style={{ color: "#8D88A8" }}>Subject:</span> {instance.subject}</div>
          </div>
        </div>

        <div className="overflow-auto px-5 py-4" style={{ borderBottom: "1px solid #D9E2E8" }}>
          {instance.context && (
            <p className="text-[11.5px] leading-relaxed mb-2" style={{ color: "#243746" }}>{instance.context}</p>
          )}
          {instance.original_request && (
            <div className="rounded-lg px-3 py-2.5 mb-2" style={{ background: "#F3F6F8", borderLeft: "2px solid #D9E2E8" }}>
              <div className="text-[9px] uppercase tracking-wide mb-1" style={{ color: "#718493" }}>Received request</div>
              <p className="text-[11.5px] leading-relaxed whitespace-pre-line" style={{ color: "#243746" }}>{instance.original_request}</p>
            </div>
          )}
          {instance.objective && (
            <p className="text-[11px] mb-2" style={{ color: "#587A92" }}>Objectif : {instance.objective}</p>
          )}
          {instance.required_points.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {instance.required_points.map((point) => (
                <span
                  key={point}
                  className="text-[9.5px] px-2 py-0.5 rounded"
                  style={{ background: "rgba(88,122,146,0.09)", color: "#587A92" }}
                >
                  {point}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col px-5 py-4" style={{ background: "#F7F9FB" }}>
          <div className="text-[9px] font-semibold tracking-widest uppercase mb-2" style={{ color: "#718493" }}>
            Response
          </div>
          <textarea
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            onKeyDown={() => { engage(); recordKeystroke(); }}
            disabled={submitting}
            placeholder="Write your reply here..."
            className="flex-1 w-full text-[12px] rounded-lg p-3 resize-none"
            style={{ minHeight: 160, background: "#fff", border: "1px solid #D9E2E8", color: "#243746" }}
          />
          <div className="flex items-center justify-between mt-2.5">
            <span className="text-[10px]" style={{ color: submitError ? "#B97878" : "#718493" }}>
              {submitError ?? `${responseText.length} characters`}
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
              {submitting ? "Envoi…" : "Send Reply →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
