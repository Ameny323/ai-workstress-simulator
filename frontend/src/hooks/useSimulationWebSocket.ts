import { useEffect, useRef, useState } from "react";
import { getToken } from "@/api/client";
import { buildSessionWebSocketUrl, backoffDelayForRetry } from "@/services/websocket/simulationWebSocket";
import { parseIncomingMessage } from "@/services/websocket/websocketTypes";
import type { ConnectionStatus, SimulationEvent } from "@/services/websocket/websocketTypes";

/**
 * Owns the ENTIRE WebSocket connection lifecycle for one simulation
 * session: connect, authenticate (via the same JWT REST calls already
 * use, passed as a query param -- browsers can't set a WebSocket
 * Authorization header, and app/main.py's endpoint expects exactly this),
 * automatic reconnect with exponential backoff, and clean teardown.
 *
 * Deliberately does NOT do event-specific state management (message
 * lists, telemetry, etc.) -- that's the caller's job via `onEvent`. This
 * hook is pure transport + lifecycle, reusable regardless of what a given
 * screen wants to do with the events it receives.
 *
 * One connection per (sessionId, enabled) pair: React's effect
 * cleanup/re-run semantics (including React 18 StrictMode's dev-only
 * double-invoke) guarantee the previous socket is closed before a new one
 * opens, since `wsRef`/`cancelled` are reset synchronously in the same
 * tick the old effect tears down.
 */
export function useSimulationWebSocket(
  sessionId: string | null | undefined,
  enabled: boolean,
  onEvent: (event: SimulationEvent) => void
): { status: ConnectionStatus } {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent; // always dispatch to the latest handler without re-subscribing

  useEffect(() => {
    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    if (!enabled || !sessionId) {
      clearReconnectTimer();
      wsRef.current?.close();
      wsRef.current = null;
      setStatus("disconnected");
      return;
    }

    let cancelled = false;
    retryCountRef.current = 0;

    const connect = () => {
      if (cancelled) return;
      const token = getToken();
      if (!token) {
        // No token -- e.g. logged out mid-session. Never connect
        // unauthenticated, and never retry on our own; a fresh login will
        // re-render this hook with a valid token via a normal prop change.
        setStatus("error");
        return;
      }

      setStatus(retryCountRef.current === 0 ? "connecting" : "reconnecting");
      let socket: WebSocket;
      try {
        socket = new WebSocket(buildSessionWebSocketUrl(sessionId, token));
      } catch {
        setStatus("error");
        return;
      }
      wsRef.current = socket;

      socket.onopen = () => {
        if (cancelled) return;
        retryCountRef.current = 0;
        setStatus("connected");
      };

      socket.onmessage = (evt) => {
        if (cancelled) return;
        const event = parseIncomingMessage(evt.data);
        if (event !== null) onEventRef.current(event);
      };

      // onerror carries no useful detail in browsers and is always
      // followed by onclose -- all reconnect logic lives there so it runs
      // exactly once per disconnect.
      socket.onerror = () => {};

      socket.onclose = () => {
        if (wsRef.current === socket) wsRef.current = null;
        if (cancelled) return;

        setStatus("reconnecting");
        const delay = backoffDelayForRetry(retryCountRef.current);
        retryCountRef.current += 1;
        clearReconnectTimer();
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    // Intentional disconnect (session ended, logged out, component
    // unmounted, sessionId/enabled changed) -- distinguished from an
    // unexpected drop purely by `cancelled` being set here BEFORE closing,
    // so the socket's own onclose handler (checked above) never schedules
    // a reconnect for a close WE initiated.
    return () => {
      cancelled = true;
      clearReconnectTimer();
      wsRef.current?.close();
      wsRef.current = null;
      setStatus("disconnected");
    };
  }, [sessionId, enabled]);

  return { status };
}
