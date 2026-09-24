import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useManagerMessages, type ManagerMessage } from "./useManagerMessages";

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock("@/api/client", () => ({ apiRequest: apiRequestMock }));

const SESSION_ID = "s1";

function msg(overrides: Partial<ManagerMessage> = {}): ManagerMessage {
  return {
    id: "m1", session_id: SESSION_ID, content: "hello", tone: "neutre",
    sent_at: "2026-01-01T00:00:00Z", trigger_context: null, was_fallback: true, is_read: false,
    ...overrides,
  };
}

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useManagerMessages", () => {
  it("loads history via REST once on mount", async () => {
    apiRequestMock.mockResolvedValue([msg({ id: "history-1" })]);
    const { result } = renderHook(() => useManagerMessages(SESSION_ID, true, 0));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(apiRequestMock).toHaveBeenCalledWith(`/sessions/${SESSION_ID}/manager-messages`);
  });

  it("appends a new real-time aria_message that doesn't match any existing id", () => {
    const { result } = renderHook(() => useManagerMessages(SESSION_ID, true, 0));
    act(() => result.current.appendOrUpdateMessage(msg({ id: "new-1" })));
    expect(result.current.messages.map((m) => m.id)).toEqual(["new-1"]);
  });

  it("upserts (updates content in place) when the same message id arrives twice -- the fallback-then-LLM-upgrade case", () => {
    const { result } = renderHook(() => useManagerMessages(SESSION_ID, true, 0));
    act(() => result.current.appendOrUpdateMessage(msg({ id: "m1", content: "fallback text", was_fallback: true })));
    act(() => result.current.appendOrUpdateMessage(msg({ id: "m1", content: "real LLM text", was_fallback: false })));

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe("real LLM text");
    expect(result.current.messages[0].was_fallback).toBe(false);
  });

  it("showAnalyzing sets awaitingNewMessage, and appendOrUpdateMessage clears it", () => {
    const { result } = renderHook(() => useManagerMessages(SESSION_ID, true, 0));
    act(() => result.current.showAnalyzing());
    expect(result.current.awaitingNewMessage).toBe(true);

    act(() => result.current.appendOrUpdateMessage(msg()));
    expect(result.current.awaitingNewMessage).toBe(false);
  });

  it("clears the stuck analyzing state on its own after the safety timeout if no message ever arrives", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useManagerMessages(SESSION_ID, true, 0));
    act(() => result.current.showAnalyzing());
    expect(result.current.awaitingNewMessage).toBe(true);

    act(() => vi.advanceTimersByTime(20_000));
    expect(result.current.awaitingNewMessage).toBe(false);
  });
});
