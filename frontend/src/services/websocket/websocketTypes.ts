// Event contract for the backend's real WebSocket channel
// (`@app.websocket("/ws/sessions/{session_id}")`, app/main.py), broadcast
// from app/orchestrators/aria_pipeline.py and email_event_pipeline.py
// (generic tasks + Task 02/email prioritization) and app/api/sessions.py
// (stress declaration). These are the ACTUAL 4 event types the backend
// sends today -- confirmed by reading those files directly, not assumed.
// There is no separate `performance_update`/`simulation_state_changed`
// event: both pipelines broadcast one combined `state_update` event
// carrying phase/tone/pressure plus (pipeline-dependent) either a generic
// `performance` block or Task 02's own `state` block. There is also no
// `aria_reminder`/`aria_task_assigned` broadcast anywhere yet -- those
// exist only as concepts in earlier planning, not as real payloads, so
// they are intentionally not modeled here (adding fake types for events
// that never arrive would be exactly the kind of invented contract this
// integration is supposed to avoid).

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

export type ManagerTone = "bienveillant" | "neutre" | "exigeant" | "intrusif";

interface BaseSimulationEvent {
  session_id: string;
}

export interface AriaAnalyzingEvent extends BaseSimulationEvent {
  type: "aria_analyzing";
  task_id?: string;
}

export interface AriaMessageEvent extends BaseSimulationEvent {
  type: "aria_message";
  id: string;
  task_id?: string;
  content: string;
  tone: ManagerTone;
  trigger: string;
  sent_at: string;
  was_fallback: boolean;
  event_id: string;
}

export interface SimulationBlock {
  phase: string;
  manager_state: string;
  pressure_score: number;
  communication_frequency_seconds: number;
}

// The generic (non-email) task pipeline's performance block
// (app/orchestrators/aria_pipeline.py).
export interface GenericPerformanceBlock {
  avg_score: number;
  accuracy: number;
  error_rate: number;
  tasks_completed_in_session: number;
  declared_stress: number | null;
  workload: number;
}

export interface StateUpdateEvent extends BaseSimulationEvent {
  type: "state_update";
  task_id?: string;
  event_id: string;
  simulation: SimulationBlock;
  // Only present on events from the generic task pipeline.
  performance?: GenericPerformanceBlock;
  // Only present on events from the Task 02 (email prioritization)
  // pipeline -- its own SimulationState shape (processed_count,
  // exact_accuracy, weighted_decision_score, ...). Not destructured field
  // by field here since nothing in the UI consumes it yet; kept typed as
  // an opaque record so a malformed/partial payload never crashes parsing.
  state?: Record<string, unknown>;
}

export interface StressDeclaredEvent extends BaseSimulationEvent {
  type: "stress_declared";
  stress_level: number;
  timestamp: string;
  previous_stress_level: number | null;
  stress_change: number | null;
}

export type SimulationEvent = AriaAnalyzingEvent | AriaMessageEvent | StateUpdateEvent | StressDeclaredEvent;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSimulationBlock(value: unknown): value is SimulationBlock {
  return (
    isRecord(value) &&
    typeof value.phase === "string" &&
    typeof value.manager_state === "string" &&
    typeof value.pressure_score === "number" &&
    typeof value.communication_frequency_seconds === "number"
  );
}

/** Structural validation only -- deliberately permissive about optional
 * fields (task_id, performance, state) since different backend pipelines
 * populate different subsets. Rejects anything that doesn't match one of
 * the 4 known shapes rather than guessing; callers must treat a null
 * return as "ignore this event" (unknown/malformed), never throw. */
export function parseSimulationEvent(raw: unknown): SimulationEvent | null {
  if (!isRecord(raw) || typeof raw.type !== "string" || typeof raw.session_id !== "string") return null;

  switch (raw.type) {
    case "aria_analyzing":
      return { type: "aria_analyzing", session_id: raw.session_id, task_id: asOptionalString(raw.task_id) };

    case "aria_message": {
      if (
        typeof raw.id !== "string" ||
        typeof raw.content !== "string" ||
        typeof raw.tone !== "string" ||
        typeof raw.trigger !== "string" ||
        typeof raw.sent_at !== "string" ||
        typeof raw.was_fallback !== "boolean" ||
        typeof raw.event_id !== "string"
      ) {
        return null;
      }
      return {
        type: "aria_message",
        session_id: raw.session_id,
        id: raw.id,
        task_id: asOptionalString(raw.task_id),
        content: raw.content,
        tone: raw.tone as ManagerTone,
        trigger: raw.trigger,
        sent_at: raw.sent_at,
        was_fallback: raw.was_fallback,
        event_id: raw.event_id,
      };
    }

    case "state_update": {
      if (typeof raw.event_id !== "string" || !isSimulationBlock(raw.simulation)) return null;
      return {
        type: "state_update",
        session_id: raw.session_id,
        task_id: asOptionalString(raw.task_id),
        event_id: raw.event_id,
        simulation: raw.simulation,
        performance: isRecord(raw.performance) ? (raw.performance as unknown as GenericPerformanceBlock) : undefined,
        state: isRecord(raw.state) ? raw.state : undefined,
      };
    }

    case "stress_declared": {
      if (typeof raw.stress_level !== "number" || typeof raw.timestamp !== "string") return null;
      return {
        type: "stress_declared",
        session_id: raw.session_id,
        stress_level: raw.stress_level,
        timestamp: raw.timestamp,
        previous_stress_level: typeof raw.previous_stress_level === "number" ? raw.previous_stress_level : null,
        stress_change: typeof raw.stress_change === "number" ? raw.stress_change : null,
      };
    }

    default:
      // Unknown event type -- not an error, just not (yet) modeled.
      return null;
  }
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Parses the raw WebSocket message text: handles malformed JSON and
 * structurally-invalid payloads identically (both return null), so the
 * caller never needs a try/catch of its own. Logs to console.debug only
 * in dev mode -- never surfaces raw payloads to the user. */
export function parseIncomingMessage(data: unknown): SimulationEvent | null {
  if (typeof data !== "string") return null;
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    if (import.meta.env.DEV) console.debug("[ws] ignoring malformed JSON message");
    return null;
  }
  const event = parseSimulationEvent(json);
  if (event === null && import.meta.env.DEV) {
    console.debug("[ws] ignoring unrecognized/invalid event", json);
  }
  return event;
}
