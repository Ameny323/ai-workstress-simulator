import { useState } from "react";
import { apiRequest, ApiError } from "@/api/client";

// Self-reported, observational simulation signal -- 1 (Calm) to 5
// (Extreme). Never a medical/psychological assessment: no diagnostic
// language, no immediate interpretation, no alarming copy. Matches the
// backend's StressDeclarationCreate/Out (app/schemas/session.py) exactly.
export interface StressDeclarationRequest {
  stress_level: number;
}

export interface StressDeclarationResponse {
  id: string;
  session_id: string;
  task_id: string | null;
  stress_level: number;
  declared_at: string;
  elapsed_seconds: number | null;
  simulation_phase: string | null;
  aria_state: string | null;
  previous_stress_level: number | null;
  stress_change: number | null;
}

interface StressLevelOption {
  value: number;
  label: string;
}

const LEVELS: StressLevelOption[] = [
  { value: 1, label: "Calm" },
  { value: 2, label: "Slightly pressured" },
  { value: 3, label: "Moderately pressured" },
  { value: 4, label: "Highly pressured" },
  { value: 5, label: "Extremely pressured" },
];

// WorkPulse design system colors.
const COLOR_PRIMARY = "#587A92";
const COLOR_TEXT = "#243746";
const COLOR_SECONDARY = "#718493";
const COLOR_SURFACE = "#FFFFFF";
const COLOR_DANGER = "#B97878";
const COLOR_BORDER = "#E3E9EE";

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

interface StressWidgetProps {
  sessionId: string;
  /** True while the session isn't in a state that can accept a declaration
   * (not yet started, paused, or already ended) -- purely a UI courtesy;
   * the backend re-validates this independently regardless. */
  disabled?: boolean;
}

export default function StressWidget({ sessionId, disabled = false }: StressWidgetProps) {
  const [submitting, setSubmitting] = useState(false);
  // Set immediately on click (optimistic local feedback, section 16),
  // then reconciled with the server's confirmed value once it responds --
  // reverted back to whatever was last actually recorded on failure, so a
  // rejected declaration never visually looks like it succeeded.
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [lastRecorded, setLastRecorded] = useState<StressDeclarationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDisabled = disabled || !sessionId;

  const handleSelect = async (level: number) => {
    if (isDisabled || submitting) return;
    setSelectedLevel(level);
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiRequest<StressDeclarationResponse>(`/sessions/${sessionId}/stress`, {
        method: "POST",
        body: JSON.stringify({ stress_level: level } satisfies StressDeclarationRequest),
      });
      setLastRecorded(result);
      setSelectedLevel(result.stress_level);
    } catch (err) {
      setSelectedLevel(lastRecorded?.stress_level ?? null);
      if (err instanceof ApiError && err.status === 429) {
        setError("Your previous stress level was recorded recently. You can update it again later.");
      } else if (err instanceof ApiError && err.status === 409) {
        setError("Stress can only be declared while the session is active.");
      } else {
        setError("Your stress level could not be recorded. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: "14px 18px", borderTop: "1px solid #F3F6F8" }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: COLOR_SECONDARY,
          marginBottom: 3,
        }}
      >
        Self-reported stress
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: COLOR_TEXT, marginBottom: 8, lineHeight: 1.4 }}>
        How are you feeling right now?
      </div>

      <div
        role="radiogroup"
        aria-label="Self-reported stress level, 1 Calm to 5 Extremely pressured"
        style={{ display: "flex", gap: 4 }}
      >
        {LEVELS.map((level) => {
          const isSelected = selectedLevel === level.value;
          return (
            <button
              key={level.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${level.value} - ${level.label}`}
              title={level.label}
              disabled={isDisabled || submitting}
              onClick={() => void handleSelect(level.value)}
              className="stress-level-button"
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                padding: "7px 2px",
                borderRadius: 8,
                border: `1.5px solid ${isSelected ? COLOR_PRIMARY : COLOR_BORDER}`,
                background: isSelected ? "rgba(88,122,146,0.10)" : COLOR_SURFACE,
                cursor: isDisabled || submitting ? "default" : "pointer",
                opacity: isDisabled ? 0.5 : 1,
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 700, color: isSelected ? COLOR_PRIMARY : COLOR_TEXT }}>
                {level.value}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, padding: "0 1px" }}>
        <span style={{ fontSize: 8.5, color: COLOR_SECONDARY }}>Calm</span>
        <span style={{ fontSize: 8.5, color: COLOR_SECONDARY }}>Extreme</span>
      </div>

      <div style={{ marginTop: 9, fontSize: 10.5, lineHeight: 1.5, color: error ? COLOR_DANGER : COLOR_SECONDARY, minHeight: 15 }}>
        {error ? (
          error
        ) : lastRecorded ? (
          <span>
            Stress level recorded. <span style={{ color: "#B7C2CB" }}>Recorded at {formatClockTime(lastRecorded.declared_at)}</span>
          </span>
        ) : (
          "Your response helps us analyze how perceived pressure changes during the simulation."
        )}
      </div>
    </div>
  );
}
