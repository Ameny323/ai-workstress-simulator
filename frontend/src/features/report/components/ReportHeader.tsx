import { REPORT_COLORS as C, PHASE_LABELS_FR } from "../reportTheme";
import type { SessionReportData } from "../reportTypes";

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return "--";
  const totalSeconds = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${s} s`;
  return `${s} s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { day: "2-digit", month: "long", year: "numeric" });
}

export default function ReportHeader({
  reportData,
  onExport,
}: {
  reportData: SessionReportData;
  onExport: () => void;
}) {
  return (
    <header
      className="report-header no-print-shadow"
      style={{
        background: C.dark,
        color: "#FFFFFF",
        borderRadius: 10,
        padding: "28px 28px 24px",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        gap: 20,
      }}
    >
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>
          Simulation report
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "6px 0 4px", letterSpacing: "-0.02em" }}>
          Analysis of your simulated workday
        </h1>
        <div
          style={{
            display: "inline-block",
            marginTop: 6,
            fontSize: 11.5,
            fontWeight: 600,
            color: C.mutedSuccess,
            background: "rgba(113,152,135,0.18)",
            border: "1px solid rgba(113,152,135,0.35)",
            padding: "3px 10px",
            borderRadius: 99,
          }}
        >
          Simulation finished
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Date</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{formatDate(reportData.session_started_at)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Duration</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>
            {formatDuration(reportData.session_started_at, reportData.session_ended_at)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Tasks</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>
            {reportData.total_tasks_completed} / {reportData.total_tasks_assigned} completed
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Phase reached</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>
            {PHASE_LABELS_FR[reportData.phase_reached] ?? reportData.phase_reached}
          </div>
        </div>
      </div>

      <button
        onClick={onExport}
        className="no-print"
        style={{
          alignSelf: "flex-start",
          background: "rgba(255,255,255,0.12)",
          border: "1px solid rgba(255,255,255,0.25)",
          color: "#FFFFFF",
          fontSize: 12.5,
          fontWeight: 600,
          padding: "9px 16px",
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        Export PDF report
      </button>
    </header>
  );
}
