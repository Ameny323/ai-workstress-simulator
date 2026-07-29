import type { ReactNode } from "react";
import { useApp } from "../../../contexts/AppContext";
import { formatRelativeTime } from "../../../hooks/useTime";
import type { TimelineEvent } from "../../../types";

const EVENT_CONFIG: Record<TimelineEvent["type"], { color: string; bg: string; label: string; icon: ReactNode }> = {
  task_completed: {
    color: "#22c55e",
    bg: "rgba(34,197,94,0.1)",
    label: "Task Completed",
    icon: (
      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  manager_message: {
    color: "#5B84C6",
    bg: "rgba(91,132,198,0.1)",
    label: "Manager Message",
    icon: (
      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
  stress_declared: {
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.1)",
    label: "Stress Updated",
    icon: (
      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  task_assigned: {
    color: "#8D74FF",
    bg: "rgba(141,116,255,0.1)",
    label: "Task Assigned",
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
    <div className="glass-card" style={{ padding: "20px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1A2B3C", letterSpacing: "-0.02em" }}>
            Activity Timeline
          </div>
          <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 1 }}>Simulation progression</div>
        </div>
        <span
          style={{
            fontSize: 11.5,
            color: "#5B84C6",
            fontWeight: 600,
            cursor: "pointer",
            padding: "4px 10px",
            borderRadius: 7,
            background: "rgba(91,132,198,0.07)",
          }}
        >
          View all →
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
        {/* Vertical connector */}
        <div
          style={{
            position: "absolute",
            left: 15,
            top: 30,
            bottom: 16,
            width: 1,
            background: "linear-gradient(180deg, rgba(91,132,198,0.2) 0%, rgba(0,0,0,0.04) 100%)",
          }}
        />

        {timeline.map((event, idx) => {
          const conf = EVENT_CONFIG[event.type];
          return (
            <div
              key={event.id}
              className="fade-in"
              style={{
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
                paddingBottom: idx < timeline.length - 1 ? 20 : 0,
                position: "relative",
                zIndex: 1,
              }}
            >
              {/* Icon dot */}
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: conf.bg,
                  color: conf.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  border: `1.5px solid ${conf.color}35`,
                  boxShadow: `0 0 0 3px ${conf.bg}`,
                }}
              >
                {conf.icon}
              </div>

              {/* Content */}
              <div style={{ flex: 1, paddingTop: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "#1A2B3C" }}>{event.title}</span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: conf.color,
                        background: conf.bg,
                        padding: "1px 6px",
                        borderRadius: 4,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {conf.label}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0, fontWeight: 500 }}>
                    {formatRelativeTime(event.timestamp)}
                  </span>
                </div>
                {event.description && (
                  <div style={{ fontSize: 12, color: "#6B7A8D", lineHeight: 1.45 }}>
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
