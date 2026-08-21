import { useState } from "react";
import { useApp } from "../../contexts/AppContext";
import { apiRequest } from "@/api/client";

interface StressBand {
  min: number;
  max: number;
  label: string;
  color: string;
}

const BANDS: StressBand[] = [
  { min: 0, max: 20, label: "Very Low", color: "#22c55e" },
  { min: 21, max: 40, label: "Low", color: "#86efac" },
  { min: 41, max: 60, label: "Moderate", color: "#f59e0b" },
  { min: 61, max: 80, label: "High", color: "#f97316" },
  { min: 81, max: 100, label: "Very High", color: "#ef4444" },
];

function bandFor(value: number): StressBand {
  return BANDS.find((b) => value >= b.min && value <= b.max) ?? BANDS[2];
}

const GUIDANCE: Record<string, string> = {
  "Very Low": "You are in an optimal state. Excellent conditions for focused work.",
  Low: "Light manageable load. You are performing well within your comfort zone.",
  Moderate: "Moderate stress detected. Monitor your pace and take short breaks as needed.",
  High: "Elevated stress. Your AI Manager has been notified. Consider a short break.",
  "Very High": "High stress level. Emergency break recommended. Your AI Manager is intervening.",
};

export default function StressWidget() {
  const { session } = useApp();
  const [draftValue, setDraftValue] = useState(50);
  const [submittedValue, setSubmittedValue] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draftBand = bandFor(draftValue);
  const trackBg = "linear-gradient(90deg, #22c55e, #86efac 25%, #f59e0b 50%, #f97316 75%, #ef4444)";

  const handleReport = async () => {
    if (!session.id) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiRequest<{ stress: number; declared_at: string }>(
        `/sessions/${session.id}/stress`,
        { method: "POST", body: JSON.stringify({ stress: draftValue }) }
      );
      // Read the confirmed value back from the response rather than
      // assuming the POST persisted exactly what was sent.
      setSubmittedValue(result.stress);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to report stress level");
    } finally {
      setSubmitting(false);
    }
  };

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
            background: `${draftBand.color}18`,
            border: `1px solid ${draftBand.color}40`,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: draftBand.color }}>
            {draftValue} · {draftBand.label}
          </span>
        </div>
      </div>

      {/* Slider */}
      <div style={{ marginBottom: 10 }}>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={draftValue}
          onChange={(e) => setDraftValue(Number(e.target.value))}
          style={{
            width: "100%",
            background: trackBg,
            cursor: "pointer",
          }}
        />
      </div>

      {/* Band labels */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
        {BANDS.map((b) => (
          <span
            key={b.label}
            style={{
              fontSize: 10,
              fontWeight: draftBand.label === b.label ? 700 : 500,
              color: draftBand.label === b.label ? b.color : "#94a3b8",
              transition: "color 0.15s",
            }}
          >
            {b.label}
          </span>
        ))}
      </div>

      {/* Guidance text */}
      <div
        style={{
          padding: "10px 14px",
          borderRadius: 8,
          background: `${draftBand.color}0d`,
          border: `1px solid ${draftBand.color}25`,
          fontSize: 12.5,
          color: "#1A2B3C",
          lineHeight: 1.45,
          marginBottom: 14,
        }}
      >
        {GUIDANCE[draftBand.label]}
      </div>

      {/* Submit + confirmation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 11.5, color: error ? "#c0505a" : "#94a3b8", flex: 1 }}>
          {error
            ? error
            : submittedValue !== null
              ? `Reported: ${submittedValue} (${bandFor(submittedValue).label})`
              : "Not reported yet this session."}
        </span>
        <button
          onClick={() => void handleReport()}
          disabled={submitting || !session.id}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: "linear-gradient(135deg, #5B84C6, #8D74FF)",
            color: "white",
            fontWeight: 700,
            fontSize: 12,
            cursor: submitting || !session.id ? "default" : "pointer",
            opacity: submitting ? 0.7 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {submitting ? "Reporting..." : "Report Stress Level"}
        </button>
      </div>
    </div>
  );
}
