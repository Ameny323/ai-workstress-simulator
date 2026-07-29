import type { ReactNode } from "react";
import { useApp } from "../../contexts/AppContext";


interface ActionButtonProps {
  label: string;
  icon: ReactNode;
  color: string;
  bg: string;
  border: string;
  onClick: () => void;
  disabled?: boolean;
}

function ActionButton({ label, icon, color, bg, border, onClick, disabled }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "11px 14px",
        borderRadius: 9,
        background: bg,
        color,
        border: `1px solid ${border}`,
        fontWeight: 600,
        fontSize: 12.5,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "opacity 0.15s, transform 0.15s",
        width: "100%",
        letterSpacing: "-0.01em",
        textAlign: "left",
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.opacity = "0.8";
      }}
      onMouseLeave={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.opacity = "1";
      }}
    >
      <span style={{ flexShrink: 0 }}>{icon}</span>
      {label}
    </button>
  );
}

export default function QuickActions() {
  const { session, pauseSimulation, resumeSimulation, finishSession } = useApp();
  const isRunning = session.state === "running";
  const isPaused = session.state === "paused";

  return (
    <div className="glass-card" style={{ padding: "18px 20px" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#1A2B3C", letterSpacing: "-0.01em", marginBottom: 14 }}>
        Quick Actions
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <ActionButton
          label="Pause Simulation"
          color="#f59e0b"
          bg="rgba(245,158,11,0.08)"
          border="rgba(245,158,11,0.25)"
          onClick={pauseSimulation}
          disabled={!isRunning}
          icon={
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
              <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
            </svg>
          }
        />

        <ActionButton
          label="Resume"
          color="#22c55e"
          bg="rgba(34,197,94,0.08)"
          border="rgba(34,197,94,0.25)"
          onClick={resumeSimulation}
          disabled={!isPaused}
          icon={
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
              <polygon fill="currentColor" points="5,3 19,12 5,21" />
            </svg>
          }
        />

        <ActionButton
          label="Finish Session"
          color="#5B84C6"
          bg="rgba(91,132,198,0.08)"
          border="rgba(91,132,198,0.25)"
          onClick={finishSession}
          disabled={session.state === "finished"}
          icon={
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
          }
        />

        <div style={{ height: 1, background: "rgba(0,0,0,0.05)", margin: "4px 0" }} />

        <ActionButton
          label="Emergency Break"
          color="#ef4444"
          bg="rgba(239,68,68,0.06)"
          border="rgba(239,68,68,0.2)"
          onClick={() => {}}
          icon={
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          }
        />
      </div>

      <div
        style={{
          marginTop: 14,
          padding: "10px 12px",
          borderRadius: 8,
          background: "rgba(0,0,0,0.03)",
          border: "1px solid rgba(0,0,0,0.05)",
          fontSize: 11.5,
          color: "#6B7A8D",
          lineHeight: 1.45,
        }}
      >
        {isRunning && "Simulation is active. You may pause or finish at any time."}
        {isPaused && "Session is paused. Resume when ready or finish the session."}
        {session.state === "finished" && "Session complete. Review your performance in Analytics."}
        {session.state === "idle" && "No active session. Start a simulation from the welcome panel."}
      </div>
    </div>
  );
}
