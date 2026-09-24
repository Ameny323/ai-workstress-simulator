import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/api/client";

export type ManagerTone = "bienveillant" | "neutre" | "exigeant" | "intrusif";

export interface ManagerMessage {
  id: string;
  session_id: string;
  content: string;
  tone: ManagerTone;
  sent_at: string;
  trigger_context: Record<string, unknown> | null;
  was_fallback: boolean;
  is_read: boolean;
}

// Safety net for the "ARIA is analyzing..." state (spec section 13): if
// the backend's aria_message never arrives -- a dropped WebSocket, a
// backend failure, a malformed event -- this state must not persist
// forever. The normal case (even an OpenAI-generated message, upgraded in
// the background after an immediate fallback) resolves in well under this.
const ANALYZING_SAFETY_TIMEOUT_MS = 20_000;

/**
 * ARIA message history: loaded once via REST (the existing GET
 * /sessions/{id}/manager-messages, unchanged) for the session's history
 * plus again on each task transition (`historyRefreshTrigger`, e.g.
 * TasksPage's requestId) so a freshly-loaded task's page always starts
 * from a complete list -- NEW messages during an active task arrive
 * exclusively via WebSocket (appendOrUpdateMessage), never by polling.
 *
 * appendOrUpdateMessage UPSERTS by id rather than always appending: the
 * backend reserves a ManagerMessage row with fallback content and
 * broadcasts it immediately, then (if OpenAI succeeds) upgrades the SAME
 * row's content and broadcasts a second aria_message event with the same
 * id -- the UI should show that as one message whose text updates in
 * place, not two separate messages.
 */
export function useManagerMessages(sessionId: string, isRunning: boolean, historyRefreshTrigger: number) {
  const [messages, setMessages] = useState<ManagerMessage[]>([]);
  const [awaitingNewMessage, setAwaitingNewMessage] = useState(false);
  const analyzingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!sessionId || !isRunning) return;
    let cancelled = false;
    apiRequest<ManagerMessage[]>(`/sessions/${sessionId}/manager-messages`)
      .then((data) => {
        if (!cancelled) setMessages(data);
      })
      .catch((err) => {
        console.error("Could not load manager messages", err);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, isRunning, historyRefreshTrigger]);

  const clearAnalyzingTimeout = useCallback(() => {
    if (analyzingTimeoutRef.current !== null) {
      clearTimeout(analyzingTimeoutRef.current);
      analyzingTimeoutRef.current = null;
    }
  }, []);

  // Called on the real-time `aria_analyzing` WebSocket event.
  const showAnalyzing = useCallback(() => {
    setAwaitingNewMessage(true);
    clearAnalyzingTimeout();
    analyzingTimeoutRef.current = setTimeout(() => setAwaitingNewMessage(false), ANALYZING_SAFETY_TIMEOUT_MS);
  }, [clearAnalyzingTimeout]);

  // Called on the real-time `aria_message` WebSocket event.
  const appendOrUpdateMessage = useCallback(
    (incoming: ManagerMessage) => {
      setMessages((prev) => {
        const index = prev.findIndex((m) => m.id === incoming.id);
        if (index === -1) return [...prev, incoming];
        const next = [...prev];
        next[index] = incoming;
        return next;
      });
      setAwaitingNewMessage(false);
      clearAnalyzingTimeout();
    },
    [clearAnalyzingTimeout]
  );

  useEffect(() => clearAnalyzingTimeout, [clearAnalyzingTimeout]);

  const latest = messages[messages.length - 1] ?? null;

  return { messages, latestTone: latest?.tone ?? null, awaitingNewMessage, showAnalyzing, appendOrUpdateMessage };
}
