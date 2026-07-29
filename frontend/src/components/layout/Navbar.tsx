import { useState } from "react";
import { useApp } from "../../contexts/AppContext";
import { useTime } from "../../hooks/useTime";

export default function Navbar() {
  const { user, session, notifications } = useApp();
  const now = useTime();
  const [showNotifs, setShowNotifs] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;

  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const stateColor = session.state === "running" ? "#22c55e" : session.state === "paused" ? "#f59e0b" : "#94a3b8";
  const stateLabel = session.state === "running" ? "Session Active" : session.state === "paused" ? "Paused" : "Idle";

  return (
    <header
      style={{
        height: 60,
        backgroundColor: "rgba(255,255,255,0.8)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        display: "flex",
        alignItems: "center",
        padding: "0 28px",
        gap: 20,
        position: "sticky",
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Left: page title */}
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#1A2B3C", letterSpacing: "-0.01em" }}>
          Dashboard
        </span>
        <span style={{ color: "#94a3b8", margin: "0 6px", fontSize: 14 }}>/</span>
        <span style={{ fontSize: 13, color: "#6B7A8D" }}>Overview</span>
      </div>

      {/* Right: controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {/* Session status */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            background: "rgba(0,0,0,0.04)",
            padding: "5px 12px",
            borderRadius: 99,
            border: "1px solid rgba(0,0,0,0.05)",
          }}
        >
          <span
            className={session.state === "running" ? "pulse-badge" : ""}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              backgroundColor: stateColor,
              display: "block",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 12, fontWeight: 600, color: "#1A2B3C" }}>{stateLabel}</span>
        </div>

        {/* Clock */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1A2B3C", letterSpacing: "-0.01em", lineHeight: 1.2 }}>
            {timeStr}
          </div>
          <div style={{ fontSize: 11, color: "#6B7A8D", lineHeight: 1.2 }}>{dateStr}</div>
        </div>

        {/* Notifications */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowNotifs((v) => !v)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.07)",
              background: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              position: "relative",
              transition: "background 0.15s",
            }}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#6B7A8D" strokeWidth={1.8}>
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            {unread > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  backgroundColor: "#5B84C6",
                  border: "1.5px solid white",
                }}
              />
            )}
          </button>

          {showNotifs && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                width: 320,
                background: "white",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.07)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
                zIndex: 100,
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(0,0,0,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: "#1A2B3C" }}>Notifications</span>
                {unread > 0 && <span style={{ fontSize: 11, color: "#5B84C6", fontWeight: 500 }}>{unread} unread</span>}
              </div>
              {notifications.slice(0, 3).map((n) => (
                <div
                  key={n.id}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid rgba(0,0,0,0.04)",
                    background: n.read ? "transparent" : "rgba(91,132,198,0.04)",
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      backgroundColor: n.read ? "#d1d5db" : "#5B84C6",
                      flexShrink: 0,
                      marginTop: 5,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1A2B3C", marginBottom: 2 }}>{n.title}</div>
                    <div style={{ fontSize: 11.5, color: "#6B7A8D", lineHeight: 1.4 }}>{n.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* User avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #5B84C6, #8D74FF)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontWeight: 700,
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            {user.name.split(" ").map((n) => n[0]).join("")}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1A2B3C", lineHeight: 1.2 }}>{user.name}</div>
            <div style={{ fontSize: 11, color: "#6B7A8D", lineHeight: 1.2 }}>{user.role}</div>
          </div>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth={2}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>
    </header>
  );
}
