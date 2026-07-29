import type { ReactNode } from "react";
import { useApp } from "../../contexts/AppContext";

interface MetricCardProps {
  label: string;
  value: string;
  unit?: string;
  sub: string;
  color: string;
  bg: string;
  progress: number;
  trend: "up" | "down";
  trendValue: string;
  trendGood: boolean;
  icon: ReactNode;
}

function MetricCard({ label, value, unit, sub, color, bg, progress, trend, trendValue, trendGood, icon }: MetricCardProps) {
  const trendColor = trendGood ? "#22c55e" : "#ef4444";

  return (
    <div
      className="glass-card"
      style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}
    >
      {/* Top row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            background: bg,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 9px",
            borderRadius: 99,
            background: trendGood ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: trendColor }}>
            {trend === "up" ? "↑" : "↓"} {trendValue}
          </span>
        </div>
      </div>

      {/* Value */}
      <div>
        <div style={{ fontSize: 32, fontWeight: 800, color: "#1A2B3C", letterSpacing: "-0.04em", lineHeight: 1 }}>
          {value}
          {unit && <span style={{ fontSize: 16, fontWeight: 500, color: "#94a3b8", marginLeft: 3 }}>{unit}</span>}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1A2B3C", marginTop: 5 }}>{label}</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{sub}</div>
      </div>

      {/* Progress bar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: "#6B7A8D", fontWeight: 500 }}>vs. target</span>
          <span style={{ fontSize: 11, fontWeight: 700, color }}>{progress}%</span>
        </div>
        <div style={{ height: 5, borderRadius: 99, background: "#EEF1F6", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              borderRadius: 99,
              background: color,
              opacity: 0.85,
              transition: "width 0.8s ease",
            }}
          />
        </div>
      </div>

      {/* Sparkline */}
      <div style={{ height: 28, overflow: "hidden" }}>
        <svg width="100%" height="28" viewBox="0 0 120 28" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`perf-${label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.15" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,22 C15,20 25,16 40,14 C55,12 65,18 80,15 C95,12 105,8 120,6 L120,28 L0,28 Z"
            fill={`url(#perf-${label})`}
          />
          <path
            d="M0,22 C15,20 25,16 40,14 C55,12 65,18 80,15 C95,12 105,8 120,6"
            fill="none"
            stroke={color}
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

export default function PerformanceOverview() {
  const { metrics } = useApp();

  const cards: MetricCardProps[] = [
    {
      label: "Productivity",
      value: `${metrics.productivity}`,
      unit: "%",
      sub: "Baseline: 72%",
      color: "#5B84C6",
      bg: "rgba(91,132,198,0.1)",
      progress: metrics.productivity,
      trend: "up",
      trendValue: "6%",
      trendGood: true,
      icon: (
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      ),
    },
    {
      label: "Fatigue",
      value: `${metrics.fatigue}`,
      unit: "%",
      sub: "Within normal range",
      color: "#f59e0b",
      bg: "rgba(245,158,11,0.1)",
      progress: metrics.fatigue,
      trend: "up",
      trendValue: "4%",
      trendGood: false,
      icon: (
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M18 20V10" />
          <path d="M12 20V4" />
          <path d="M6 20v-6" />
        </svg>
      ),
    },
    {
      label: "Avg Response Time",
      value: `${metrics.responseTime}`,
      unit: "s",
      sub: "Target: < 5s",
      color: "#8D74FF",
      bg: "rgba(141,116,255,0.1)",
      progress: Math.round((1 - metrics.responseTime / 10) * 100),
      trend: "down",
      trendValue: "0.8s",
      trendGood: true,
      icon: (
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      label: "Error Rate",
      value: `${metrics.errorRate}`,
      unit: "%",
      sub: "Threshold: 5%",
      color: "#22c55e",
      bg: "rgba(34,197,94,0.1)",
      progress: Math.round((1 - metrics.errorRate / 10) * 100),
      trend: "down",
      trendValue: "0.3%",
      trendGood: true,
      icon: (
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1A2B3C", letterSpacing: "-0.02em" }}>
            Performance Overview
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 1 }}>Last 2 hours of session activity</div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 12px",
            borderRadius: 99,
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.2)",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "block" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "#16a34a" }}>On Track</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {cards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </div>
    </div>
  );
}
