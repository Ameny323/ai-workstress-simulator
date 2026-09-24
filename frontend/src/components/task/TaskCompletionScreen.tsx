// Shown between tasks -- ported from a mockup's "Task Completed"/"Time
// Limit Reached" screen, but built from only the fields the real
// POST /tasks/{id}/complete response actually returns (TaskOut):
// content_score, time_taken_seconds, error_count. The mockup also showed a
// scripted ARIA quote and a fabricated accuracy/corrections breakdown for
// every task type -- neither exists here: document_organization has no
// registered scorer (content_score stays null "Not scored" rather than a
// made-up percentage), and there's no per-task ARIA commentary endpoint to
// quote from.
export interface TaskCompletionResult {
  contentScore: number | null;
  timeTakenSeconds: number | null;
  errorCount: number;
  timedOut: boolean;
}

const TASK_TYPE_LABEL: Record<string, string> = {
  data_validation: "Data Validation",
  document_organization: "Document Organization",
  image_matching: "Image Matching",
};

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

interface TaskCompletionScreenProps {
  taskType: string;
  result: TaskCompletionResult;
  onContinue: () => void;
}

export default function TaskCompletionScreen({ taskType, result, onContinue }: TaskCompletionScreenProps) {
  const { contentScore, timeTakenSeconds, errorCount, timedOut } = result;

  const stats: { label: string; value: string }[] = [
    { label: "Score", value: contentScore != null ? `${Math.round(contentScore)}%` : "Not scored" },
    { label: "Time taken", value: timeTakenSeconds != null ? formatClock(timeTakenSeconds) : "—" },
    { label: "Errors", value: String(errorCount) },
  ];

  return (
    <div className="glass-card" style={{ padding: "32px 36px", display: "flex", flexDirection: "column", gap: 20, alignItems: "center", textAlign: "center" }}>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#718493", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6 }}>
          {timedOut ? "Time Limit Reached" : "Task Completed"}
        </div>
        <h2 style={{ fontSize: 19, fontWeight: 700, color: "#1A2B3C", margin: 0, letterSpacing: "-0.025em" }}>
          {TASK_TYPE_LABEL[taskType] ?? taskType}
        </h2>
      </div>

      <div style={{ display: "flex", gap: 10, width: "100%", justifyContent: "center" }}>
        {stats.map((s) => (
          <div key={s.label} style={{ flex: 1, maxWidth: 140, padding: "12px 14px", borderRadius: 10, background: "rgba(91,132,198,0.06)" }}>
            <div style={{ fontSize: 9.5, fontWeight: 600, color: "#718493", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1A2B3C" }}>{s.value}</div>
          </div>
        ))}
      </div>

      <button
        onClick={onContinue}
        style={{
          padding: "11px 24px",
          borderRadius: 10,
          border: "none",
          background: "#5B84C6",
          color: "white",
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        Continue to Next Task →
      </button>
    </div>
  );
}
