import { useState } from "react";
import { useApp } from "../../../contexts/AppContext";

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  low: { label: "Low Priority", color: "#16a34a", bg: "rgba(34,197,94,0.08)", dot: "#22c55e" },
  medium: { label: "Medium Priority", color: "#b45309", bg: "rgba(245,158,11,0.08)", dot: "#f59e0b" },
  high: { label: "High Priority", color: "#c2410c", bg: "rgba(249,115,22,0.1)", dot: "#f97316" },
  critical: { label: "Critical", color: "#b91c1c", bg: "rgba(239,68,68,0.1)", dot: "#ef4444" },
};

const TYPE_LABELS: Record<string, string> = {
  analysis: "Analysis",
  report: "Report",
  review: "Code Review",
  meeting: "Meeting",
  research: "Research",
  design: "Design",
};

const MOCK_ATTACHMENTS = [
  { name: "Q3_Revenue_Data.xlsx", size: "2.4 MB", icon: "📊" },
  { name: "Variance_Notes.pdf", size: "840 KB", icon: "📄" },
  { name: "Stakeholder_Brief.docx", size: "1.1 MB", icon: "📝" },
];

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Overdue";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function TaskCard() {
  const { currentTask, completeTask } = useApp();
  const [completing, setCompleting] = useState(false);
  const priority = PRIORITY_CONFIG[currentTask.priority];
  const timeLeft = currentTask.deadline.getTime() - Date.now();
  const isUrgent = timeLeft < 6 * 3600 * 1000;
  const countdown = formatCountdown(timeLeft);
  const deadlineStr = currentTask.deadline.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const handleComplete = () => {
    setCompleting(true);
    setTimeout(() => {
      completeTask();
      setCompleting(false);
    }, 800);
  };

  return (
    <div
      className="glass-card"
      style={{
        padding: "24px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        border: "1px solid rgba(91,132,198,0.18)",
        boxShadow: "0 2px 12px rgba(91,132,198,0.08), 0 1px 3px rgba(0,0,0,0.05)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: "linear-gradient(180deg, #5B84C6, #8D74FF)",
          borderRadius: "12px 0 0 12px",
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: "#5B84C6",
                textTransform: "uppercase",
                letterSpacing: "0.09em",
                background: "rgba(91,132,198,0.08)",
                padding: "2px 8px",
                borderRadius: 5,
              }}
            >
              {TYPE_LABELS[currentTask.type]}
            </span>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>#{currentTask.id}</span>
          </div>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#1A2B3C",
              margin: 0,
              letterSpacing: "-0.025em",
              lineHeight: 1.3,
            }}
          >
            {currentTask.title}
          </h2>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 12px",
            borderRadius: 99,
            background: priority.bg,
            border: `1px solid ${priority.dot}30`,
            flexShrink: 0,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: priority.dot, display: "block" }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: priority.color }}>{priority.label}</span>
        </div>
      </div>

      <div
        style={{
          fontSize: 13.5,
          color: "#4B5A6A",
          lineHeight: 1.65,
          padding: "14px 16px",
          background: "rgba(0,0,0,0.025)",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        Analyze Q3 revenue performance across all business units, identify variance drivers, and prepare an executive-ready summary. Focus on the 14.2% shortfall in EMEA and cross-reference with the adjusted forecasts submitted by regional leads. Highlight risks for Q4 planning.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[
          {
            label: "Deadline",
            value: deadlineStr,
            icon: (
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            ),
            accent: isUrgent ? "#ef4444" : "#5B84C6",
          },
          {
            label: "Remaining",
            value: countdown,
            icon: (
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            ),
            accent: isUrgent ? "#ef4444" : "#f97316",
          },
          {
            label: "Est. Duration",
            value: `~${currentTask.estimatedDuration} min`,
            icon: (
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            ),
            accent: "#8D74FF",
          },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              padding: "10px 12px",
              borderRadius: 9,
              background: "rgba(0,0,0,0.02)",
              border: "1px solid rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4, color: item.accent }}>
              {item.icon}
              <span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8" }}>
                {item.label}
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: isUrgent && item.label === "Remaining" ? "#ef4444" : "#1A2B3C" }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#1A2B3C" }}>Progress</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#1A2B3C", letterSpacing: "-0.03em" }}>
              {currentTask.progress}%
            </span>
          </div>
        </div>
        <div style={{ height: 8, borderRadius: 99, background: "#EEF1F6", overflow: "hidden", position: "relative" }}>
          <div
            style={{
              height: "100%",
              width: `${currentTask.progress}%`,
              borderRadius: 99,
              background: "linear-gradient(90deg, #5B84C6 0%, #8D74FF 100%)",
              transition: "width 1s ease",
              position: "relative",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Started 72 min ago</span>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>{100 - currentTask.progress}% remaining</span>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: "#6B7A8D", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Attachments
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {MOCK_ATTACHMENTS.map((file) => (
            <div
              key={file.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 8,
                background: "rgba(0,0,0,0.025)",
                border: "1px solid rgba(0,0,0,0.05)",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(91,132,198,0.06)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(0,0,0,0.025)"; }}
            >
              <span style={{ fontSize: 14 }}>{file.icon}</span>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: "#1A2B3C", flex: 1 }}>{file.name}</span>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>{file.size}</span>
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#94a3b8" strokeWidth={2}>
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleComplete}
        disabled={completing}
        style={{
          padding: "13px 0",
          background: completing ? "rgba(34,197,94,0.15)" : "linear-gradient(135deg, #5B84C6 0%, #8D74FF 100%)",
          color: completing ? "#16a34a" : "white",
          fontWeight: 700,
          fontSize: 14,
          borderRadius: 12,
          border: "none",
          cursor: completing ? "default" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          transition: "all 0.25s ease",
          letterSpacing: "-0.01em",
          boxShadow: completing ? "none" : "0 4px 14px rgba(91,132,198,0.3)",
        }}
        onMouseEnter={(e) => {
          if (!completing) (e.currentTarget as HTMLButtonElement).style.opacity = "0.9";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = "1";
        }}
      >
        {completing ? (
          <>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Marking Complete…
          </>
        ) : (
          <>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Mark as Complete
          </>
        )}
      </button>
    </div>
  );
}
