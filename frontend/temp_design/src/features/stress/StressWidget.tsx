import { useApp } from "../../contexts/AppContext";
import type { StressLevel } from "../../types";

const LEVELS: { value: StressLevel; label: string; short: string; color: string }[] = [
  { value: 1, label: "Very Low", short: "VL", color: "#22c55e" },
  { value: 2, label: "Low", short: "L", color: "#86efac" },
  { value: 3, label: "Moderate", short: "M", color: "#f59e0b" },
  { value: 4, label: "High", short: "H", color: "#f97316" },
  { value: 5, label: "Very High", short: "VH", color: "#ef4444" },
];

const RECOMMENDATIONS: Record<StressLevel, string> = {
  1: "Optimal focus zone. Maintain your current pace and depth of work.",
  2: "Good working conditions. Stay consistent and avoid unnecessary context switching.",
  3: "Manageable load. Consider a 5-minute micro-break between tasks.",
  4: "Elevated stress detected. ARIA has been notified. Simplify your current task if possible.",
  5: "Critical stress level. An emergency break is strongly recommended. ARIA is intervening.",
};

// Mock history: stress levels over the last 8 checkpoints
const STRESS_HISTORY: number[] = [2, 2, 3, 2, 3, 3, 4, 3];

function MiniChart({ history, currentColor }: { history: number[]; currentColor: string }) {
  const max = 5;
  const w = 240;
  const h = 44;
  const step = w / (history.length - 1);

  const points = history.map((val, i) => ({
    x: i * step,
    y: h - (val / max) * h * 0.85 - 4,
  }));

  const pathD = points
    .map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `C ${points[i - 1].x + step * 0.5},${points[i - 1].y} ${p.x - step * 0.5},${p.y} ${p.x},${p.y}`))
    .join(" ");

  const areaD = pathD + ` L ${points[points.length - 1].x},${h} L 0,${h} Z`;

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="stress-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={currentColor} stopOpacity="0.18" />
          <stop offset="100%" stopColor={currentColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#stress-area)" />
      <path d={pathD} fill="none" stroke={currentColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === points.length - 1 ? 3.5 : 2}
          fill={i === points.length - 1 ? currentColor : "rgba(255,255,255,0.8)"}
          stroke={currentColor}
          strokeWidth={1.5}
        />
      ))}
    </svg>
  );
}

export default function StressWidget() {
  const { stressLevel, setStressLevel } = useApp();
  const current = LEVELS.find((l) => l.value === stressLevel) ?? LEVELS[2];
  const prev = STRESS_HISTORY[STRESS_HISTORY.length - 2];
  const trend = stressLevel > prev ? "up" : stressLevel < prev ? "down" : "stable";
  const trendIcon = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  const trendLabel = trend === "up" ? "Increasing" : trend === "down" ? "Decreasing" : "Stable";
  const trendColor = trend === "up" ? "#ef4444" : trend === "down" ? "#22c55e" : "#94a3b8";
  const chartHistory = [...STRESS_HISTORY.slice(0, -1), stressLevel];

  return (
    <div className="glass-card" style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 3 }}>
            Stress Monitor
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: current.color, letterSpacing: "-0.03em" }}>
            {current.label}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: trendColor }}>{trendIcon}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: trendColor }}>{trendLabel}</span>
        </div>
      </div>

      {/* Slider */}
      <div>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={stressLevel}
          onChange={(e) => setStressLevel(Number(e.target.value) as StressLevel)}
          style={{
            width: "100%",
            background: `linear-gradient(90deg, #22c55e, #86efac 25%, #f59e0b 50%, #f97316 75%, #ef4444)`,
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          {LEVELS.map((l) => (
            <span
              key={l.value}
              onClick={() => setStressLevel(l.value)}
              style={{
                fontSize: 10.5,
                fontWeight: l.value === stressLevel ? 800 : 500,
                color: l.value === stressLevel ? l.color : "#94a3b8",
                cursor: "pointer",
                transition: "color 0.15s",
              }}
            >
              {l.short}
            </span>
          ))}
        </div>
      </div>

      {/* Level dots */}
      <div style={{ display: "flex", gap: 5 }}>
        {LEVELS.map((l) => (
          <div
            key={l.value}
            onClick={() => setStressLevel(l.value)}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 99,
              background: l.value <= stressLevel ? l.color : "#EEF1F6",
              cursor: "pointer",
              transition: "background 0.2s",
            }}
          />
        ))}
      </div>

      {/* Mini history chart */}
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6 }}>
          Recent Trend
        </div>
        <div style={{ borderRadius: 8, overflow: "hidden", background: "rgba(0,0,0,0.02)", padding: "6px 4px 2px" }}>
          <MiniChart history={chartHistory} currentColor={current.color} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 10, color: "#94a3b8" }}>-2h</span>
          <span style={{ fontSize: 10, color: "#94a3b8" }}>Now</span>
        </div>
      </div>

      {/* Recommendation */}
      <div
        style={{
          padding: "10px 13px",
          borderRadius: 9,
          background: `${current.color}0d`,
          border: `1px solid ${current.color}30`,
        }}
      >
        <div style={{ fontSize: 10.5, fontWeight: 700, color: current.color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
          Recommendation
        </div>
        <div style={{ fontSize: 12.5, color: "#4B5A6A", lineHeight: 1.5 }}>
          {RECOMMENDATIONS[stressLevel]}
        </div>
      </div>
    </div>
  );
}
