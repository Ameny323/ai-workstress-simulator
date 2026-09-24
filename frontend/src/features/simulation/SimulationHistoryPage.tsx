import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "@/api/client";
import { useApp } from "@/contexts/AppContext";
import SiteNav from "@/components/layout/SiteNav";

// Simulation history / resume feature: lists every session the current
// user has ever started (GET /sessions/, already existed and needed no
// backend changes beyond the additive task_sequence/task_sequence_position
// fields on SessionOut -- see schemas/session.py) so an in-progress session
// abandoned mid-sequence (e.g. via the cockpit's "Stop Simulation" ->
// "Save session & continue later" flow) can be resumed exactly where it
// left off, and a completed one can be reopened as a report.
//
// Front-office page, not a Dashboard section (user feedback: nesting this
// under MainLayout's Sidebar+Navbar made it read as "another dashboard
// widget"): renders SiteNav directly, the exact same shared header as the
// Home/Landing page and Settings (see App.tsx -- this route sits alongside
// /settings, outside the MainLayout block). "pt-20" below clears SiteNav's
// fixed 64px height, same convention SettingsPage.tsx already uses.
//
// Presentation redesign only (no data/API/routing change): this used to
// render as a loose stack of dashboard-style glassy cards. Restyled as its
// own standalone platform page -- a real header, a lean single-line-per-
// session history list, and a client-side status filter over the same
// already-fetched data (no new endpoint) -- so it reads as "WorkPulse ->
// Simulation History" rather than another dashboard widget. Colors reuse
// the same muted palette as the cockpit/report pages (#587A92 primary,
// #243746/#718493 text, #D9E2E8 borders, #719887/#B89A61 muted status
// tones) instead of the dashboard's brighter widget palette, on purpose.

interface SessionHistoryItem {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  current_phase: string;
  status: "in_progress" | "completed" | "abandoned";
  task_sequence_position: number | null;
  task_sequence: string[] | null;
}

const STATUS_LABELS: Record<SessionHistoryItem["status"], string> = {
  in_progress: "In Progress",
  completed: "Completed",
  abandoned: "Abandoned",
};

// Subtle, muted status tones -- matching the report/cockpit palette's own
// mutedSuccess/mutedWarning/secondary colors, deliberately not the bright
// saturated green/amber badges a dashboard widget would use.
const STATUS_STYLES: Record<SessionHistoryItem["status"], { color: string; bg: string; border: string }> = {
  in_progress: { color: "#B89A61", bg: "rgba(184,154,97,0.10)", border: "rgba(184,154,97,0.28)" },
  completed: { color: "#719887", bg: "rgba(113,152,135,0.10)", border: "rgba(113,152,135,0.28)" },
  abandoned: { color: "#718493", bg: "rgba(113,132,147,0.08)", border: "rgba(113,132,147,0.22)" },
};

