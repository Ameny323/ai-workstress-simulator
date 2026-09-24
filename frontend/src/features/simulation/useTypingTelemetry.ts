import { useCallback, useRef } from "react";

// Aggregate-only typing telemetry (cahier: "variations de vitesse de
// frappe") -- mirrors backend/app/schemas/task.py's TypingMetricsIn
// exactly. Keystroke TIMESTAMPS (plain numbers) are captured transiently
// in a ref and reduced to these 6 aggregate fields before ever leaving
// this hook -- raw keys, characters, or the typed text itself are never
// read or stored here. Typing speed is a behavioral interaction metric
// only; no psychological state is inferred from it.
export interface TypingMetrics {
  typing_duration_seconds: number;
  character_count: number;
  word_count: number;
  average_chars_per_second: number;
  typing_speed_variation: number;
  pause_count_during_typing: number;
}

// A gap between keystrokes at or above this is a "pause" -- deliberately
// shorter than the session-level idle threshold (90s, aria_policy.
// HIGH_IDLE_SECONDS): a multi-second gap mid-composition already signals
// hesitation, well before the session-wide idle definition would trigger.
export const TYPING_PAUSE_THRESHOLD_MS = 2000;

export function useTypingTelemetry() {
  const keystrokeTimestamps = useRef<number[]>([]);

  const recordKeystroke = useCallback(() => {
    keystrokeTimestamps.current.push(performance.now());
  }, []);

  const reset = useCallback(() => {
    keystrokeTimestamps.current = [];
  }, []);

  const computeMetrics = useCallback((finalText: string): TypingMetrics | null => {
    const timestamps = keystrokeTimestamps.current;
    if (timestamps.length < 2) return null;

    const durationMs = timestamps[timestamps.length - 1] - timestamps[0];
    const durationSeconds = durationMs / 1000;
    const characterCount = finalText.length;
    const wordCount = finalText.trim().length > 0 ? finalText.trim().split(/\s+/).length : 0;
    const averageCharsPerSecond = durationSeconds > 0 ? characterCount / durationSeconds : 0;

    const gaps: number[] = [];
    let pauseCount = 0;
    for (let i = 1; i < timestamps.length; i++) {
      const gap = timestamps[i] - timestamps[i - 1];
      if (gap >= TYPING_PAUSE_THRESHOLD_MS) {
        pauseCount += 1;
      } else {
        gaps.push(gap);
      }
    }

    // Standard deviation of instantaneous inter-keystroke rate (chars/sec
    // per interval), excluding pause-length intervals -- a proxy for how
    // *irregular* the typing rhythm was, not how fast it was overall.
    let typingSpeedVariation = 0;
    if (gaps.length >= 2) {
      const rates = gaps.map((g) => (g > 0 ? 1000 / g : 0));
      const mean = rates.reduce((s, r) => s + r, 0) / rates.length;
      const variance = rates.reduce((s, r) => s + (r - mean) ** 2, 0) / rates.length;
      typingSpeedVariation = Math.sqrt(variance);
    }

    return {
      typing_duration_seconds: Math.round(durationSeconds * 10) / 10,
      character_count: characterCount,
      word_count: wordCount,
      average_chars_per_second: Math.round(averageCharsPerSecond * 100) / 100,
      typing_speed_variation: Math.round(typingSpeedVariation * 100) / 100,
      pause_count_during_typing: pauseCount,
    };
  }, []);

  return { recordKeystroke, computeMetrics, reset };
}
