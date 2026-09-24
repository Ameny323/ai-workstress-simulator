import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "@/api/client";
import SiteNav from "@/components/layout/SiteNav";
import "./report-print.css";
import { REPORT_COLORS as C } from "./reportTheme";
import { fetchSessionReport, type SessionAnalytics } from "./reportTypes";
import AriaSupervisionSection from "./components/AriaSupervisionSection";
import BehavioralIndicatorsSection from "./components/BehavioralIndicatorsSection";
import BehavioralInterpretationSection from "./components/BehavioralInterpretationSection";
import FinalSummarySection from "./components/FinalSummarySection";
import InteractionBehaviorSection from "./components/InteractionBehaviorSection";
import MethodologySection from "./components/MethodologySection";
import PerformanceOverTimeSection from "./components/PerformanceOverTimeSection";
import RecommendationsSection from "./components/RecommendationsSection";
import ReportHeader from "./components/ReportHeader";
import StressSection from "./components/StressSection";
import SynthesisSection from "./components/SynthesisSection";
import TaskAnalysisSection from "./components/TaskAnalysisSection";

type FetchState =
  | { status: "loading" }
  | { status: "not_ended" }
  | { status: "forbidden" }
  | { status: "not_found" }
  | { status: "error"; message: string }
  | { status: "success"; report: SessionAnalytics };

function StatusPanel({ title, message, children }: { title: string; message: string; children?: React.ReactNode }) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "22px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 520,
      }}
    >
      <div style={{ color: C.dark, fontSize: 14, fontWeight: 700 }}>{title}</div>
      <div style={{ color: C.secondary, fontSize: 13, lineHeight: 1.55 }}>{message}</div>
      {children}
    </div>
  );
}

function LinkButton({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      style={{
        alignSelf: "flex-start",
        marginTop: 4,
        padding: "8px 14px",
        borderRadius: 8,
        background: `${C.primary}14`,
        color: C.primary,
        border: `1px solid ${C.primary}40`,
        fontWeight: 600,
        fontSize: 12.5,
        textDecoration: "none",
      }}
    >
      {children}
    </Link>
  );
}

export default function SessionReportPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<FetchState>({ status: "loading" });

  const load = useCallback(() => {
    if (!id) return;
    setState({ status: "loading" });
    fetchSessionReport(id)
      .then((report) => setState({ status: "success", report }))
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          if (err.status === 409) return setState({ status: "not_ended" });
          if (err.status === 403) return setState({ status: "forbidden" });
          if (err.status === 404) return setState({ status: "not_found" });
        }
        setState({ status: "error", message: err instanceof Error ? err.message : "Unknown error" });
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExport = () => window.print();

  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: C.background, fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Same front-office header as Home/Landing, Settings, and Simulation
          History -- this page is a debriefing report the participant reads
          on their own, not a Dashboard section, so it gets the same shared
          SiteNav chrome instead of MainLayout's Sidebar+Navbar shell.
          Wrapped in .no-print so it's excluded from the exported PDF
          (report-print.css) -- the export should be just the report. */}
      <div className="no-print">
        <SiteNav scrolled />
      </div>

      {/* paddingTop clears SiteNav's fixed ~64px height on screen; print
          CSS's ".report-page { padding: 0 !important }" zeroes this out
          entirely for the exported PDF, so it never affects that layout. */}
      <div
        className="fade-in report-page"
        style={{
          paddingTop: 88,
          paddingRight: 28,
          paddingBottom: 48,
          paddingLeft: 28,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          background: C.background,
        }}
      >
      {state.status === "loading" && (
        <StatusPanel title="Analyzing your simulation..." message="The report is being generated from your session's real data." />
      )}

      {state.status === "not_ended" && (
        <StatusPanel
          title="Session in progress"
          message="The debriefing report is only available once the session has ended. If you're still working, go back and use “Finish session” when you're ready."
        >
          <LinkButton to="/tasks">Back to the active session</LinkButton>
        </StatusPanel>
      )}

      {state.status === "forbidden" && (
        <StatusPanel title="Access denied" message="You're not authorized to view this report." />
      )}

      {state.status === "not_found" && (
        <StatusPanel title="Session not found" message="This session doesn't exist or has been deleted." />
      )}

      {state.status === "error" && (
        <StatusPanel title="Couldn't load the report" message={state.message}>
          <button
            onClick={load}
            style={{
              alignSelf: "flex-start",
              marginTop: 4,
              padding: "8px 14px",
              borderRadius: 8,
              background: C.primary,
              color: "#FFFFFF",
              border: "none",
              fontWeight: 600,
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </StatusPanel>
      )}

      {state.status === "success" && state.report.report_data.total_tasks_completed === 0 && (
        <StatusPanel
          title="Report unavailable"
          message="The data needed for this report isn't available for this session (no completed tasks)."
        />
      )}

      {state.status === "success" && state.report.report_data.total_tasks_completed > 0 && (
        <>
          <ReportHeader reportData={state.report.report_data} onExport={handleExport} />
          <SynthesisSection report={state.report} />
          <PerformanceOverTimeSection tasks={state.report.report_data.task_breakdown} />
          <BehavioralIndicatorsSection report={state.report} />
          <StressSection reportData={state.report.report_data} stress={state.report.stress} />
          <TaskAnalysisSection
            errorsByType={state.report.behavioral_metrics.errors_by_type}
            tasks={state.report.report_data.task_breakdown}
          />
          <InteractionBehaviorSection
            typingMetrics={state.report.typing_metrics}
            behavioralMetrics={state.report.behavioral_metrics}
          />
          <AriaSupervisionSection history={state.report.report_data.aria_supervision_history} />
          <BehavioralInterpretationSection evaluation={state.report.behavioral_evaluation} />
          <RecommendationsSection recommendations={state.report.recommendations} />
          <FinalSummarySection report={state.report} />
          <MethodologySection />
        </>
      )}
      </div>
    </div>
  );
}
