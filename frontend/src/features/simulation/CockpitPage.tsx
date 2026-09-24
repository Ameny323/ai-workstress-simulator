import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { apiRequest, ApiError } from "@/api/client";
import { useSimulationWebSocket } from "@/hooks/useSimulationWebSocket";
import type { SimulationEvent, StressDeclaredEvent } from "@/services/websocket/websocketTypes";
import { useManagerMessages } from "./hooks/useManagerMessages";
import { useSessionTelemetry } from "./hooks/useSessionTelemetry";
import AISupervisorPanel from "./components/AISupervisorPanel";
import DataValidationTask, { type DataValidationTaskData } from "./components/DataValidationTask";
import DocumentOrganizationTask, { type DocumentOrganizationTaskData } from "./components/DocumentOrganizationTask";
import EmailWritingTask, { type EmailWritingTaskData } from "./components/EmailWritingTask";
import UrgentRequestTask, { type UrgentRequestTaskData } from "./components/UrgentRequestTask";
import type { TaskCompletionResult } from "@/components/task/TaskCompletionScreen";

// Front-office task cockpit -- the ONLY task UI routed at /tasks, and now
// a CONTROLLED SEQUENTIAL SIMULATION rather than a free multi-tab
// workspace: the backend decides which task is active
// (GET /sessions/{id}/next-task -- see app/api/tasks.py's get_next_task),
// from Session.task_sequence/task_sequence_position
// (app/core/sequence_config.py's configurable default). This page NEVER
// chooses or reorders tasks; it only ever fetches "whatever is current"
// and renders whichever self-contained component matches its type.
//
// One unified flow for all four cahier-required task types
// (data_validation, document_organization, email_writing, urgent_request)
// -- no more per-type load functions, no more clickable tabs. The left
// rail is a read-only progress indicator, not navigation.
//
// email_prioritization remains a real, separate, working task type (see
// EmailPrioritizationTask.tsx) but is deliberately NOT part of the
// default sequence and is never fetched by this flow -- kept, not
// deleted, per explicit instruction.
//
// ARIA supervisor panel: the real backend supervisor (WebSocket +
// GET manager-messages/performance-snapshot), unchanged by this pass --
// see AISupervisorPanel.tsx + useManagerMessages/useSessionTelemetry/
// useSimulationWebSocket. Task sequence position never influences tone
// directly; the FSM remains the sole authority for that.

type TaskType = "data_validation" | "document_organization" | "email_writing" | "urgent_request";

interface SequencedTask {
  id: string;
  type: TaskType;
  title: string;
  description: string | null;
  instance_data: Record<string, unknown>;
  deadline_seconds: number | null;
  sequence_index: number | null;
  sequence_total: number | null;
  remaining_global_seconds: number | null;
}

type CockpitScreen = "loading" | "active" | "error" | "finished";

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  data_validation: "Data Validation",
  document_organization: "Document Organization",
  email_writing: "Email Writing",
  urgent_request: "Urgent Request",
};

