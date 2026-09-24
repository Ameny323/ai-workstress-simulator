import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSessionTelemetry } from "./useSessionTelemetry";
import type { StateUpdateEvent } from "@/services/websocket/websocketTypes";

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock("@/api/client", () => ({ apiRequest: apiRequestMock }));

const SESSION_ID = "s1";

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({
    avg_score: 70, consecutive_errors: 0, declared_stress: null,
    tasks_completed_in_session: 0, window_size: 0, current_phase: "accueil",
  });
});

describe("useSessionTelemetry", () => {
  it("loads an initial snapshot via REST", async () => {
    apiRequestMock.mockResolvedValue({
      avg_score: 70, consecutive_errors: 0, declared_stress: null,
      tasks_completed_in_session: 1, window_size: 1, current_phase: "accueil",
    });
    const { result } = renderHook(() => useSessionTelemetry(SESSION_ID, 0));
    await waitFor(() => expect(result.current.telemetry).not.toBeNull());
    expect(result.current.telemetry?.avg_score).toBe(70);
  });

  it("applies a real-time state_update (simulation_state_changed-equivalent) without a REST call", async () => {
    apiRequestMock.mockResolvedValue({
      avg_score: 70, consecutive_errors: 2, declared_stress: null,
      tasks_completed_in_session: 1, window_size: 1, current_phase: "accueil",
    });
    const { result } = renderHook(() => useSessionTelemetry(SESSION_ID, 0));
    await waitFor(() => expect(result.current.telemetry).not.toBeNull());
    const callsBefore = apiRequestMock.mock.calls.length;

    const event: StateUpdateEvent = {
      type: "state_update", session_id: SESSION_ID, event_id: "e1",
      simulation: { phase: "pic_charge", manager_state: "exigeant", pressure_score: 62, communication_frequency_seconds: 20 },
      performance: { avg_score: 55, accuracy: 0.55, error_rate: 0.3, tasks_completed_in_session: 4, declared_stress: 3, workload: 2.1 },
    };
    act(() => result.current.applyServerState(event));

    expect(result.current.telemetry?.current_phase).toBe("pic_charge");
    expect(result.current.telemetry?.manager_state).toBe("exigeant");
    expect(result.current.telemetry?.pressure_score).toBe(62);
    expect(result.current.telemetry?.avg_score).toBe(55);
    expect(result.current.telemetry?.declared_stress).toBe(3);
    expect(result.current.telemetry?.tasks_completed_in_session).toBe(4);
    // consecutive_errors isn't in the generic performance block -- must be
    // preserved from the last known value, never fabricated as 0.
    expect(result.current.telemetry?.consecutive_errors).toBe(2);
    expect(apiRequestMock.mock.calls.length).toBe(callsBefore); // no extra REST call
  });

  it("applies phase/tone/pressure from a state_update even when only Task 02's opaque `state` block is present", () => {
    const { result } = renderHook(() => useSessionTelemetry(SESSION_ID, 0));
    const event: StateUpdateEvent = {
      type: "state_update", session_id: SESSION_ID, task_id: "t1", event_id: "e1",
      simulation: { phase: "montee_pression", manager_state: "neutre", pressure_score: 30, communication_frequency_seconds: 30 },
      state: { processed_count: 2 },
    };
    act(() => result.current.applyServerState(event));
    expect(result.current.telemetry?.current_phase).toBe("montee_pression");
    expect(result.current.telemetry?.manager_state).toBe("neutre");
  });
});
