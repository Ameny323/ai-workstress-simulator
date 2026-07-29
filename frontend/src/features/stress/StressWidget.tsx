import { useApp } from "../../contexts/AppContext";
import type { StressLevel } from "../../types";

const LEVELS: { value: StressLevel; label: string; color: string }[] = [
  { value: 1, label: "Very Low", color: "#22c55e" },
  { value: 2, label: "Low", color: "#86efac" },
  { value: 3, label: "Moderate", color: "#f59e0b" },
  { value: 4, label: "High", color: "#f97316" },
  { value: 5, label: "Very High", color: "#ef4444" },
];

export default function StressWidget() {
  const { stressLevel, setStressLevel } = useApp();
  const current = LEVELS.find((l) => l.value === stressLevel) ?? LEVELS[2];

  const trackBg = `linear-gradient(90deg, #22c55e, #86efac 25%, #f59e0b 50%, #f97316 75%, #ef4444)`;

  return (
    <div className="glass-card" style={{ padding: "18px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>
            Stress Declaration
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1A2B3C" }}>How are you feeling?</div>
        </div>
        <div
          style={{
            padding: "5px 12px",
            borderRadius: 99,
            background: `${current.color}18`,
            border: `1px solid ${current.color}40`,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: current.color }}>
            {current.label}
          </span>
        </div>
      </div>

      {/* Slider */}
      <div style={{ marginBottom: 14 }}>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={stressLevel}
          onChange={(e) => setStressLevel(Number(e.target.value) as StressLevel)}
          style={{
            width: "100%",
            background: trackBg,
            cursor: "pointer",
          }}
        />
      </div>

      {/* Level labels */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {LEVELS.map((l) => (
          <button
            key={l.value}
            onClick={() => setStressLevel(l.value)}
            style={{
              fontSize: 10,
              fontWeight: l.value === stressLevel ? 700 : 500,
              color: l.value === stressLevel ? l.color : "#94a3b8",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              transition: "color 0.15s",
              textAlign: "center",
              lineHeight: 1.3,
            }}
          >
            {l.label}
          </button>
        ))}
      </div>

      {/* Emoji feedback */}
      <div
        style={{
          marginTop: 16,
          padding: "10px 14px",
          borderRadius: 8,
          background: `${current.color}0d`,
          border: `1px solid ${current.color}25`,
          fontSize: 12.5,
          color: "#1A2B3C",
          lineHeight: 1.45,
        }}
      >
        {stressLevel === 1 && "You are in an optimal state. Excellent conditions for focused work."}
        {stressLevel === 2 && "Light manageable load. You are performing well within your comfort zone."}
        {stressLevel === 3 && "Moderate stress detected. Monitor your pace and take short breaks as needed."}
        {stressLevel === 4 && "Elevated stress. Your AI Manager has been notified. Consider a short break."}
        {stressLevel === 5 && "High stress level. Emergency break recommended. Your AI Manager is intervening."}
      </div>
    </div>
  );
}