type FilterKey = "all" | "in_progress" | "completed";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function HistoryIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function StatusBadge({ status }: { status: SessionHistoryItem["status"] }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "2.5px 9px",
        borderRadius: 99,
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function SessionRow({
  session,
  onResume,
  onViewReport,
}: {
  session: SessionHistoryItem;
  onResume: () => void;
  onViewReport: () => void;
}) {
  const total = session.task_sequence?.length ?? null;
  const completedCount = session.task_sequence_position !== null && total !== null ? Math.min(session.task_sequence_position, total) : null;
  const hasProgress = total !== null && completedCount !== null;
  const progressPct = hasProgress && total > 0 ? Math.round((completedCount! / total) * 100) : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "16px 20px",
        borderRadius: 12,
        background: "#FFFFFF",
        border: "1px solid #D9E2E8",
        boxShadow: "0 1px 2px rgba(36,55,70,0.04)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#243746" }}>Simulation Session</span>
          <span style={{ fontSize: 12, color: "#718493" }}>
            {formatDate(session.started_at)} · {formatTime(session.started_at)}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 7 }}>
          <StatusBadge status={session.status} />
          <span style={{ fontSize: 12, color: "#718493" }}>
            {hasProgress ? `${total} task${total === 1 ? "" : "s"} assigned · ${completedCount} completed` : "No task progress recorded"}
          </span>
        </div>

        {session.status === "in_progress" && progressPct !== null && (
          <div style={{ marginTop: 9, height: 4, borderRadius: 99, background: "#EEF2F5", maxWidth: 220, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progressPct}%`, background: "#587A92", borderRadius: 99 }} />
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0 }}>
        {session.status === "in_progress" && (
          <button
            onClick={onResume}
            style={{
              padding: "9px 16px",
              borderRadius: 8,
              background: "#587A92",
              color: "#fff",
              fontWeight: 600,
              fontSize: 12.5,
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Continue Simulation →
          </button>
        )}
        {session.status === "completed" && (
          <button
            onClick={onViewReport}
            style={{
              padding: "9px 16px",
              borderRadius: 8,
              background: "#fff",
              color: "#587A92",
              fontWeight: 600,
              fontSize: 12.5,
              border: "1px solid #587A92",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            View Report
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div
      style={{
        padding: "48px 24px",
        borderRadius: 12,
        background: "#FFFFFF",
        border: "1px solid #D9E2E8",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: "rgba(88,122,146,0.08)",
          color: "#587A92",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 16px",
        }}
      >
        <HistoryIcon />
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#243746" }}>No simulation sessions yet</div>
      <p style={{ fontSize: 13, color: "#718493", marginTop: 6, maxWidth: 340, marginLeft: "auto", marginRight: "auto" }}>
        Start a simulation to begin building your session history.
      </p>
      <button
        onClick={onStart}
        style={{
          marginTop: 20,
          padding: "10px 20px",
          borderRadius: 8,
          background: "#587A92",
          color: "#fff",
          fontWeight: 600,
          fontSize: 13,
          border: "none",
          cursor: "pointer",
        }}
      >
        Start Simulation
      </button>
    </div>
  );
}

export default function SimulationHistoryPage() {
  const { resumeSession } = useApp();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionHistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiRequest<SessionHistoryItem[]>("/sessions/");
        if (!cancelled) setSessions(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your simulation history");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    if (!sessions) return null;
    return {
      all: sessions.length,
      in_progress: sessions.filter((s) => s.status === "in_progress").length,
      completed: sessions.filter((s) => s.status === "completed").length,
    };
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    if (!sessions) return null;
    if (filter === "all") return sessions;
    return sessions.filter((s) => s.status === filter);
  }, [sessions, filter]);

  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: "#F3F6F8", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Same front-office header as Home/Landing and Settings -- see this
          file's own top comment for why this page renders SiteNav directly
          instead of living inside MainLayout's Sidebar+Navbar shell. */}
      <SiteNav scrolled />

      {/* pt-20 clears SiteNav's fixed 64px height (position:fixed), same
          convention SettingsPage.tsx already uses for the same reason. */}
      <div className="fade-in max-w-[900px] mx-auto px-6 pt-20 pb-12">
        {/* Page header -- this page's own identity, not a dashboard section */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: "rgba(88,122,146,0.10)",
                color: "#587A92",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <HistoryIcon />
            </span>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#243746", letterSpacing: "-0.01em", margin: 0 }}>
              Simulation History
            </h1>
          </div>
          <p style={{ fontSize: 13.5, color: "#718493", margin: 0, maxWidth: 540 }}>
            Review your previous simulation sessions and continue unfinished simulations.
          </p>
        </div>

        {/* Status filter -- purely client-side over the already-fetched
            list, no new endpoint or query param. Only shown once there's
            more than one session to make filtering meaningful. */}
        {sessions !== null && sessions.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: "7px 14px",
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                  border: `1px solid ${filter === f.key ? "#587A92" : "#D9E2E8"}`,
                  background: filter === f.key ? "#587A92" : "#fff",
                  color: filter === f.key ? "#fff" : "#718493",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {f.label}
                {counts ? ` (${counts[f.key]})` : ""}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div style={{ padding: "14px 18px", borderRadius: 10, background: "rgba(185,120,120,0.06)", border: "1px solid rgba(185,120,120,0.2)", color: "#B97878", fontSize: 13 }}>
            {error}
          </div>
        )}

        {!error && sessions === null && (
          <div style={{ fontSize: 13, color: "#718493" }}>Loading your simulations…</div>
        )}

        {!error && sessions !== null && sessions.length === 0 && <EmptyState onStart={() => navigate("/tasks")} />}

        {!error && sessions !== null && sessions.length > 0 && filteredSessions !== null && filteredSessions.length === 0 && (
          <div style={{ padding: "24px", borderRadius: 12, background: "#FFFFFF", border: "1px solid #D9E2E8", textAlign: "center", color: "#718493", fontSize: 13 }}>
            No sessions match this filter.
          </div>
        )}

        {!error && filteredSessions !== null && filteredSessions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredSessions.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                onResume={() => resumeSession(s)}
                onViewReport={() => navigate(`/sessions/${s.id}/report`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
