import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/api/client";
import type { TaskCompletionResult } from "@/components/task/TaskCompletionScreen";

// Real email_prioritization workspace, moved verbatim out of
// CockpitPage.tsx into its own self-contained component as part of
// unifying the cockpit onto one task-loading flow (see CockpitPage.tsx's
// top-of-file note). Kept SEPARATE from the four cahier-required task
// types and the default sequence (data_validation/document_organization/
// email_writing/urgent_request) -- this remains a real, working,
// additional task type, just not currently invoked by the sequence-driven
// dispatch. Its own dedicated backend surface (create-or-resume,
// email list/detail, decision POST/PATCH, complete+results) is
// structurally different from the generic TaskOut contract the other four
// share, which is why it fetches its own sub-resources here rather than
// receiving a flat instance_data blob.
type EmailPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

interface EmailSummaryData {
  id: string;
  sender: string;
  sender_role: string;
  subject: string;
  received_at: string | null;
  has_attachment: boolean;
  context_tags: string[];
}

interface EmailDetailData extends EmailSummaryData {
  body: string;
  deadline: string | null;
  attachments: string[];
}

interface EmailDecisionData {
  id: string;
  email_id: string;
  selected_priority: EmailPriority;
  score: number;
  was_correct: boolean;
  accuracy_level: string;
  decision_time_ms: number | null;
  change_count: number;
  changed_decision: boolean;
}

export interface EmailPrioritizationTaskData {
  id: string;
  deadline_seconds: number | null;
}

interface EmailPrioritizationResults {
  total_emails: number;
  exact_accuracy: number;
  weighted_decision_score: number;
  misprioritized_decisions: number;
  severely_misprioritized_decisions: number;
}

interface EmailPrioritizationTaskProps {
  task: EmailPrioritizationTaskData;
  onCompleted: (result: TaskCompletionResult) => void;
}

const PRIORITY_STYLES: Record<EmailPriority, { bg: string; text: string; border: string }> = {
  CRITICAL: { bg: "#FDF0F0", text: "#B97878", border: "#B97878" },
  HIGH: { bg: "#FDF6EC", text: "#B89A61", border: "#B89A61" },
  NORMAL: { bg: "#F0F4F7", text: "#587A92", border: "#587A92" },
  LOW: { bg: "#F2F5F3", text: "#719887", border: "#719887" },
};

