import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/api/client";
import type { TaskCompletionResult } from "@/components/task/TaskCompletionScreen";

// Real urgent_request workspace -- same visual language as CockpitPage's
// other self-contained task components. Mirrors
// backend/app/tasks/urgent_request.py's real contract exactly:
// instance_data = {sender, sender_role, subject, message, urgency,
// options: [{id, label}], correct_action}, submission =
// {selected_action, reconsideration_count}. correct_action is present in
// instance_data (this project's established precedent -- see
// document_organization's correct_category) but never rendered; the
// deterministic backend scorer is what actually decides correctness.
interface UrgentRequestOption {
  id: string;
  label: string;
}

export interface UrgentRequestInstanceData {
  sender: string;
  sender_role: string;
  subject: string;
  message: string;
  urgency: number;
  options: UrgentRequestOption[];
  correct_action: string;
}

export interface UrgentRequestTaskData {
  id: string;
  title: string;
  description: string | null;
  instance_data: UrgentRequestInstanceData;
  deadline_seconds: number | null;
}

interface UrgentRequestTaskProps {
  task: UrgentRequestTaskData;
  onCompleted: (result: TaskCompletionResult) => void;
}

const DEFAULT_TOTAL_TIME = 150;

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function UrgentRequestTask({ task, onCompleted }: UrgentRequestTaskProps) {
  const instance = task.instance_data;
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const reconsiderationCount = useRef(0);
  const previousSelection = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  const totalTime = task.deadline_seconds && task.deadline_seconds > 0 ? task.deadline_seconds : DEFAULT_TOTAL_TIME;
  const [remaining, setRemaining] = useState(totalTime);
  const autoSubmitted = useRef(false);

  const timerUrgent = remaining < Math.round(totalTime * 0.25);
  const timerWarning = !timerUrgent && remaining < Math.round(totalTime * 0.5);

  // The one authoritative, server-side engagement signal (POST
  // /tasks/{id}/engage) -- fired exactly once, on the first genuine
  // option selection, never on mount/render.
  const engagedRef = useRef(false);
  const engage = () => {
    if (engagedRef.current) return;
    engagedRef.current = true;
    void apiRequest(`/tasks/${task.id}/engage`, { method: "POST" }).catch(() => {});
  };

  const choose = (optionId: string) => {
    if (submitting) return;
    engage();
    // Only a genuine CHANGE of a prior selection counts as a
    // reconsideration -- the first pick is never one.
    if (previousSelection.current !== null && previousSelection.current !== optionId) {
      reconsiderationCount.current += 1;
    }
    previousSelection.current = optionId;
    setSelected(optionId);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await apiRequest<{
        content_score: number | null;
        time_taken_seconds: number | null;
        error_count: number;
      }>(`/tasks/${task.id}/complete`, {
        method: "POST",
        body: JSON.stringify({
          selected_action: selectedRef.current,
          reconsideration_count: reconsiderationCount.current,
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
                Urgent Request
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

        <div className="overflow-auto px-5 py-4" style={{ borderBottom: "1px solid #D9E2E8", background: "#F7F9FB" }}>
          <div
            className="rounded-lg px-3.5 py-3"
            style={{ background: "#fff", border: `1px solid ${instance.urgency >= 4 ? "rgba(185,120,120,0.35)" : "#D9E2E8"}` }}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: instance.urgency >= 4 ? "#B97878" : "#B89A61" }}
              />
              <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: instance.urgency >= 4 ? "#B97878" : "#B89A61" }}>
                Urgency {instance.urgency}/5
              </span>
            </div>
            <p className="text-[11.5px] leading-relaxed whitespace-pre-line" style={{ color: "#243746" }}>{instance.message}</p>
          </div>
        </div>

        <div className="flex-1 flex flex-col px-5 py-4">
          <div className="text-[9px] font-semibold tracking-widest uppercase mb-2.5" style={{ color: "#718493" }}>
            Choose the appropriate response
          </div>
          <div role="radiogroup" aria-label="Response options" className="flex flex-col gap-2">
            {instance.options.map((option) => {
              const isSelected = selected === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={submitting}
                  onClick={() => choose(option.id)}
                  className="text-left px-3.5 py-2.5 rounded-lg text-[12px]"
                  style={{
                    border: `1.5px solid ${isSelected ? "#587A92" : "#D9E2E8"}`,
                    background: isSelected ? "rgba(88,122,146,0.08)" : "#fff",
                    color: isSelected ? "#243746" : "#4B5A6A",
                    fontWeight: isSelected ? 600 : 400,
                    cursor: submitting ? "default" : "pointer",
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-auto pt-4">
            <span className="text-[10px]" style={{ color: submitError ? "#B97878" : "#718493" }}>
              {submitError ?? (selected ? "Answer selected." : "Select an answer to continue.")}
            </span>
            <button
              onClick={() => void handleSubmit()}
              disabled={submitting || !selected}
              className="text-[11px] px-4 py-1.5 rounded-lg font-semibold tracking-wide"
              style={{
                background: submitting || !selected ? "#D9E2E8" : "#587A92",
                color: submitting || !selected ? "#718493" : "#fff",
                cursor: submitting || !selected ? "default" : "pointer",
              }}
            >
              {submitting ? "Envoi…" : "Respond →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
