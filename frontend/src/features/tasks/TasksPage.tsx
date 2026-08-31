import { useEffect, useState } from "react";
import { useApp } from "../../contexts/AppContext";
import { apiRequest } from "@/api/client";
import ValidationTask, { type ValidationTaskData } from "../dashboard/components/ValidationTask";
import DocumentOrganizationTask, {
  type DocumentOrganizationTaskData,
} from "./components/DocumentOrganizationTask";

// Fetched shape before we know which task family it is -- instance_data's
// concrete shape varies by type, so it's narrowed via a cast once `type`
// is checked below, same way each *TaskData interface documents its own
// instance_data shape for its own family.
interface RawTaskData {
  id: string;
  type: string;
  title: string;
  description: string | null;
  instance_data: unknown;
  deadline_seconds: number | null;
  priority: string;
  difficulty: string | null;
  status: string;
}

export default function TasksPage() {
  const { session } = useApp();
  const [task, setTask] = useState<RawTaskData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    if (!session.id || session.state === "idle") return;
    let cancelled = false;
    setError(null);
    setTask(null);
    apiRequest<RawTaskData>(`/sessions/${session.id}/next-task`)
      .then((data) => {
        if (!cancelled) setTask(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load task");
      });
    return () => {
      cancelled = true;
    };
  }, [session.id, session.state, requestId]);

  const handleSubmitted = () => {
    setTask(null);
    setRequestId((n) => n + 1);
  };

  return (
    <div
      className="fade-in"
      style={{
        padding: "24px 28px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        minHeight: "100%",
      }}
    >
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1A2B3C", margin: 0, letterSpacing: "-0.02em" }}>
          Tasks
        </h1>
        <p style={{ fontSize: 13, color: "#6B7A8D", margin: "4px 0 0" }}>
          Complete the task ARIA has assigned you, then submit your answers.
        </p>
      </div>

      {!session.id || session.state === "idle" ? (
        <div
          className="glass-card"
          style={{ padding: "24px 28px", color: "#4B5A6A", fontSize: 13.5 }}
        >
          No active session yet. Start a simulation from the Dashboard to receive a task.
        </div>
      ) : error ? (
        <div className="glass-card" style={{ padding: "20px 24px", color: "#c0505a", fontSize: 13.5 }}>
          Couldn't load your task: {error}
        </div>
      ) : !task ? (
        <div className="glass-card" style={{ padding: "20px 24px", color: "#94a3b8", fontSize: 13.5 }}>
          Loading task...
        </div>
      ) : task.type === "data_validation" ? (
        <ValidationTask key={task.id} task={task as unknown as ValidationTaskData} onSubmitted={handleSubmitted} />
      ) : task.type === "document_organization" ? (
        <DocumentOrganizationTask
          key={task.id}
          task={task as unknown as DocumentOrganizationTaskData}
          onSubmitted={handleSubmitted}
        />
      ) : (
        <div
          className="glass-card"
          style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div style={{ color: "#4B5A6A", fontSize: 13.5 }}>
            "{task.title}" is a <strong>{task.type}</strong> task — that type doesn't have a UI
            built yet.
          </div>
          <button
            onClick={handleSubmitted}
            style={{
              alignSelf: "flex-start",
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: "linear-gradient(135deg, #5B84C6, #8D74FF)",
              color: "white",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Get a different task
          </button>
        </div>
      )}
    </div>
  );
}
