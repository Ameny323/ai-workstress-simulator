import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { DURATION_BASE, EASE_ENTER } from "@/lib/motion";
import type { ManagerMessage, ManagerTone } from "../hooks/useManagerMessages";
import type { SessionTelemetry } from "../hooks/useSessionTelemetry";
import type { ConnectionStatus, StressDeclaredEvent } from "@/services/websocket/websocketTypes";
import StressWidget from "@/features/stress/StressWidget";

// WorkPulse palette (calm, professional -- no red-alert styling for a
// merely-reconnecting socket; muted danger is reserved for a hard error).
const CONNECTION_STATUS_META: Record<ConnectionStatus, { label: string; color: string; pulse: boolean }> = {
  connected: { label: "LIVE", color: "", pulse: true }, // color resolved from ARIA tone below when connected
  connecting: { label: "CONNECTING…", color: "#718493", pulse: true },
  reconnecting: { label: "RECONNECTING…", color: "#B89A61", pulse: true },
  disconnected: { label: "OFFLINE", color: "#718493", pulse: false },
  error: { label: "OFFLINE", color: "#B97878", pulse: false },
};

// Real ARIA supervisor panel -- ported from a mockup whose "ARIA" was a
// fully client-side simulation (French messages triggered by local idle
// timers, fake pace/focus/workload metrics computed from interaction
// timing). Here every value comes from the real backend: GET
// /sessions/{id}/manager-messages and /performance-snapshot. The mockup's
// Pace/Focus/Workload tiles are deliberately NOT reproduced -- there's no
// server-side equivalent for them, and inventing one would repeat the
// "Fallback mode" mock-data mistake this project has already been
// corrected on once.
//
// Tone -> color uses the same muted WorkPulse palette as the rest of
// CockpitPage (not lib/motion.ts's more saturated signal colors, which
// would look inconsistent next to the cockpit's own muted accents):
// bienveillant -> muted success, exigeant -> muted warning, intrusif ->
// muted danger, neutre -> muted gray.
const TONE_COLOR: Record<ManagerTone, string> = {
  bienveillant: "#719887",
  neutre: "#718493",
  exigeant: "#B89A61",
  intrusif: "#B97878",
};

const TONE_LABEL: Record<ManagerTone, string> = {
  bienveillant: "Bienveillant",
  neutre: "Neutre",
  exigeant: "Exigeant",
  intrusif: "Intrusif",
};

// Escalation order the real ManagerTone enum is generated in
// (app/ai/manager_service.py: mercy rule -> bienveillant, difficulty-up ->
// exigeant, error streak -> intrusif) -- the mockup's own 4-stage track
// used the same shape under different English names, so it maps directly.
const TONE_TRACK: ManagerTone[] = ["bienveillant", "neutre", "exigeant", "intrusif"];

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

interface AISupervisorPanelProps {
  messages: ManagerMessage[];
  awaitingNewMessage: boolean;
  telemetry: SessionTelemetry | null;
  sessionId: string;
  isSessionActive: boolean;
  connectionStatus: ConnectionStatus;
  latestStressEvent: StressDeclaredEvent | null;
}

export default function AISupervisorPanel({
  messages,
  awaitingNewMessage,
  telemetry,
  sessionId,
  isSessionActive,
  connectionStatus,
  latestStressEvent,
}: AISupervisorPanelProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const latestTone = messages[messages.length - 1]?.tone ?? null;
  const trackIdx = latestTone ? TONE_TRACK.indexOf(latestTone) : -1;
  const statusMeta = CONNECTION_STATUS_META[connectionStatus];
  const statusColor = connectionStatus === "connected" ? (latestTone ? TONE_COLOR[latestTone] : "#94a3b8") : statusMeta.color;
  const declaredStress = latestStressEvent?.stress_level ?? telemetry?.declared_stress ?? null;

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages.length, awaitingNewMessage]);

  return (
    <aside
      style={{
        width: 300,
        minWidth: 300,
        backgroundColor: "#fff",
        borderLeft: "1px solid #D9E2E8",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "16px 18px", borderBottom: "1px solid #D9E2E8" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#243746" }}>ARIA</div>
            <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#718493" }}>
              AI Work Supervisor
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }} title={`WebSocket: ${connectionStatus}`}>
            <span
              className={statusMeta.pulse ? "pulse-badge" : undefined}
              style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: statusColor }}
            />
            <span style={{ fontSize: 9, color: "#718493", letterSpacing: "0.04em" }}>{statusMeta.label}</span>
          </div>
        </div>
      </div>

      <div ref={feedRef} style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#718493" }}>
          Supervisor Activity
        </div>
        {messages.length === 0 && !awaitingNewMessage && (
          <p style={{ fontSize: 11, textAlign: "center", color: "#B7C2CB", marginTop: 16 }}>ARIA is observing your session…</p>
        )}
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION_BASE / 1000, ease: EASE_ENTER }}
            style={{ borderRadius: 10, padding: "10px 12px", background: "#F3F6F8", border: "1px solid #EAEFF3" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: TONE_COLOR[msg.tone] }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: TONE_COLOR[msg.tone] }}>ARIA</span>
              </div>
              <span style={{ fontSize: 9, color: "#718493", fontVariantNumeric: "tabular-nums" }}>{formatTime(msg.sent_at)}</span>
            </div>
            <p style={{ fontSize: 11.5, lineHeight: 1.5, color: "#243746", margin: 0 }}>"{msg.content}"</p>
          </motion.div>
        ))}
        {awaitingNewMessage && (
          <div style={{ borderRadius: 10, padding: "10px 12px", background: "#F3F6F8", border: "1px solid #EAEFF3" }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8D88A8", marginBottom: 6 }}>
              ARIA is analyzing
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.22, ease: "easeInOut" }}
                  style={{ width: 5, height: 5, borderRadius: "50%", background: "#8D88A8", display: "inline-block" }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "14px 18px", borderTop: "1px solid #F3F6F8" }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#718493", marginBottom: 10 }}>
          Live Performance
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" }}>
          <div>
            <div style={{ fontSize: 9, color: "#718493" }}>Avg. score</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#243746" }}>
              {telemetry ? `${Math.round(telemetry.avg_score)}%` : "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#718493" }}>Error streak</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#243746" }}>{telemetry ? telemetry.consecutive_errors : "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#718493" }}>Tasks done</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#243746" }}>{telemetry ? telemetry.tasks_completed_in_session : "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#718493" }}>Declared stress</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#243746" }}>
              {declaredStress != null ? `${declaredStress}/5` : "Not reported"}
            </div>
          </div>
        </div>
      </div>

      <StressWidget sessionId={sessionId} disabled={!isSessionActive} />

      <div style={{ padding: "14px 18px", borderTop: "1px solid #F3F6F8" }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#718493", marginBottom: 10 }}>
          AI Supervision Level
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          {TONE_TRACK.map((tone, i) => {
            const active = i === trackIdx;
            const reached = trackIdx >= 0 && i <= trackIdx;
            return (
              <div key={tone} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                <div style={{ width: "100%", height: 2, borderRadius: 2, background: reached ? TONE_COLOR[tone] : "#E3E9EE" }} />
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: active ? TONE_COLOR[tone] : "#fff",
                    border: `2px solid ${active ? TONE_COLOR[tone] : "#E3E9EE"}`,
                    transform: active ? "scale(1.2)" : "scale(1)",
                    transition: "all 0.4s ease",
                  }}
                />
                <span style={{ fontSize: 8, color: active ? "#243746" : "#B7C2CB", fontWeight: active ? 600 : 400 }}>
                  {TONE_LABEL[tone].slice(0, 4)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
