import { useState } from "react";
import { useApp } from "../../../contexts/AppContext";

const MODE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; description: string }> = {
  supportive: { label: "Supportive", color: "#16a34a", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.25)", description: "Encouraging and flexible approach" },
  professional: { label: "Professional", color: "#5B84C6", bg: "rgba(91,132,198,0.08)", border: "rgba(91,132,198,0.25)", description: "Balanced expectations, clear goals" },
  demanding: { label: "Demanding", color: "#c2410c", bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.25)", description: "High output expected, limited tolerance" },
  strict: { label: "Strict", color: "#b45309", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", description: "Rigid deadlines, firm expectations" },
  micromanager: { label: "Micromanager", color: "#b91c1c", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)", description: "Constant oversight and intervention" },
};

const PENDING_REQUESTS = [
  { id: "r1", text: "Submit draft by 14:00 for review", urgency: "high" as const },
  { id: "r2", text: "Confirm EMEA variance root cause", urgency: "medium" as const },
];

const RECENT_LOG = [
  { time: "10:42", type: "directive" as const, text: "Deadline moved to 14:00. Adjust priorities." },
  { time: "09:58", text: "Session briefing delivered", type: "system" as const },
  { time: "09:15", text: "Task assigned: Q3 Performance Analysis", type: "assignment" as const },
];

const urgencyColor: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

export default function AIManagerPanel() {
  const { managerMode, pressureScore, isTyping } = useApp();
  const modeConf = MODE_CONFIG[managerMode] ?? MODE_CONFIG.professional;
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const handleAction = (action: string) => {
    setActiveAction(action);
    setTimeout(() => setActiveAction(null), 1200);
  };

  const pressureColor = pressureScore > 75 ? "#ef4444" : pressureScore > 50 ? "#f97316" : pressureScore > 30 ? "#f59e0b" : "#22c55e";
  const pressureLabel = pressureScore > 75 ? "Critical" : pressureScore > 50 ? "High" : pressureScore > 30 ? "Moderate" : "Low";

  return (
    <div
      className="glass-card"
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: 0,
        border: "1px solid rgba(39,67,93,0.12)",
      }}
    >
      {/* ── Header: Avatar + Identity + State ── */}
      <div
        style={{
          padding: "18px 22px 16px",
          background: "linear-gradient(135deg, rgba(39,67,93,0.06) 0%, rgba(91,132,198,0.04) 100%)",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
          {/* Avatar */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: "linear-gradient(145deg, #27435D 0%, #3d6b8a 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 12px rgba(39,67,93,0.3)",
              }}
            >
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
                <path d="M12 2C9.8 2 8 3.8 8 6s1.8 4 4 4 4-1.8 4-4-1.8-4-4-4z" fill="rgba(255,255,255,0.9)" />
                <rect x="4" y="13" width="16" height="9" rx="3" fill="rgba(255,255,255,0.9)" />
                <circle cx="9" cy="18" r="1" fill="#27435D" />
                <circle cx="15" cy="18" r="1" fill="#27435D" />
                <path d="M9 16h6" stroke="#27435D" strokeWidth={1.2} strokeLinecap="round" />
              </svg>
            </div>
            <span
              className="pulse-badge"
              style={{
                position: "absolute",
                bottom: -2,
                right: -2,
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "#22c55e",
                border: "2px solid white",
                display: "block",
              }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1A2B3C", letterSpacing: "-0.02em" }}>
              ARIA — AI Supervisor
            </div>
            <div style={{ fontSize: 12, color: "#6B7A8D", marginTop: 1 }}>
              {isTyping ? (
                <span style={{ color: "#5B84C6", fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
                  <span>Composing directive</span>
                  <span style={{ display: "flex", gap: 2 }}>
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="typing-dot" style={{ width: 4, height: 4, borderRadius: "50%", background: "#5B84C6", display: "block" }} />
                    ))}
                  </span>
                </span>
              ) : (
                "Monitoring · Updated 3 min ago"
              )}
            </div>
          </div>

          {/* Mode badge */}
          <div
            style={{
              padding: "5px 12px",
              borderRadius: 99,
              background: modeConf.bg,
              border: `1px solid ${modeConf.border}`,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: modeConf.color }}>{modeConf.label}</span>
          </div>
        </div>

        {/* Pressure meter */}
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.5)",
            border: "1px solid rgba(0,0,0,0.05)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "#6B7A8D" }}>Pressure Level</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: pressureColor, letterSpacing: "-0.02em" }}>
                {pressureScore}/100
                <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 5, color: pressureColor }}>
                  ({pressureLabel})
                </span>
              </span>
            </div>
            <div style={{ height: 5, borderRadius: 99, background: "#EEF1F6", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${pressureScore}%`,
                  borderRadius: 99,
                  background: `linear-gradient(90deg, #22c55e, #f59e0b ${pressureScore > 50 ? "40%" : "80%"}, ${pressureScore > 75 ? "#ef4444" : "#f97316"})`,
                  transition: "width 1s ease",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Current Directive ── */}
      <div style={{ padding: "14px 22px", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: modeConf.color,
            }}
          />
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "#6B7A8D", textTransform: "uppercase", letterSpacing: "0.09em" }}>
            Current Directive
          </span>
        </div>
        <div
          style={{
            fontSize: 13.5,
            color: "#1A2B3C",
            lineHeight: 1.6,
            padding: "12px 14px",
            background: "rgba(39,67,93,0.04)",
            borderRadius: 9,
            borderLeft: `3px solid ${modeConf.color}`,
            fontWeight: 500,
          }}
        >
          Complete the Q3 Performance Analysis by{" "}
          <strong style={{ color: "#ef4444" }}>14:00 today</strong>. Focus on the EMEA revenue
          shortfall and cross-reference with adjusted forecasts. I expect a fully annotated draft —
          not a skeleton. Current progress is below the expected pace.
        </div>
      </div>

      {/* ── Latest Feedback ── */}
      <div style={{ padding: "14px 22px", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="#8D74FF" strokeWidth={2.5}>
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          </svg>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "#6B7A8D", textTransform: "uppercase", letterSpacing: "0.09em" }}>
            Latest Feedback
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "rgba(141,116,255,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#8D74FF" strokeWidth={2}>
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <div style={{ fontSize: 13, color: "#4B5A6A", lineHeight: 1.55 }}>
            "Your data extraction was efficient. However, the narrative framing needs more clarity.
            Section 2 still lacks the executive summary paragraph. Correct this before submission."
          </div>
        </div>
      </div>

      {/* ── Pending Requests ── */}
      <div style={{ padding: "14px 22px", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="#f97316" strokeWidth={2.5}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "#6B7A8D", textTransform: "uppercase", letterSpacing: "0.09em" }}>
            Pending Requests
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: 10.5,
              fontWeight: 700,
              color: "#f97316",
              background: "rgba(249,115,22,0.1)",
              padding: "1px 7px",
              borderRadius: 99,
            }}
          >
            {PENDING_REQUESTS.length} open
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {PENDING_REQUESTS.map((req) => (
            <div
              key={req.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 8,
                background: "rgba(0,0,0,0.025)",
                border: "1px solid rgba(0,0,0,0.05)",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: urgencyColor[req.urgency],
                  flexShrink: 0,
                  display: "block",
                }}
              />
              <span style={{ fontSize: 12.5, color: "#1A2B3C", flex: 1, fontWeight: 500 }}>{req.text}</span>
              <button
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#5B84C6",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px 6px",
                  borderRadius: 5,
                }}
              >
                Done
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Communication Log ── */}
      <div style={{ padding: "12px 22px", flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#6B7A8D", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 10 }}>
          Communication Log
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {RECENT_LOG.map((entry, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "7px 0",
                borderBottom: i < RECENT_LOG.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none",
              }}
            >
              <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, flexShrink: 0, marginTop: 1, minWidth: 34 }}>
                {entry.time}
              </span>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 5,
                  flexShrink: 0,
                  background:
                    entry.type === "directive"
                      ? "rgba(249,115,22,0.1)"
                      : entry.type === "assignment"
                      ? "rgba(91,132,198,0.1)"
                      : "rgba(0,0,0,0.04)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {entry.type === "directive" && (
                  <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="#f97316" strokeWidth={2.5}>
                    <path d="M22 2L11 13" /><polygon fill="#f97316" stroke="none" points="22,2 15,22 11,13 2,9" />
                  </svg>
                )}
                {entry.type === "assignment" && (
                  <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="#5B84C6" strokeWidth={2.5}>
                    <polyline points="9 11 12 14 22 4" />
                  </svg>
                )}
                {entry.type === "system" && (
                  <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="#94a3b8" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                )}
              </div>
              <span style={{ fontSize: 12, color: "#4B5A6A", lineHeight: 1.45 }}>{entry.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div
        style={{
          padding: "12px 22px 16px",
          borderTop: "1px solid rgba(0,0,0,0.06)",
          background: "rgba(255,255,255,0.5)",
        }}
      >
        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#6B7A8D", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 9 }}>
          Respond
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {[
            { label: "Acknowledge", icon: "✓", color: "#22c55e", bg: "rgba(34,197,94,0.07)", border: "rgba(34,197,94,0.25)" },
            { label: "Ask for Clarification", icon: "?", color: "#5B84C6", bg: "rgba(91,132,198,0.07)", border: "rgba(91,132,198,0.25)" },
            { label: "Request More Time", icon: "⏱", color: "#8D74FF", bg: "rgba(141,116,255,0.07)", border: "rgba(141,116,255,0.25)" },
          ].map((action) => (
            <button
              key={action.label}
              onClick={() => handleAction(action.label)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 13px",
                borderRadius: 8,
                background: activeAction === action.label ? action.bg : "rgba(0,0,0,0.03)",
                border: `1px solid ${activeAction === action.label ? action.border : "rgba(0,0,0,0.07)"}`,
                color: activeAction === action.label ? action.color : "#6B7A8D",
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
                transition: "all 0.15s ease",
                letterSpacing: "-0.01em",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = action.bg;
                (e.currentTarget as HTMLButtonElement).style.borderColor = action.border;
                (e.currentTarget as HTMLButtonElement).style.color = action.color;
              }}
              onMouseLeave={(e) => {
                if (activeAction !== action.label) {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.03)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,0,0,0.07)";
                  (e.currentTarget as HTMLButtonElement).style.color = "#6B7A8D";
                }
              }}
            >
              <span style={{ fontSize: 10 }}>{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
