import type { ReactNode } from "react";
import { useApp } from "../../../contexts/AppContext";
import { formatRelativeTime } from "../../../hooks/useTime";
import type { TimelineEvent } from "../../../types";

const EVENT_CONFIG: Record<TimelineEvent["type"], { color: string; bg: string; icon: ReactNode }> = {
  task_completed: {
    color: "#22c55e",
    bg: "rgba(34,197,94,0.1)",
    icon: (
      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  manager_message: {
    color: "#5B84C6",
    bg: "rgba(91,132,198,0.1)",
    icon: (
      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
  stress_declared: {
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.1)",
    icon: (
      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  task_assigned: {
    color: "#8D74FF",
    bg: "rgba(141,116,255,0.1)",
    icon: (
      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    ),
  },
};

export default function Timeline() {
  const { timeline } = useApp();

  return (
    <div className="glass-card" style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1A2B3C", letterSpacing: "-0.01em" }}>
          Activity Timeline
        </div>
        <span style={{ fontSize: 11.5, color: "#5B84C6", fontWeight: 500, cursor: "pointer" }}>View all</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
        {/* Vertical line */}
        <div
          style={{
            position: "absolute",
            left: 13,
            top: 14,
            bottom: 14,
            width: 1,
            background: "rgba(0,0,0,0.06)",
          }}
        />

        {timeline.map((event, idx) => {
          const conf = EVENT_CONFIG[event.type];
          return (
            <div
              key={event.id}
              style={{
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
                paddingBottom: idx < timeline.length - 1 ? 18 : 0,
                position: "relative",
                zIndex: 1,
              }}
            >
              {/* Dot */}
              <div
                style={{
                  width: 27,
                  height: 27,
                  borderRadius: 7,
                  background: conf.bg,
                  color: conf.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  border: `1px solid ${conf.color}30`,
                }}
              >
                {conf.icon}
              </div>

              <div style={{ flex: 1, paddingTop: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1A2B3C" }}>{event.title}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }}>
                    {formatRelativeTime(event.timestamp)}
                  </div>
                </div>
                {event.description && (
                  <div style={{ fontSize: 11.5, color: "#6B7A8D", marginTop: 2, lineHeight: 1.4 }}>
                    {event.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
