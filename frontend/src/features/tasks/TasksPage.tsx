import { useEffect, useState } from "react";
import { useApp } from "../../contexts/AppContext";
import { apiRequest } from "@/api/client";
import ValidationTask, { type ValidationTaskData } from "../dashboard/components/ValidationTask";

export default function TasksPage() {
  const { session } = useApp();
  const [task, setTask] = useState<ValidationTaskData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    if (!session.id || session.state === "idle") return;
    let cancelled = false;
    setError(null);
    setTask(null);
    apiRequest<ValidationTaskData>(`/sessions/${session.id}/next-task`)
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
      ) : (
        <ValidationTask
          key={task.id}
          task={task}
          onSubmitted={() => {
            setTask(null);
            setRequestId((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
