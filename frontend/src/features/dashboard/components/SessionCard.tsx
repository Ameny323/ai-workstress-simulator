import { useApp } from "../../../contexts/AppContext";
import { formatDuration } from "../../../hooks/useTime";

const PHASE_LABELS: Record<string, string> = {
  onboarding: "Onboarding",
  warmup: "Warm-up",
  peak: "Peak Performance",
  cooldown: "Cool-down",
  review: "Review",
};

const STATE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  running: { label: "Running", color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  paused: { label: "Paused", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  idle: { label: "Idle", color: "#94a3b8", bg: "rgba(148,163,184,0.1)" },
  finished: { label: "Finished", color: "#8D74FF", bg: "rgba(141,116,255,0.1)" },
};

const PHASE_ORDER = ["onboarding", "warmup", "peak", "cooldown", "review"];

export default function SessionCard() {
  const { session } = useApp();
  const stateConf = STATE_CONFIG[session.state] ?? STATE_CONFIG.idle;
  const totalTime = session.elapsedTime + session.remainingTime;
  const progress = totalTime > 0 ? (session.elapsedTime / totalTime) * 100 : 0;
  const phaseIdx = PHASE_ORDER.indexOf(session.phase);

  return (
    <div className="glass-card" style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 3 }}>
            Session
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1A2B3C", letterSpacing: "-0.01em" }}>
            {session.id}
          </div>
        </div>
        <div
          style={{
            padding: "4px 10px",
            borderRadius: 99,
            background: stateConf.bg,
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <span
            className={session.state === "running" ? "pulse-badge" : ""}
            style={{ width: 6, height: 6, borderRadius: "50%", background: stateConf.color, display: "block" }}
          />
          <span style={{ fontSize: 11.5, fontWeight: 700, color: stateConf.color }}>{stateConf.label}</span>
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <div style={{ fontSize: 36, fontWeight: 800, color: "#1A2B3C", letterSpacing: "-0.05em", lineHeight: 1 }}>
          {formatDuration(session.elapsedTime)}
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 5, fontWeight: 500 }}>elapsed</div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11.5, color: "#6B7A8D", fontWeight: 500 }}>Session progress</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#1A2B3C" }}>{Math.round(progress)}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 99, background: "#EEF1F6", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              borderRadius: 99,
              background: "linear-gradient(90deg, #5B84C6, #8D74FF)",
              transition: "width 1s linear",
            }}
          />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>
          Phase
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {PHASE_ORDER.map((ph, i) => (
            <div key={ph} style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
              <div
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 99,
                  background: i <= phaseIdx ? "#5B84C6" : "#EEF1F6",
                  transition: "background 0.3s",
                }}
              />
              {i === phaseIdx && (
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#5B84C6",
                    flexShrink: 0,
                    boxShadow: "0 0 0 3px rgba(91,132,198,0.2)",
                  }}
                />
              )}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#5B84C6", marginTop: 5 }}>
          {PHASE_LABELS[session.phase]}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          padding: "12px",
          background: "rgba(0,0,0,0.025)",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        <div>
          <div style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 600, marginBottom: 2 }}>Remaining</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#1A2B3C", letterSpacing: "-0.02em" }}>
            {formatDuration(session.remainingTime)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 600, marginBottom: 2 }}>Tasks Done</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#1A2B3C", letterSpacing: "-0.02em" }}>
            3 / 7
          </div>
        </div>
      </div>
    </div>
  );
}