function fmtTime(s: number): string {
  const m = Math.floor(Math.max(0, s) / 60);
  const sec = Math.max(0, s) % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function PulseWaveform({ className = "", color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg className={className} width="56" height="18" viewBox="0 0 56 18" fill="none">
      <polyline
        points="0,9 7,9 10,3 13,15 16,5 20,13 24,7 28,9 56,9"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.55"
      />
    </svg>
  );
}

export default function CockpitPage() {
  const { ensureSession, abandonSession, finishSession, user, isAuthenticated } = useApp();
  const navigate = useNavigate();
  const [showExitPrompt, setShowExitPrompt] = useState(false);
  const [exiting, setExiting] = useState(false);

  const [screen, setScreen] = useState<CockpitScreen>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentTask, setCurrentTask] = useState<SequencedTask | null>(null);
  const [lastResult, setLastResult] = useState<TaskCompletionResult | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [taskTransitionCounter, setTaskTransitionCounter] = useState(0);
  const [latestStressEvent, setLatestStressEvent] = useState<StressDeclaredEvent | null>(null);
  const isSessionActive = sessionId !== null && screen !== "finished";

  const {
    messages: ariaMessages,
    awaitingNewMessage: ariaAwaitingNewMessage,
    showAnalyzing: ariaShowAnalyzing,
    appendOrUpdateMessage: ariaAppendOrUpdateMessage,
  } = useManagerMessages(sessionId ?? "", isSessionActive, taskTransitionCounter);
  const { telemetry: ariaTelemetry, applyServerState: ariaApplyServerState } = useSessionTelemetry(
    sessionId ?? "",
    taskTransitionCounter
  );
  const handleSimulationEvent = useCallback(
    (event: SimulationEvent) => {
      switch (event.type) {
        case "aria_analyzing":
          ariaShowAnalyzing();
          break;
        case "aria_message":
          ariaAppendOrUpdateMessage({
            id: event.id,
            session_id: event.session_id,
            content: event.content,
            tone: event.tone,
            sent_at: event.sent_at,
            trigger_context: { trigger: event.trigger },
            was_fallback: event.was_fallback,
            is_read: false,
          });
          break;
        case "state_update":
          ariaApplyServerState(event);
          break;
        case "stress_declared":
          setLatestStressEvent(event);
          break;
      }
    },
    [ariaShowAnalyzing, ariaAppendOrUpdateMessage, ariaApplyServerState]
  );
  const { status: ariaConnectionStatus } = useSimulationWebSocket(sessionId, isSessionActive, handleSimulationEvent);

  // Fixed gap (cross-module architecture audit): a WebSocket drop mid-task
  // left no way to catch up on any aria_message/state_update broadcast
  // during the outage -- useManagerMessages/useSessionTelemetry only
  // re-fetch on a real task transition (taskTransitionCounter), never on
  // reconnect. Bumping the SAME counter the instant the socket comes back
  // from "reconnecting" forces both hooks' existing REST catch-up fetch
  // (GET manager-messages / GET performance-snapshot) without adding a
  // second refresh mechanism or touching the WebSocket/backend at all.
  const previousConnectionStatusRef = useRef(ariaConnectionStatus);
  useEffect(() => {
    if (previousConnectionStatusRef.current === "reconnecting" && ariaConnectionStatus === "connected") {
      setTaskTransitionCounter((c) => c + 1);
    }
    previousConnectionStatusRef.current = ariaConnectionStatus;
  }, [ariaConnectionStatus]);

  // ── Load whatever the backend says is the current task -- one unified
  // flow for all four sequence-driven task types. The backend is fully
  // authoritative: this never sends a task_type, never decides what's
  // next, and treats a 409 (sequence complete / global time expired) as
  // "the simulation is over," not an error.
  const loadCurrentTask = useCallback(async () => {
    setScreen("loading");
    setLoadError(null);
    const realSessionId = await ensureSession();
    if (!realSessionId) {
      setLoadError("Could not start a session.");
      setScreen("error");
      return;
    }
    setSessionId(realSessionId);
    try {
      const task = await apiRequest<SequencedTask>(`/sessions/${realSessionId}/next-task`);
      setCurrentTask(task);
      setTaskTransitionCounter((c) => c + 1);
      setScreen("active");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Sequence complete or global time expired -- a real, expected
        // end state, not a failure. Finalize the real backend session
        // (existing /end mechanism, unchanged) and head to the report.
        setCurrentTask(null);
        setScreen("finished");
        try {
          await finishSession();
        } finally {
          navigate(`/sessions/${realSessionId}/report`);
        }
        return;
      }
      console.error("Could not load the current task", err);
      setLoadError(err instanceof Error ? err.message : "Failed to load task");
      setScreen("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadCurrentTask();
    // Runs once on mount only -- loadCurrentTask is intentionally excluded
    // from deps (see the identical rationale this page has always used).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTaskCompleted = (result: TaskCompletionResult) => {
    setLastResult(result);
  };

  const continueToNextTask = () => {
    setLastResult(null);
    void loadCurrentTask();
  };

  const handleSaveAndExit = () => {
    setShowExitPrompt(false);
    navigate("/");
  };
  const handleDeleteAndExit = async () => {
    setExiting(true);
    await abandonSession();
    setExiting(false);
    setShowExitPrompt(false);
    navigate("/");
  };

  const sequenceIndex = currentTask?.sequence_index ?? null;
  const sequenceTotal = currentTask?.sequence_total ?? null;
  const remainingGlobalSeconds = currentTask?.remaining_global_seconds ?? null;

  if (screen === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F3F6F8", fontFamily: "Inter, sans-serif" }}>
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="" width={20} height={20} style={{ borderRadius: 5 }} />
          <span className="text-xs font-medium" style={{ color: "#718493" }}>Loading your task…</span>
        </div>
      </div>
    );
  }

  if (screen === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F3F6F8", fontFamily: "Inter, sans-serif" }}>
        <div className="w-full max-w-sm mx-auto px-8 text-center">
          <p className="text-sm mb-4" style={{ color: "#B97878" }}>Couldn't load a task: {loadError}</p>
          <button
            onClick={() => void loadCurrentTask()}
            className="px-5 py-2.5 rounded-xl text-xs font-semibold tracking-widest uppercase"
            style={{ background: "#587A92", color: "#fff" }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (screen === "finished") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F3F6F8", fontFamily: "Inter, sans-serif" }}>
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="" width={20} height={20} style={{ borderRadius: 5 }} />
          <span className="text-xs font-medium" style={{ color: "#718493" }}>Simulation finished. Redirecting to your report…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "#F3F6F8", fontFamily: "Inter, sans-serif", color: "#243746", minHeight: "100vh" }}>
      <header className="shrink-0 flex items-center px-5 h-13" style={{ background: "#fff", borderBottom: "1px solid #D9E2E8", zIndex: 10, height: "52px" }}>
        <div className="flex items-center gap-5 flex-1">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="WorkPulse AI" width={22} height={22} style={{ borderRadius: 5 }} />
            <span className="text-xs font-bold tracking-widest text-[#587A92] uppercase">WorkPulse</span>
            <span className="text-xs font-light text-[#7E8DA3]">AI</span>
          </div>
          <nav className="hidden md:flex items-center gap-4">
            {["Home", "Simulation", "Analyse", "Rapports"].map((item) => (
              <button
                key={item}
                onClick={item === "Home" ? () => setShowExitPrompt(true) : undefined}
                className="text-[11px] font-medium transition-colors"
                style={{ color: item === "Simulation" ? "#587A92" : "#718493", cursor: item === "Home" ? "pointer" : "default", background: "none", border: "none" }}
              >
                {item}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex flex-col items-center">
          <div className="text-[9px] font-semibold tracking-widest uppercase" style={{ color: "#718493" }}>SIMULATION ACTIVE</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#719887", animation: "pulse-dot 2s ease-in-out infinite" }} />
            <span className="text-[10px]" style={{ color: "#718493" }}>Session active</span>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-1 justify-end">
          <button
            onClick={() => setShowExitPrompt(true)}
            className="text-[10.5px] font-semibold tracking-wide px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: "#FBF2F2", color: "#B97878", border: "1px solid #EAD9D9" }}
          >
            Stop Simulation
          </button>
          {remainingGlobalSeconds !== null && (
            <div className="text-right">
              <div className="text-[9px] font-medium tracking-widest uppercase" style={{ color: "#718493" }}>Global Time</div>
              <div className="text-sm font-semibold tabular-nums" style={{ color: remainingGlobalSeconds < 120 ? "#B97878" : "#243746" }}>
                {fmtTime(remainingGlobalSeconds)}
              </div>
            </div>
          )}
          {isAuthenticated && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold" style={{ background: "#587A92", color: "#fff" }}>
                {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
              </div>
              <div className="text-[11px] font-semibold" style={{ color: "#243746" }}>{user.name}</div>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* SESSION SIDEBAR -- a READ-ONLY sequence progress indicator, not
            navigation. Nothing here is clickable: the backend-authoritative
            sequence_index/sequence_total from the current task response is
            the only source of truth for what's done/active/locked. */}
        <aside className="hidden lg:flex flex-col w-52 shrink-0 overflow-y-auto py-5 px-4" style={{ background: "#fff", borderRight: "1px solid #D9E2E8" }}>
          <div className="text-[9px] font-semibold tracking-widest uppercase mb-3" style={{ color: "#718493" }}>Simulation Sequence</div>
          <div className="flex flex-col gap-0.5 mb-5">
            {currentTask?.sequence_total ? (
              Array.from({ length: currentTask.sequence_total }).map((_, i) => {
                const isDone = sequenceIndex !== null && i < sequenceIndex;
                const isActive = sequenceIndex !== null && i === sequenceIndex;
                const isLocked = sequenceIndex !== null && i > sequenceIndex;
                const label = isActive ? TASK_TYPE_LABELS[currentTask.type] : isDone ? "Completed" : "Locked";
                return (
                  <div
                    key={i}
                    className="flex gap-2.5 py-2 px-2.5 rounded-lg"
                    style={{
                      background: isActive ? "rgba(88,122,146,0.07)" : "transparent",
                      borderLeft: isActive ? "2px solid #587A92" : "2px solid transparent",
                    }}
                  >
                    <div
                      className="flex items-center justify-center w-3.5 h-3.5 rounded-full mt-0.5 shrink-0 text-[8px] font-bold"
                      style={{
                        background: isDone ? "#719887" : "transparent",
                        border: isDone ? "none" : `1.5px solid ${isActive ? "#587A92" : "#D9E2E8"}`,
                        color: isDone ? "#fff" : isActive ? "#587A92" : "#D9E2E8",
                      }}
                    >
                      {isDone ? "✓" : isActive ? "●" : "○"}
                    </div>
                    <div>
                      <div className="text-[9px] font-semibold" style={{ color: isActive ? "#587A92" : isLocked ? "#D9E2E8" : "#718493" }}>
                        Task {String(i + 1).padStart(2, "0")}
                      </div>
                      <div className="text-[10px] leading-snug" style={{ color: isActive ? "#243746" : isLocked ? "#D9E2E8" : "#718493" }}>
                        {isLocked ? "🔒 " : ""}{label}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-[10px]" style={{ color: "#718493" }}>Loading the sequence…</div>
            )}
          </div>

          <div style={{ borderTop: "1px solid #F3F6F8", paddingTop: "14px" }}>
            <PulseWaveform color="#587A92" className="opacity-30 mb-3" />
            <div className="text-[9px] font-semibold tracking-widest uppercase mb-2" style={{ color: "#718493" }}>Session Progress</div>
            <div className="text-[10px]" style={{ color: "#718493" }}>
              {sequenceIndex !== null && sequenceTotal !== null ? `${sequenceIndex + 1} / ${sequenceTotal}` : "—"}
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 min-w-0">
          {currentTask && (
            <>
              <div className="rounded-xl px-5 py-4" style={{ background: "#fff", border: "1px solid #D9E2E8" }}>
                <div className="text-[9px] font-semibold tracking-widest uppercase mb-1" style={{ color: "#718493" }}>
                  Task {sequenceIndex !== null ? sequenceIndex + 1 : "—"} / {sequenceTotal ?? "—"}
                </div>
                <h1 className="text-base font-semibold" style={{ color: "#243746" }}>{TASK_TYPE_LABELS[currentTask.type]}</h1>
              </div>

              {currentTask.type === "document_organization" && (
                <DocumentOrganizationTask task={currentTask as unknown as DocumentOrganizationTaskData} onCompleted={handleTaskCompleted} />
              )}
              {currentTask.type === "data_validation" && (
                <DataValidationTask task={currentTask as unknown as DataValidationTaskData} onCompleted={handleTaskCompleted} />
              )}
              {currentTask.type === "email_writing" && (
                <EmailWritingTask task={currentTask as unknown as EmailWritingTaskData} onCompleted={handleTaskCompleted} />
              )}
              {currentTask.type === "urgent_request" && (
                <UrgentRequestTask task={currentTask as unknown as UrgentRequestTaskData} onCompleted={handleTaskCompleted} />
              )}
            </>
          )}
        </main>

        <AISupervisorPanel
          messages={ariaMessages}
          awaitingNewMessage={ariaAwaitingNewMessage}
          telemetry={ariaTelemetry}
          sessionId={sessionId ?? ""}
          isSessionActive={isSessionActive}
          connectionStatus={ariaConnectionStatus}
          latestStressEvent={latestStressEvent}
        />
      </div>

      {lastResult && currentTask && (
        <div className="fixed inset-0 flex items-center justify-center px-6" style={{ background: "rgba(36,55,70,0.6)", zIndex: 45 }}>
          <div className="rounded-2xl p-8 max-w-sm w-full text-center" style={{ background: "#fff", border: "1px solid #D9E2E8" }}>
            <div className="text-[9px] font-semibold tracking-widest uppercase mb-1" style={{ color: "#718493" }}>
              {lastResult.timedOut ? "Time Limit Reached" : "Task Complete"}
            </div>
            <h2 className="text-lg font-semibold mb-4" style={{ color: "#243746" }}>{TASK_TYPE_LABELS[currentTask.type]}</h2>
            <div className="grid grid-cols-3 gap-3 text-left mb-6">
              {[
                ["Score", lastResult.contentScore != null ? `${Math.round(lastResult.contentScore)}%` : "—"],
                ["Time", lastResult.timeTakenSeconds != null ? fmtTime(lastResult.timeTakenSeconds) : "—"],
                ["Errors", String(lastResult.errorCount)],
              ].map(([label, val]) => (
                <div key={label} className="rounded-lg p-2" style={{ background: "#F7F9FB", border: "1px solid #EEF2F5" }}>
                  <div className="text-[9px]" style={{ color: "#718493" }}>{label}</div>
                  <div className="text-[13px] font-semibold" style={{ color: "#243746" }}>{val}</div>
                </div>
              ))}
            </div>
            <button
              onClick={continueToNextTask}
              className="w-full py-2.5 rounded-xl text-[12px] font-semibold"
              style={{ background: "#587A92", color: "#fff" }}
            >
              {sequenceIndex !== null && sequenceTotal !== null && sequenceIndex + 1 >= sequenceTotal
                ? "View Final Report →"
                : "Continue to Next Task →"}
            </button>
          </div>
        </div>
      )}

      {showExitPrompt && (
        <div
          className="fixed inset-0 flex items-center justify-center px-6"
          style={{ background: "rgba(36,55,70,0.45)", zIndex: 50 }}
          onClick={() => !exiting && setShowExitPrompt(false)}
        >
          <div className="w-full max-w-sm rounded-2xl p-7" style={{ background: "#fff" }} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold mb-1.5" style={{ color: "#243746" }}>Stop the simulation?</h2>
            <p className="text-[12.5px] leading-relaxed mb-6" style={{ color: "#718493" }}>
              Your current task hasn't been submitted. You can save this session and pick it back up later from your simulation history, or delete it.
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={handleSaveAndExit} disabled={exiting} className="w-full py-2.5 rounded-xl text-[12.5px] font-semibold transition-all" style={{ background: "#587A92", color: "#fff" }}>
                Save session &amp; continue later
              </button>
              <button onClick={() => void handleDeleteAndExit()} disabled={exiting} className="w-full py-2.5 rounded-xl text-[12.5px] font-semibold transition-all" style={{ background: "#F3F6F8", color: "#B97878", border: "1px solid #EAD9D9" }}>
                {exiting ? "Deleting…" : "Delete this session"}
              </button>
              <button onClick={() => setShowExitPrompt(false)} disabled={exiting} className="w-full py-2 text-[12px] font-medium" style={{ background: "none", border: "none", color: "#94a3b8" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
