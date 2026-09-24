import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { FakeWebSocket } from "@/test/fakeWebSocket";
import { useSimulationWebSocket } from "./useSimulationWebSocket";

vi.mock("@/api/client", () => ({
  getToken: () => "fake-token",
  BASE_URL: "http://localhost:8000",
}));

const SESSION_ID = "s1";

beforeEach(() => {
  FakeWebSocket.reset();
  vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useSimulationWebSocket", () => {
  it("does not connect when disabled", () => {
    renderHook(() => useSimulationWebSocket(SESSION_ID, false, vi.fn()));
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("does not connect when sessionId is missing", () => {
    renderHook(() => useSimulationWebSocket(null, true, vi.fn()));
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("connects using the current session id, reaching CONNECTED on open", async () => {
    const { result } = renderHook(() => useSimulationWebSocket(SESSION_ID, true, vi.fn()));
    expect(result.current.status).toBe("connecting");
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toContain(`/ws/sessions/${SESSION_ID}`);
    expect(FakeWebSocket.instances[0].url).toContain("token=fake-token");

    FakeWebSocket.instances[0].simulateOpen();
    await waitFor(() => expect(result.current.status).toBe("connected"));
  });

  it("never creates a second connection while re-rendering with the same session", () => {
    const { rerender } = renderHook(({ enabled }) => useSimulationWebSocket(SESSION_ID, enabled, vi.fn()), {
      initialProps: { enabled: true },
    });
    FakeWebSocket.instances[0].simulateOpen();
    rerender({ enabled: true });
    rerender({ enabled: true });
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("closes the socket and stops reconnecting on clean unmount (simulation ended / logout)", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useSimulationWebSocket(SESSION_ID, true, vi.fn()));
    const socket = FakeWebSocket.instances[0];
    socket.simulateOpen();

    unmount();
    expect(socket.closed).toBe(true);

    // Even if the browser eventually fires onclose after our own close(),
    // no reconnect attempt should follow -- this was an intentional stop.
    socket.simulateClose();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("disconnects and does not reconnect when the session becomes inactive", () => {
    vi.useFakeTimers();
    const { rerender } = renderHook(({ enabled }) => useSimulationWebSocket(SESSION_ID, enabled, vi.fn()), {
      initialProps: { enabled: true },
    });
    FakeWebSocket.instances[0].simulateOpen();

    rerender({ enabled: false });
    expect(FakeWebSocket.instances[0].closed).toBe(true);

    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("reconnects with exponential backoff after an unexpected disconnect, then resets on success", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSimulationWebSocket(SESSION_ID, true, vi.fn()));
    act(() => FakeWebSocket.instances[0].simulateOpen());
    expect(result.current.status).toBe("connected");

    // Unexpected drop (no unmount, no `enabled` change).
    act(() => FakeWebSocket.instances[0].simulateClose());
    expect(result.current.status).toBe("reconnecting");
    expect(FakeWebSocket.instances).toHaveLength(1); // not yet retried

    await act(() => vi.advanceTimersByTimeAsync(1000)); // retry 1 -> 1s
    expect(FakeWebSocket.instances).toHaveLength(2);

    act(() => FakeWebSocket.instances[1].simulateClose());
    await act(() => vi.advanceTimersByTimeAsync(2000)); // retry 2 -> 2s
    expect(FakeWebSocket.instances).toHaveLength(3);

    act(() => FakeWebSocket.instances[2].simulateClose());
    await act(() => vi.advanceTimersByTimeAsync(4000)); // retry 3 -> 4s
    expect(FakeWebSocket.instances).toHaveLength(4);

    // This one succeeds -- retry counter must reset.
    act(() => FakeWebSocket.instances[3].simulateOpen());
    expect(result.current.status).toBe("connected");

    act(() => FakeWebSocket.instances[3].simulateClose());
    expect(FakeWebSocket.instances).toHaveLength(4); // not yet retried
    await act(() => vi.advanceTimersByTimeAsync(1000)); // back to 1s, not 8s -- counter reset
    expect(FakeWebSocket.instances).toHaveLength(5);
  });

  it("delivers valid parsed events to the handler", async () => {
    const onEvent = vi.fn();
    renderHook(() => useSimulationWebSocket(SESSION_ID, true, onEvent));
    const socket = FakeWebSocket.instances[0];
    socket.simulateOpen();

    socket.simulateMessage(JSON.stringify({ type: "stress_declared", session_id: SESSION_ID, stress_level: 3, timestamp: "2026-01-01T00:00:00Z" }));

    await waitFor(() => expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "stress_declared", stress_level: 3 })));
  });

  it("ignores malformed JSON without crashing or calling the handler", () => {
    const onEvent = vi.fn();
    renderHook(() => useSimulationWebSocket(SESSION_ID, true, onEvent));
    const socket = FakeWebSocket.instances[0];
    socket.simulateOpen();

    expect(() => socket.simulateMessage("{not valid json")).not.toThrow();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("ignores unknown event types without crashing or calling the handler", () => {
    const onEvent = vi.fn();
    renderHook(() => useSimulationWebSocket(SESSION_ID, true, onEvent));
    const socket = FakeWebSocket.instances[0];
    socket.simulateOpen();

    socket.simulateMessage(JSON.stringify({ type: "some_future_event", session_id: SESSION_ID }));
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("ignores a structurally incomplete known event without crashing", () => {
    const onEvent = vi.fn();
    renderHook(() => useSimulationWebSocket(SESSION_ID, true, onEvent));
    const socket = FakeWebSocket.instances[0];
    socket.simulateOpen();

    // aria_message missing required fields (content, tone, ...).
    socket.simulateMessage(JSON.stringify({ type: "aria_message", session_id: SESSION_ID }));
    expect(onEvent).not.toHaveBeenCalled();
  });
});
