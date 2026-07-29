import { useApp } from "../../../contexts/AppContext";

const PHASE_LABELS: Record<string, string> = {
  onboarding: "Onboarding",
  warmup: "Warm-up",
  peak: "Peak Performance",
  cooldown: "Cool-down",
  review: "Review",
};

const PRESSURE_LABELS: Record<string, string> = {
  very_low: "Very Low",
  low: "Low",
  moderate: "Moderate",
  high: "High",
  very_high: "Very High",
};

const PRESSURE_COLORS: Record<string, string> = {
  very_low: "#22c55e",
  low: "#86efac",
  moderate: "#f59e0b",
  high: "#f97316",
  very_high: "#ef4444",
};

export default function WelcomeSection() {
  const { user, session, pressureScore, startSimulation } = useApp();
  const pressure = pressureScore > 80 ? "very_high" : pressureScore > 60 ? "high" : pressureScore > 40 ? "moderate" : pressureScore > 20 ? "low" : "very_low";

  return (
    <div
      className="glass-card"
      style={{
        padding: "28px 32px",
        background: "linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(91,132,198,0.07) 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Decorative orb */}
      <div
        style={{
          position: "absolute",
          top: -60,
          right: 200,
          width: 280,
          height: 280,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(141,116,255,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: "#6B7A8D", fontWeight: 500, marginBottom: 4, letterSpacing: "0.01em" }}>
          Good morning —
        </div>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: "#1A2B3C",
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            margin: "0 0 16px",
          }}
        >
          Welcome back, {user.name.split(" ")[0]}
        </h1>

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: "rgba(91,132,198,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="#5B84C6" strokeWidth={2}>
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Status
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1A2B3C" }}>
                {session.state === "running" ? "Simulation Active" : session.state === "paused" ? "Paused" : "Idle"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: "rgba(141,116,255,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="#8D74FF" strokeWidth={2}>
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Phase
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1A2B3C" }}>
                {PHASE_LABELS[session.phase]}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: `${PRESSURE_COLORS[pressure]}18`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke={PRESSURE_COLORS[pressure]} strokeWidth={2}>
                <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" />
                <path d="M12 8v4l3 3" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Pressure
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: PRESSURE_COLORS[pressure] }}>
                {PRESSURE_LABELS[pressure]}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Start button */}
      {session.state !== "running" && (
        <button
          onClick={startSimulation}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "13px 24px",
            background: "linear-gradient(135deg, #5B84C6, #8D74FF)",
            color: "white",
            fontWeight: 600,
            fontSize: 14,
            borderRadius: 12,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(91,132,198,0.35)",
            transition: "opacity 0.2s, transform 0.2s",
            flexShrink: 0,
            letterSpacing: "-0.01em",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.opacity = "0.92";
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.02)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.opacity = "1";
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
          }}
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.4)" strokeWidth={1.5} />
            <polygon fill="white" points="10,8 17,12 10,16" />
          </svg>
          Start Simulation
        </button>
      )}

      {session.state === "running" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            background: "rgba(34,197,94,0.1)",
            borderRadius: 10,
            border: "1px solid rgba(34,197,94,0.2)",
            flexShrink: 0,
          }}
        >
          <span
            className="pulse-badge"
            style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "block" }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#16a34a" }}>Simulation Running</span>
        </div>
      )}
    </div>
  );
}
