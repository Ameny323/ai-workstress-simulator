import type { ReactNode } from "react";
import { useApp } from "../../contexts/AppContext";

interface MetricCardProps {
  label: string;
  value: string;
  unit?: string;
  sub: string;
  color: string;
  bg: string;
  icon: ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
}

function MetricCard({ label, value, unit, sub, color, bg, icon, trend, trendValue }: MetricCardProps) {
  const trendColor = trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : "#94a3b8";
  const trendIcon = trend === "up" ? "↑" : trend === "down" ? "↓" : "–";

  return (
    <div
      className="glass-card"
      style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: bg,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
        {trend && (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: trendColor }}>
            {trendIcon} {trendValue}
          </span>
        )}
      </div>

      <div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#1A2B3C", letterSpacing: "-0.03em", lineHeight: 1 }}>
          {value}
          {unit && <span style={{ fontSize: 14, fontWeight: 500, color: "#94a3b8", marginLeft: 3 }}>{unit}</span>}
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1A2B3C", marginTop: 4 }}>{label}</div>
        <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>{sub}</div>
      </div>

      {/* Mini sparkline placeholder */}
      <div style={{ height: 32, position: "relative", overflow: "hidden" }}>
        <svg width="100%" height="32" viewBox="0 0 120 32" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,24 C10,22 20,18 30,16 C40,14 50,20 60,17 C70,14 80,10 90,12 C100,14 110,10 120,8 L120,32 L0,32 Z"
            fill={`url(#grad-${label})`}
          />
          <path
            d="M0,24 C10,22 20,18 30,16 C40,14 50,20 60,17 C70,14 80,10 90,12 C100,14 110,10 120,8"
            fill="none"
            stroke={color}
            strokeWidth="1.5"
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
      sub: "vs. 72% baseline",
      color: "#5B84C6",
      bg: "rgba(91,132,198,0.1)",
      trend: "up",
      trendValue: "6%",
      icon: (
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
      trend: "up",
      trendValue: "4%",
      icon: (
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M18 20V10" />
          <path d="M12 20V4" />
          <path d="M6 20v-6" />
        </svg>
      ),
    },
    {
      label: "Response Time",
      value: `${metrics.responseTime}`,
      unit: "s",
      sub: "Avg. per task action",
      color: "#8D74FF",
      bg: "rgba(141,116,255,0.1)",
      trend: "down",
      trendValue: "0.8s",
      icon: (
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      label: "Error Rate",
      value: `${metrics.errorRate}`,
      unit: "%",
      sub: "Below 5% threshold",
      color: "#22c55e",
      bg: "rgba(34,197,94,0.1)",
      trend: "down",
      trendValue: "0.3%",
      icon: (
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1A2B3C", letterSpacing: "-0.01em" }}>
          Performance Overview
        </div>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>Last 2 hours</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
        }}
      >
        {cards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </div>
    </div>
  );
}
