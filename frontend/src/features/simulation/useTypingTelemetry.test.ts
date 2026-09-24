import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTypingTelemetry } from "./useTypingTelemetry";

let now = 0;
beforeEach(() => {
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useTypingTelemetry", () => {
  it("returns null when fewer than 2 keystrokes were recorded (not enough data, never fabricated)", () => {
    const { result } = renderHook(() => useTypingTelemetry());
    act(() => result.current.recordKeystroke());
    expect(result.current.computeMetrics("a")).toBeNull();
  });

  it("returns null with zero keystrokes", () => {
    const { result } = renderHook(() => useTypingTelemetry());
    expect(result.current.computeMetrics("")).toBeNull();
  });

  it("computes duration, character/word counts, and average speed from real keystroke timing", () => {
    const { result } = renderHook(() => useTypingTelemetry());
    now = 0;
    act(() => result.current.recordKeystroke());
    now = 5000;
    act(() => result.current.recordKeystroke());

    const metrics = result.current.computeMetrics("hello world");
    expect(metrics).not.toBeNull();
    expect(metrics!.typing_duration_seconds).toBe(5);
    expect(metrics!.character_count).toBe(11);
    expect(metrics!.word_count).toBe(2);
    expect(metrics!.average_chars_per_second).toBeCloseTo(11 / 5, 1);
  });

  it("counts a long gap between keystrokes as a pause during typing", () => {
    const { result } = renderHook(() => useTypingTelemetry());
    now = 0;
    act(() => result.current.recordKeystroke());
    now = 500;
    act(() => result.current.recordKeystroke());
    now = 3000;
    act(() => result.current.recordKeystroke());

    const metrics = result.current.computeMetrics("abcdef");
    expect(metrics).not.toBeNull();
    expect(metrics!.pause_count_during_typing).toBe(1);
  });

  it("reports higher typing_speed_variation for irregular typing than for steady typing", () => {
    const steady = renderHook(() => useTypingTelemetry());
    now = 0;
    for (let i = 0; i < 5; i++) {
      now = i * 100;
      act(() => steady.result.current.recordKeystroke());
    }
    const steadyMetrics = steady.result.current.computeMetrics("steady");

    const irregular = renderHook(() => useTypingTelemetry());
    now = 0;
    const gaps = [10, 500, 20, 800, 15];
    let t = 0;
    for (const gap of gaps) {
      t += gap;
      now = t;
      act(() => irregular.result.current.recordKeystroke());
    }
    const irregularMetrics = irregular.result.current.computeMetrics("irregular");

    expect(steadyMetrics).not.toBeNull();
    expect(irregularMetrics).not.toBeNull();
    expect(irregularMetrics!.typing_speed_variation).toBeGreaterThan(steadyMetrics!.typing_speed_variation);
  });

  it("never exposes the typed characters themselves -- only aggregate numeric fields", () => {
    const { result } = renderHook(() => useTypingTelemetry());
    now = 0;
    act(() => result.current.recordKeystroke());
    now = 1000;
    act(() => result.current.recordKeystroke());
    const metrics = result.current.computeMetrics("super secret content");
    const values = Object.values(metrics as object);
    expect(values.every((v) => typeof v === "number")).toBe(true);
    expect(JSON.stringify(metrics)).not.toContain("secret");
  });

  it("reset clears prior keystroke history so a new composition starts clean", () => {
    const { result } = renderHook(() => useTypingTelemetry());
    now = 0;
    act(() => result.current.recordKeystroke());
    now = 1000;
    act(() => result.current.recordKeystroke());
    act(() => result.current.reset());
    expect(result.current.computeMetrics("x")).toBeNull();
  });
});
