// Transport-only helpers for the simulation WebSocket channel. Deliberately
// framework-agnostic (no React here) -- app/hooks/useSimulationWebSocket.ts
// is the only consumer, and keeps its own lifecycle/reconnect state
// separate from this module's pure URL-building logic.
import { BASE_URL } from "@/api/client";

/** Mirrors api/client.ts's BASE_URL resolution (VITE_API_URL, or
 * same-origin when unset) but for the ws:// scheme a browser WebSocket
 * requires -- a relative path (what fetch() accepts) is not valid for the
 * WebSocket constructor, so this always returns an absolute ws(s):// URL. */
export function resolveWebSocketOrigin(): string {
  if (BASE_URL) {
    return BASE_URL.replace(/^http/, "ws");
  }
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}`;
}

export function buildSessionWebSocketUrl(sessionId: string, token: string): string {
  return `${resolveWebSocketOrigin()}/ws/sessions/${sessionId}?token=${encodeURIComponent(token)}`;
}

// Exponential backoff schedule (section 9): 1s, 2s, 4s, 8s, 16s, then 30s
// for every retry after that. Indexed by the current retry count.
export const RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];

export function backoffDelayForRetry(retryCount: number): number {
  return RECONNECT_BACKOFF_MS[Math.min(retryCount, RECONNECT_BACKOFF_MS.length - 1)];
}
