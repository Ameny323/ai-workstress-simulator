import type { ReactNode } from "react";
import { useApp } from "../../../contexts/AppContext";
import { formatRelativeTime } from "../../../hooks/useTime";
import type { Notification } from "../../../types";

const TYPE_CONFIG: Record<Notification["type"], { icon: ReactNode; color: string; bg: string; label: string }> = {
  task_assigned: {
    color: "#5B84C6",
    bg: "rgba(91,132,198,0.1)",
    label: "Task",
    icon: (
      <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
  },
  deadline_reduced: {
    color: "#ef4444",
    bg: "rgba(239,68,68,0.1)",
    label: "Deadline",
    icon: (
      <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  pressure_increased: {
    color: "#f97316",
    bg: "rgba(249,115,22,0.1)",
    label: "Pressure",
    icon: (
      <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  reminder: {
    color: "#8D74FF",
    bg: "rgba(141,116,255,0.1)",
    label: "Reminder",
    icon: (
      <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    ),
  },
};

export default function NotificationsPanel() {
  const { notifications } = useApp();
  const unread = notifications.filter((n) => !n.read);
  const recent = notifications.slice(0, 4);

  return (
    <div className="glass-card" style={{ padding: "16px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1A2B3C", letterSpacing: "-0.01em" }}>
            Recent Notifications
          </div>
          {unread.length > 0 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#5B84C6",
                background: "rgba(91,132,198,0.1)",
                padding: "2px 8px",
                borderRadius: 99,
              }}
            >
              {unread.length} new
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: "#5B84C6", fontWeight: 600, cursor: "pointer" }}>
          Mark all read
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {recent.map((n) => {
          const conf = TYPE_CONFIG[n.type];
          return (
            <div
              key={n.id}
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                background: n.read ? "rgba(0,0,0,0.02)" : "rgba(91,132,198,0.04)",
                border: n.read ? "1px solid rgba(0,0,0,0.05)" : "1px solid rgba(91,132,198,0.12)",
                cursor: "pointer",
                transition: "background 0.15s",
                position: "relative",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(91,132,198,0.07)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = n.read ? "rgba(0,0,0,0.02)" : "rgba(91,132,198,0.04)"; }}
            >
              {!n.read && (
                <span
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 10,
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#5B84C6",
                    display: "block",
                  }}
                />
              )}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  background: conf.bg,
                  color: conf.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 8,
                }}
              >
                {conf.icon}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: conf.color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>
                {conf.label}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#1A2B3C", lineHeight: 1.35, marginBottom: 4 }}>
                {n.title}
              </div>
              <div style={{ fontSize: 11, color: "#6B7A8D", lineHeight: 1.4, marginBottom: 5 }}>
                {n.description}
              </div>
              <div style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 500 }}>
                {formatRelativeTime(n.timestamp)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
