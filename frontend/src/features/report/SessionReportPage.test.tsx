import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SessionReportPage from "./SessionReportPage";
import type { SessionAnalytics } from "./reportTypes";
import { ApiError } from "@/api/client";

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, apiRequest: apiRequestMock };
});

// The page now renders SiteNav directly (front-office header, matching
// Home/Settings/Simulation History -- see the page's own top comment), so
// it needs a real AppProvider (SiteNav calls useApp() for its session
// status pill) rather than none at all.
vi.mock("@/contexts/AppContext", () => ({
  useApp: () => ({
    isAuthenticated: true,
    user: { id: "u1", name: "Test User", email: "test@example.com", role: "Analyst" },
    session: { state: "idle" },
  }),
}));

function renderPage(sessionId = "session-1") {
  return render(
    <MemoryRouter initialEntries={[`/sessions/${sessionId}/report`]}>
      <Routes>
        <Route path="/sessions/:id/report" element={<SessionReportPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function fullReport(overrides: Partial<SessionAnalytics> = {}): SessionAnalytics {
  return {
    report_data: {
      session_id: "session-1",
      session_started_at: "2026-09-15T10:00:00Z",
      session_ended_at: "2026-09-15T10:30:00Z",
      phase_reached: "pic_charge",
      total_tasks_completed: 3,
      total_tasks_assigned: 3,
      tasks_by_type: { data_validation: 1, email_writing: 1, urgent_request: 1 },
      avg_score_overall: 90,
      avg_score_first_half: 100,
      avg_score_second_half: 80,
      avg_time_taken_seconds_overall: 12,
      avg_time_taken_seconds_first_half: 10,
      avg_time_taken_seconds_second_half: 14,
      error_count_trend: [0, 0, 1],
      stress_declarations: [
        { value: 2, declared_at: "2026-09-15T10:05:00Z" },
        { value: 4, declared_at: "2026-09-15T10:25:00Z" },
      ],
      task_breakdown: [
        { task_id: "t1", task_type: "data_validation", content_score: 100, time_taken_seconds: 10, error_count: 0, status: "completed", completed_at: "2026-09-15T10:10:00Z", sequence_index: 0 },
        { task_id: "t2", task_type: "email_writing", content_score: 80, time_taken_seconds: 25, error_count: 1, status: "completed", completed_at: "2026-09-15T10:20:00Z", sequence_index: 1 },
        { task_id: "t3", task_type: "urgent_request", content_score: 100, time_taken_seconds: 5, error_count: 0, status: "completed", completed_at: "2026-09-15T10:28:00Z", sequence_index: 2 },
      ],
      aria_supervision_history: [
        { tone: "neutre", at: "2026-09-15T10:01:00Z" },
        { tone: "exigeant", at: "2026-09-15T10:20:00Z" },
      ],
    },
    fatigue_score: 22,
    recommendations: [
      { title: "Verification under pressure", observation: "Errors were concentrated toward the end of the session.", advice: "Take the time to double-check before submitting.", source_observation: null },
    ],
    stress: { latest: 4, average: 3, minimum: 2, maximum: 4, change_from_first: 2, declarations_count: 2 },
    productivity_index: 88,
    cognitive_load_estimate: 40,
    behavioral_metrics: {
      pause_count: 1,
      total_pause_duration_seconds: 95,
      average_pause_duration_seconds: 95,
      errors_by_type: { data_validation: 0, email_writing: 1, urgent_request: 0 },
    },
    typing_metrics: {
      typing_sessions_count: 1,
      total_typing_duration_seconds: 22.5,
      total_character_count: 143,
      average_chars_per_second: 6.36,
      average_typing_speed_variation: 1.1,
      total_pause_count_during_typing: 1,
    },
    behavioral_evaluation: {
      performance: { early_value: 100, late_value: 80, change: -20, evolution: "DECLINING" },
      pace: { early_value: 90, late_value: 90, change: 0, evolution: "STABLE" },
      errors: { early_value: 0, late_value: 1, change: 1, evolution: "INCREASING" },
      pauses: { early_value: 0, late_value: 0, change: 0, evolution: "STABLE" },
      workflow: { early_value: null, late_value: null, change: null, evolution: "INSUFFICIENT_DATA" },
      stress: { early_value: 2, late_value: 4, change: 2, evolution: "INCREASING" },
      typing: null,
      observations: [
        { code: "STRESS_PERFORMANCE_DECLINE", title: "Rising declared pressure and declining performance", description: "test description", supporting_signals: ["STRESS_INCREASING", "PERFORMANCE_DECLINING"] },
      ],
      primary_observation: { code: "STRESS_PERFORMANCE_DECLINE", title: "Rising declared pressure and declining performance", description: "test description", supporting_signals: ["STRESS_INCREASING", "PERFORMANCE_DECLINING"] },
      confidence: "MODERATE",
      disclaimer: "This interpretation describes the behaviors observed during the simulation. It does not constitute a medical or psychological evaluation.",
    },
    ...overrides,
  };
}

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe("SessionReportPage", () => {
  it("shows a loading state before the report resolves", () => {
    apiRequestMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/Analyzing your simulation/i)).toBeInTheDocument();
  });

  it("shows a not-ended state on a 409 response", async () => {
    apiRequestMock.mockRejectedValue(new ApiError("not ready", 409));
    renderPage();
    await waitFor(() => expect(screen.getByText(/Session in progress/i)).toBeInTheDocument());
    expect(screen.getByText(/Back to the active session/i)).toBeInTheDocument();
  });

  it("shows a forbidden state on a 403 response", async () => {
    apiRequestMock.mockRejectedValue(new ApiError("forbidden", 403));
    renderPage();
    await waitFor(() => expect(screen.getByText(/Access denied/i)).toBeInTheDocument());
  });

  it("shows a not-found state on a 404 response", async () => {
    apiRequestMock.mockRejectedValue(new ApiError("not found", 404));
    renderPage();
    await waitFor(() => expect(screen.getByText(/Session not found/i)).toBeInTheDocument());
  });

  it("shows a generic error state with retry on a network failure, and retry re-fetches", async () => {
    apiRequestMock.mockRejectedValueOnce(new Error("network down"));
    renderPage();
    await waitFor(() => expect(screen.getByText(/Couldn't load the report/i)).toBeInTheDocument());

    apiRequestMock.mockResolvedValueOnce(fullReport());
    screen.getByText(/Try again/i).click();
    await waitFor(() => expect(screen.getByText(/^Summary$/i)).toBeInTheDocument());
  });

  it("shows an empty-data state when the session completed zero tasks (never fabricated numbers)", async () => {
    apiRequestMock.mockResolvedValue(
      fullReport({ report_data: { ...fullReport().report_data, total_tasks_completed: 0, task_breakdown: [] } })
    );
    renderPage();
    await waitFor(() => expect(screen.getByText(/Report unavailable/i)).toBeInTheDocument());
    expect(screen.queryByText(/^Summary$/i)).not.toBeInTheDocument();
  });

  it("renders the synthesis section with real backend metrics, never fallback/demo values", async () => {
    apiRequestMock.mockResolvedValue(fullReport());
    renderPage();
    await waitFor(() => expect(screen.getByText(/^Summary$/i)).toBeInTheDocument());
    // These values are real and intentionally echoed in later, more detailed
    // sections too -- assert presence, not exclusivity, of each real number.
    expect(screen.getAllByText("88 / 100").length).toBeGreaterThan(0); // productivity_index
    expect(screen.getAllByText("22 / 100").length).toBeGreaterThan(0); // fatigue_score
    expect(screen.getAllByText("4 / 5").length).toBeGreaterThan(0); // latest declared stress
  });

  it("only displays a synthesis metric the backend actually provided (no invented fallback)", async () => {
    const report = fullReport({ productivity_index: null, stress: null });
    // Keep the fixture internally consistent: a real backend never reports
    // `stress: null` (no declarations at all) alongside a computed stress
    // EVOLUTION -- compute_stress_evolution requires the same declarations
    // and returns INSUFFICIENT_DATA under the same condition.
    report.behavioral_evaluation = {
      ...report.behavioral_evaluation!,
      stress: { early_value: null, late_value: null, change: null, evolution: "INSUFFICIENT_DATA" },
    };
    apiRequestMock.mockResolvedValue(report);
    renderPage();
    await waitFor(() => expect(screen.getByText(/^Summary$/i)).toBeInTheDocument());
    expect(screen.queryByText(/^Declared pressure$/i)).not.toBeInTheDocument();
  });

  it("renders the performance-over-time section with discrete per-task charts, not a fabricated series", async () => {
    apiRequestMock.mockResolvedValue(fullReport());
    renderPage();
    await waitFor(() => expect(screen.getByText(/Performance over the session/i)).toBeInTheDocument());
    // Chart internals don't render in jsdom (ResponsiveContainer has no
    // real layout there) -- assert the real, discrete-per-task framing
    // instead of parsing SVG tick labels.
    expect(screen.getByText(/Score per task/i)).toBeInTheDocument();
    expect(screen.getByText(/Execution time per task/i)).toBeInTheDocument();
  });

  it("shows an empty note instead of a fabricated chart when no tasks were completed", async () => {
    apiRequestMock.mockResolvedValue(fullReport({ report_data: { ...fullReport().report_data, task_breakdown: [] } }));
    renderPage();
    await waitFor(() => expect(screen.getByText(/Performance over the session/i)).toBeInTheDocument());
    // Same empty-state message legitimately appears twice (this section
    // and the task-breakdown table below, both fed the same empty list).
    expect(screen.getAllByText(/No task completed during this session/i).length).toBeGreaterThan(0);
  });

  it("renders productivity, cognitive load and fatigue with real values and methodology notes", async () => {
    apiRequestMock.mockResolvedValue(fullReport());
    renderPage();
    await waitFor(() => expect(screen.getByText(/^Productivity$/i)).toBeInTheDocument());
    expect(screen.getByText("40 / 100")).toBeInTheDocument(); // cognitive load
    expect(screen.getAllByText(/How this indicator is calculated/i).length).toBeGreaterThan(0);
  });

  it("shows the declared-stress evolution with real history, labeled as self-reported", async () => {
    apiRequestMock.mockResolvedValue(fullReport());
    renderPage();
    await waitFor(() => expect(screen.getByText(/Declared perceived pressure level/i)).toBeInTheDocument());
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("renders errors-by-type with a real task label and a meaningful empty state when there are none", async () => {
    apiRequestMock.mockResolvedValue(fullReport());
    renderPage();
    await waitFor(() => expect(screen.getByText(/Error analysis/i)).toBeInTheDocument());
    expect(screen.getByText("Email writing")).toBeInTheDocument();
  });

  it("shows a meaningful empty state when there are zero errors (never hidden)", async () => {
    apiRequestMock.mockResolvedValue(
      fullReport({ behavioral_metrics: { pause_count: 0, total_pause_duration_seconds: 0, average_pause_duration_seconds: null, errors_by_type: { data_validation: 0 } } })
    );
    renderPage();
    await waitFor(() => expect(screen.getByText(/Error analysis/i)).toBeInTheDocument());
    expect(screen.getByText(/No error recorded/i)).toBeInTheDocument();
  });

  it("renders the task breakdown table with human-readable labels, never raw enum names", async () => {
    apiRequestMock.mockResolvedValue(fullReport());
    renderPage();
    await waitFor(() => expect(screen.getByText(/Completed task detail/i)).toBeInTheDocument());
    expect(screen.getAllByText("Data validation").length).toBeGreaterThan(0);
    expect(screen.queryByText("data_validation")).not.toBeInTheDocument();
  });

  it("shows typing behavior only when typing_metrics is present", async () => {
    apiRequestMock.mockResolvedValue(fullReport());
    renderPage();
    await waitFor(() => expect(screen.getByText(/Typing behavior/i)).toBeInTheDocument());
    expect(screen.getByText("143")).toBeInTheDocument();
  });

  it("hides the typing behavior section entirely when typing_metrics is null (no fake zero values)", async () => {
    apiRequestMock.mockResolvedValue(fullReport({ typing_metrics: null }));
    renderPage();
    await waitFor(() => expect(screen.getByText(/Pauses and idle periods/i)).toBeInTheDocument());
    expect(screen.queryByText(/Typing behavior/i)).not.toBeInTheDocument();
  });

  it("renders the ARIA supervision evolution from real tone history", async () => {
    apiRequestMock.mockResolvedValue(fullReport());
    renderPage();
    await waitFor(() => expect(screen.getByText(/AI supervision and adaptation/i)).toBeInTheDocument());
    // "Neutral"/"Demanding" appear twice each (the tone-history pill sequence
    // and the color-key legend below it) -- assert presence, not exclusivity.
    expect(screen.getAllByText("Neutral").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Demanding").length).toBeGreaterThan(0);
  });

  it("renders backend-provided structured recommendations (title/observation/advice), not raw strings", async () => {
    apiRequestMock.mockResolvedValue(fullReport());
    renderPage();
    await waitFor(() => expect(screen.getByText(/Personalized recommendations/i)).toBeInTheDocument());
    expect(screen.getByText("Verification under pressure")).toBeInTheDocument();
    expect(screen.getByText(/Errors were concentrated toward the end of the session/i)).toBeInTheDocument();
  });

  it("renders the methodology section with the required transparency disclaimers", async () => {
    apiRequestMock.mockResolvedValue(fullReport());
    renderPage();
    await waitFor(() => expect(screen.getByText(/Methodology and transparency/i)).toBeInTheDocument());
    expect(screen.getByText(/do not constitute a medical or psychological diagnosis/i)).toBeInTheDocument();
  });

  it("renders a final summary generated from real metrics, not a generic paragraph", async () => {
    apiRequestMock.mockResolvedValue(fullReport());
    renderPage();
    await waitFor(() => expect(screen.getByText(/What your simulation shows/i)).toBeInTheDocument());
    expect(screen.getByText(/Strength observed/i)).toBeInTheDocument();
    expect(screen.getByText(/Point of attention/i)).toBeInTheDocument();
  });

  it("exposes a PDF export action that triggers the browser print flow", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    apiRequestMock.mockResolvedValue(fullReport());
    renderPage();
    await waitFor(() => expect(screen.getByText(/Export PDF report/i)).toBeInTheDocument());
    screen.getByText(/Export PDF report/i).click();
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });
});
