import WelcomeSection from "./components/WelcomeSection";
import SessionCard from "./components/SessionCard";
import TaskCard from "./components/TaskCard";
import AIManagerPanel from "./components/AIManagerPanel";
import NotificationsPanel from "./components/NotificationsPanel";
import Timeline from "./components/Timeline";
import StressWidget from "../stress/StressWidget";
import PerformanceOverview from "../analytics/PerformanceOverview";
import { useApp } from "../../contexts/AppContext";

function QuickActionsBar() {
  const { session, pauseSimulation, resumeSimulation, finishSession } = useApp();
  const isRunning = session.state === "running";
  const isPaused = session.state === "paused";

  const actions = [
    {
      label: "Pause",
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      ),
      color: "#f59e0b",
      bg: "rgba(245,158,11,0.08)",
      border: "rgba(245,158,11,0.2)",
      onClick: pauseSimulation,
      disabled: !isRunning,
    },
    {
      label: "Resume",
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5,3 19,12 5,21" />
        </svg>
      ),
      color: "#22c55e",
      bg: "rgba(34,197,94,0.08)",
      border: "rgba(34,197,94,0.2)",
      onClick: resumeSimulation,
      disabled: !isPaused,
    },
    {
      label: "Finish Session",
      icon: (
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      ),
      color: "#5B84C6",
      bg: "rgba(91,132,198,0.08)",
      border: "rgba(91,132,198,0.2)",
      onClick: finishSession,
      disabled: session.state === "finished",
    },
    {
      label: "Emergency Break",
      icon: (
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
      color: "#ef4444",
      bg: "rgba(239,68,68,0.06)",
      border: "rgba(239,68,68,0.18)",
      onClick: () => {},
      disabled: false,
    },
  ];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 20px",
        background: "rgba(255,255,255,0.7)",
        backdropFilter: "blur(8px)",
        borderRadius: 12,
        border: "1px solid rgba(0,0,0,0.05)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <span style={{ fontSize: 11.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.09em", marginRight: 8 }}>
        Quick Actions
      </span>
      {actions.map((a) => (
        <button
          key={a.label}
          onClick={a.onClick}
          disabled={a.disabled}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 13px",
            borderRadius: 8,
            background: a.disabled ? "rgba(0,0,0,0.03)" : a.bg,
            color: a.disabled ? "#94a3b8" : a.color,
            border: `1px solid ${a.disabled ? "rgba(0,0,0,0.06)" : a.border}`,
            fontWeight: 600,
            fontSize: 12,
            cursor: a.disabled ? "not-allowed" : "pointer",
            opacity: a.disabled ? 0.6 : 1,
            transition: "all 0.15s",
            letterSpacing: "-0.01em",
          }}
        >
          {a.icon}
          {a.label}
        </button>
      ))}
    </div>
  );
}

export default function Dashboard() {
  return (
    <div
      style={{
        padding: "24px 28px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        minHeight: "100%",
      }}
    >
      {/* ── Welcome Banner ── */}
      <WelcomeSection />

      {/* ── Row 1: Session | Task (dominant) | AI Manager ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px 1fr 380px",
          gap: 16,
          alignItems: "start",
        }}
      >
        <SessionCard />
        <TaskCard />
        <AIManagerPanel />
      </div>

      {/* ── Row 2: Stress | Performance | Timeline ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "280px 1fr 320px",
          gap: 16,
          alignItems: "start",
        }}
      >
        <StressWidget />
        <PerformanceOverview />
        <Timeline />
      </div>

      {/* ── Quick Actions bar ── */}
      <QuickActionsBar />

      {/* ── Notifications (bottom) ── */}
      <NotificationsPanel />
    </div>
  );
}
