import { useApp } from "../../contexts/AppContext";
import type { ManagerMode } from "../../types";

const MODES: { value: ManagerMode; label: string; description: string; color: string }[] = [
  { value: "supportive", label: "Supportive", description: "Encouraging and flexible", color: "#22c55e" },
  { value: "professional", label: "Professional", description: "Balanced expectations", color: "#5B84C6" },
  { value: "demanding", label: "Demanding", description: "High output focus", color: "#f97316" },
  { value: "strict", label: "Strict", description: "Rigid deadlines, firm", color: "#f59e0b" },
  { value: "micromanager", label: "Micromanager", description: "Constant oversight", color: "#ef4444" },
];

function PressureGauge({ score }: { score: number }) {
  const angle = (score / 100) * 180 - 90;
  const color = score > 75 ? "#ef4444" : score > 50 ? "#f97316" : score > 25 ? "#f59e0b" : "#22c55e";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ position: "relative", width: 100, height: 56 }}>
        <svg width="100" height="56" viewBox="0 0 100 56">
          {/* Background arc */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="#EEF1F6"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {/* Colored arc */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 125.7} 125.7`}
            opacity={0.3}
          />
          {/* Needle */}
          <g transform={`translate(50, 50) rotate(${angle})`}>
            <line x1="0" y1="0" x2="0" y2="-32" stroke={color} strokeWidth="2" strokeLinecap="round" />
            <circle cx="0" cy="0" r="3" fill={color} />
          </g>
        </svg>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: "-0.03em", lineHeight: 1 }}>
          {score}
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>Pressure Score</div>
      </div>
    </div>
  );
}

export default function RightPanel() {
  const { managerMode, pressureScore } = useApp();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* AI Status */}
      <div className="glass-card" style={{ padding: "18px 20px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1A2B3C", letterSpacing: "-0.01em", marginBottom: 16 }}>
          AI Manager Status
        </div>

        {/* Pressure gauge */}
        <PressureGauge score={pressureScore} />

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(0,0,0,0.05)", margin: "16px 0" }} />

        {/* Mode selector */}
        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          Manager Mode
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {MODES.map((mode) => {
            const isActive = mode.value === managerMode;
            return (
              <div
                key={mode.value}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: isActive ? `${mode.color}0e` : "transparent",
                  border: isActive ? `1px solid ${mode.color}30` : "1px solid transparent",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: isActive ? mode.color : "#d1d5db",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? "#1A2B3C" : "#6B7A8D" }}>
                    {mode.label}
                  </div>
                </div>
                {isActive && (
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke={mode.color} strokeWidth={2.5}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* OpenAI Status */}
      <div className="glass-card" style={{ padding: "16px 20px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1A2B3C", letterSpacing: "-0.01em", marginBottom: 12 }}>
          System Status
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { label: "OpenAI API", status: "Operational", color: "#22c55e" },
            { label: "AI Manager", status: "Active", color: "#22c55e" },
            { label: "Simulation Engine", status: "Running", color: "#22c55e" },
            { label: "Data Pipeline", status: "Syncing", color: "#f59e0b" },
          ].map((item) => (
            <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#6B7A8D", fontWeight: 500 }}>{item.label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span
                  className={item.status === "Active" || item.status === "Running" ? "pulse-badge" : ""}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: item.color,
                    display: "block",
                  }}
                />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: item.color }}>{item.status}</span>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 12,
            padding: "8px 12px",
            borderRadius: 7,
            background: "rgba(34,197,94,0.06)",
            border: "1px solid rgba(34,197,94,0.15)",
            fontSize: 11.5,
            color: "#16a34a",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
          All systems nominal
        </div>
      </div>
    </div>
  );
}