export default function EmailPrioritizationTask({ task, onCompleted }: EmailPrioritizationTaskProps) {
  const [emails, setEmails] = useState<EmailSummaryData[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<EmailDetailData | null>(null);
  const [decisions, setDecisions] = useState<Record<string, EmailDecisionData>>({});
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completing, setCompleting] = useState(false);

  const totalTime = task.deadline_seconds && task.deadline_seconds > 0 ? task.deadline_seconds : 480;
  const [remaining, setRemaining] = useState(totalTime);
  const autoCompleted = useRef(false);
  const completedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest<EmailSummaryData[]>(`/email-prioritization/tasks/${task.id}/emails`)
      .then((data) => {
        if (!cancelled) setEmails(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load emails");
      });
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  const selectEmail = async (id: string) => {
    setSelectedEmailId(id);
    try {
      const detail = await apiRequest<EmailDetailData>(`/email-prioritization/tasks/${task.id}/emails/${id}`);
      setSelectedEmail(detail);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to open email");
    }
  };

  const handleComplete = async () => {
    if (completing || completedRef.current) return;
    completedRef.current = true;
    setCompleting(true);
    try {
      await apiRequest(`/email-prioritization/tasks/${task.id}/complete`, { method: "POST" });
      const results = await apiRequest<EmailPrioritizationResults>(`/email-prioritization/tasks/${task.id}/results`);
      onCompleted({
        contentScore: Math.round(results.weighted_decision_score * 100),
        timeTakenSeconds: totalTime - remaining,
        errorCount: results.misprioritized_decisions + results.severely_misprioritized_decisions,
        timedOut: autoCompleted.current,
      });
    } catch (err) {
      completedRef.current = false;
      setLoadError(err instanceof Error ? err.message : "Failed to complete task");
      setCompleting(false);
    }
  };

  const decide = async (priority: EmailPriority) => {
    if (!selectedEmailId || submitting) return;
    setSubmitting(true);
    const existing = decisions[selectedEmailId];
    try {
      const method = existing ? "PATCH" : "POST";
      const decision = await apiRequest<EmailDecisionData>(
        `/email-prioritization/tasks/${task.id}/emails/${selectedEmailId}/decision`,
        { method, body: JSON.stringify({ selected_priority: priority }) }
      );
      setDecisions((prev) => ({ ...prev, [selectedEmailId]: decision }));

      if (!existing) {
        const count = Object.keys(decisions).length + 1;
        if (count === emails.length) {
          void handleComplete();
        }
      }

      setPendingConfirm(selectedEmailId);
      setTimeout(() => {
        setPendingConfirm(null);
        if (!existing) {
          const nextUndecided = emails.find((e) => e.id !== selectedEmailId && !decisions[e.id]);
          if (nextUndecided) void selectEmail(nextUndecided.id);
        }
      }, 1200);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to record decision");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (remaining <= 0) {
      if (!autoCompleted.current && !completedRef.current) {
        autoCompleted.current = true;
        void handleComplete();
      }
      return;
    }
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const decision = selectedEmailId ? decisions[selectedEmailId] : undefined;
  const timerUrgent = remaining < Math.round(totalTime * 0.2);
  const timerWarning = !timerUrgent && remaining < Math.round(totalTime * 0.4);

  return (
    <div className="flex flex-1 gap-4 overflow-hidden">
      <div className="w-72 shrink-0 flex flex-col rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid #D9E2E8" }}>
        <div className="px-4 py-2 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid #D9E2E8", background: "#fff" }}>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#243746" }}>INBOX</span>
            <span className="text-[9px] ml-2" style={{ color: "#718493" }}>{emails.length} messages</span>
          </div>
          <span
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: timerUrgent ? "#B97878" : timerWarning ? "#B89A61" : "#243746" }}
          >
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {emails.length === 0 && !loadError && (
            <div className="px-4 py-4 text-[10px]" style={{ color: "#718493" }}>Loading emails…</div>
          )}
          {emails.map((e) => {
            const dec = decisions[e.id];
            const isSelected = selectedEmailId === e.id;
            return (
              <div
                key={e.id}
                onClick={() => void selectEmail(e.id)}
                className="px-4 py-2.5 cursor-pointer transition-colors"
                style={{ borderBottom: "1px solid #F3F6F8", background: isSelected ? "rgba(88,122,146,0.05)" : "#fff", borderLeft: isSelected ? "2px solid #587A92" : "2px solid transparent" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] truncate font-medium" style={{ color: !dec ? "#243746" : "#718493" }}>{e.sender}</span>
                </div>
                <div className="text-[10px] truncate mt-0.5" style={{ color: !dec ? "#243746" : "#718493" }}>{e.subject}</div>
                {dec && (
                  <span
                    className="text-[8px] px-1.5 py-px rounded font-medium mt-1 inline-block"
                    style={{ background: PRIORITY_STYLES[dec.selected_priority].bg, color: PRIORITY_STYLES[dec.selected_priority].text }}
                  >
                    {dec.selected_priority}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden rounded-xl" style={{ background: "#fff", border: "1px solid #D9E2E8" }}>
        {!selectedEmail ? (
          <div className="flex-1 flex items-center justify-center text-[11px]" style={{ color: loadError ? "#B97878" : "#718493" }}>
            {loadError ?? "Select an email to read it and set its priority."}
          </div>
        ) : (
          <>
            <div className="px-5 py-3 shrink-0" style={{ borderBottom: "1px solid #D9E2E8" }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[11px] font-semibold" style={{ color: "#243746" }}>{selectedEmail.sender}</div>
                  <div className="text-[9px]" style={{ color: "#718493" }}>{selectedEmail.sender_role}</div>
                </div>
              </div>
              <div className="mt-2 text-[12px] font-semibold" style={{ color: "#243746" }}>{selectedEmail.subject}</div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="text-[11px] leading-relaxed whitespace-pre-line" style={{ color: "#243746" }}>{selectedEmail.body}</div>
            </div>
            <div className="px-5 py-3 shrink-0" style={{ borderTop: "1px solid #D9E2E8", background: "#F7F9FB" }}>
              {pendingConfirm === selectedEmailId ? (
                <div className="flex items-center gap-2 py-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#719887" }} />
                  <span className="text-[11px] font-medium" style={{ color: "#719887" }}>Priority recorded.</span>
                </div>
              ) : (
                <>
                  <div className="text-[9px] uppercase tracking-widest mb-2" style={{ color: "#718493" }}>
                    {decision ? "Update Priority" : "Set Priority"}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {(["CRITICAL", "HIGH", "NORMAL", "LOW"] as EmailPriority[]).map((p) => {
                      const s = PRIORITY_STYLES[p];
                      const isActive = decision?.selected_priority === p;
                      return (
                        <button
                          key={p}
                          onClick={() => void decide(p)}
                          disabled={submitting}
                          className="px-3 py-1.5 text-[10px] font-medium rounded transition-all"
                          style={{ background: isActive ? s.bg : "#fff", color: s.text, border: `1px solid ${isActive ? s.border : "#D9E2E8"}`, cursor: submitting ? "default" : "pointer" }}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
