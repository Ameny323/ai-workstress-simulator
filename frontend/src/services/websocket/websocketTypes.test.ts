import { describe, it, expect } from "vitest";
import { parseSimulationEvent, parseIncomingMessage } from "./websocketTypes";

describe("parseSimulationEvent", () => {
  it("parses a valid aria_analyzing event", () => {
    const event = parseSimulationEvent({ type: "aria_analyzing", session_id: "s1", task_id: "t1" });
    expect(event).toEqual({ type: "aria_analyzing", session_id: "s1", task_id: "t1" });
  });

  it("parses a valid aria_analyzing event with no task_id (generic pipeline)", () => {
    const event = parseSimulationEvent({ type: "aria_analyzing", session_id: "s1" });
    expect(event).toEqual({ type: "aria_analyzing", session_id: "s1", task_id: undefined });
  });

  it("parses a valid aria_message event", () => {
    const raw = {
      type: "aria_message", id: "m1", session_id: "s1", content: "Stay focused.",
      tone: "neutre", trigger: "TASK_STARTED", sent_at: "2026-01-01T00:00:00Z",
      was_fallback: false, event_id: "e1",
    };
    expect(parseSimulationEvent(raw)).toEqual(raw);
  });

  it("rejects an aria_message missing required fields", () => {
    expect(parseSimulationEvent({ type: "aria_message", session_id: "s1" })).toBeNull();
  });

  it("parses a valid state_update event with a generic performance block", () => {
    const raw = {
      type: "state_update", session_id: "s1", event_id: "e1",
      simulation: { phase: "montee_pression", manager_state: "neutre", pressure_score: 40, communication_frequency_seconds: 30 },
      performance: { avg_score: 80, accuracy: 0.8, error_rate: 0.1, tasks_completed_in_session: 3, declared_stress: 2, workload: 1.2 },
    };
    expect(parseSimulationEvent(raw)).toEqual(raw);
  });

  it("parses a valid state_update event with an opaque Task 02 state block instead", () => {
    const raw = {
      type: "state_update", session_id: "s1", task_id: "t1", event_id: "e1",
      simulation: { phase: "pic_charge", manager_state: "exigeant", pressure_score: 60, communication_frequency_seconds: 20 },
      state: { processed_count: 3, exact_accuracy: 0.9 },
    };
    expect(parseSimulationEvent(raw)).toEqual(raw);
  });

  it("rejects a state_update with a malformed simulation block", () => {
    expect(parseSimulationEvent({ type: "state_update", session_id: "s1", event_id: "e1", simulation: { phase: "x" } })).toBeNull();
  });

  it("parses a valid stress_declared event, including the first-ever-declaration case", () => {
    const raw = { type: "stress_declared", session_id: "s1", stress_level: 4, timestamp: "2026-01-01T00:00:00Z", previous_stress_level: null, stress_change: null };
    expect(parseSimulationEvent(raw)).toEqual(raw);
  });

  it("defaults previous_stress_level/stress_change to null when omitted", () => {
    const event = parseSimulationEvent({ type: "stress_declared", session_id: "s1", stress_level: 2, timestamp: "2026-01-01T00:00:00Z" });
    expect(event).toEqual({ type: "stress_declared", session_id: "s1", stress_level: 2, timestamp: "2026-01-01T00:00:00Z", previous_stress_level: null, stress_change: null });
  });

  it("returns null for an unknown event type", () => {
    expect(parseSimulationEvent({ type: "some_future_event", session_id: "s1" })).toBeNull();
  });

  it("returns null for a payload with no type/session_id at all", () => {
    expect(parseSimulationEvent({})).toBeNull();
    expect(parseSimulationEvent(null)).toBeNull();
    expect(parseSimulationEvent("just a string")).toBeNull();
    expect(parseSimulationEvent(42)).toBeNull();
  });
});

describe("parseIncomingMessage", () => {
  it("parses a valid JSON string event", () => {
    const event = parseIncomingMessage(JSON.stringify({ type: "aria_analyzing", session_id: "s1" }));
    expect(event).toEqual({ type: "aria_analyzing", session_id: "s1", task_id: undefined });
  });

  it("returns null for malformed JSON without throwing", () => {
    expect(() => parseIncomingMessage("{not json")).not.toThrow();
    expect(parseIncomingMessage("{not json")).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(parseIncomingMessage({ type: "aria_analyzing" })).toBeNull();
  });
});
