import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/api/client";
import type { StateUpdateEvent } from "@/services/websocket/websocketTypes";

export type SessionPhaseValue = "accueil" | "montee_pression" | "pic_charge" | "debriefing";

export interface SessionTelemetry {
  avg_score: number;
  consecutive_errors: number;
  declared_stress: number | null;
  tasks_completed_in_session: number;
  window_size: number;
  current_phase: SessionPhaseValue;
  // Populated once the first real-time state_update arrives (both
  // pipelines always send these two; not present in the plain REST
  // snapshot below, so undefined until then rather than fabricated).
  manager_state?: string;
  pressure_score?: number;
}

// Fetches GET /sessions/{id}/performance-snapshot ONCE per (sessionId,
// refreshKey) change -- refreshKey is bumped once per task transition
// (TasksPage's requestId), giving a correct baseline the instant a new
// task loads. From then on, LIVE updates during that task come from the
// real-time `state_update` WebSocket event via applyServerState below,
// never from re-polling this endpoint.
export function useSessionTelemetry(sessionId: string, refreshKey: number) {
  const [telemetry, setTelemetry] = useState<SessionTelemetry | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    apiRequest<SessionTelemetry>(`/sessions/${sessionId}/performance-snapshot`)
      .then((data) => {
        if (!cancelled) setTelemetry(data);
      })
      .catch((err) => {
        console.error("Could not load session telemetry", err);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, refreshKey]);

  // Called on the real-time `state_update` WebSocket event. Only
  // overwrites fields the event actually carries -- the generic task
  // pipeline's `performance` block and Task 02's own `state` block are
  // shaped differently (see websocketTypes.ts), so this merges rather
  // than replaces, and never fabricates a field neither payload provided.
  const applyServerState = useCallback((event: StateUpdateEvent) => {
    setTelemetry((prev) => {
      const base: SessionTelemetry = prev ?? {
        avg_score: 0,
        consecutive_errors: 0,
        declared_stress: null,
        tasks_completed_in_session: 0,
        window_size: 0,
        current_phase: "accueil",
      };
      const next: SessionTelemetry = {
        ...base,
        current_phase: (event.simulation.phase as SessionPhaseValue) ?? base.current_phase,
        manager_state: event.simulation.manager_state,
        pressure_score: event.simulation.pressure_score,
      };
      if (event.performance) {
        next.avg_score = event.performance.avg_score;
        next.declared_stress = event.performance.declared_stress;
        next.tasks_completed_in_session = event.performance.tasks_completed_in_session;
      }
      return next;
    });
  }, []);

  return { telemetry, applyServerState };
}
