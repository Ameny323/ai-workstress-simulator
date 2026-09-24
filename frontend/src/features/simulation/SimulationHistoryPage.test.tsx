import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import SimulationHistoryPage from "./SimulationHistoryPage";

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, apiRequest: apiRequestMock };
});

const { resumeSessionMock, navigateMock } = vi.hoisted(() => ({
  resumeSessionMock: vi.fn(),
  navigateMock: vi.fn(),
}));
// The page now renders SiteNav directly (front-office header, matching
// Home/Settings -- see the component's own top comment), so this mock
// must also satisfy SiteNav's own useApp() usage (isAuthenticated/user/
// session for its session-status pill), not just resumeSession.
vi.mock("@/contexts/AppContext", () => ({
  useApp: () => ({
    resumeSession: resumeSessionMock,
    isAuthenticated: true,
    user: { id: "u1", name: "Test User", email: "test@example.com", role: "Analyst" },
    session: { state: "idle" },
  }),
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <SimulationHistoryPage />
    </MemoryRouter>
  );
}

const inProgressSession = {
  id: "session-unfinished",
  user_id: "u1",
  started_at: "2026-09-17T09:00:00Z",
  ended_at: null,
  current_phase: "montee_pression",
  status: "in_progress" as const,
  task_sequence_position: 2,
  task_sequence: ["data_validation", "data_validation", "document_organization", "document_organization", "email_writing", "urgent_request"],
};

const completedSession = {
  id: "session-done",
  user_id: "u1",
  started_at: "2026-09-16T09:00:00Z",
  ended_at: "2026-09-16T10:00:00Z",
  current_phase: "debriefing",
  status: "completed" as const,
  task_sequence_position: 6,
  task_sequence: ["data_validation", "data_validation", "document_organization", "document_organization", "email_writing", "urgent_request"],
};

beforeEach(() => {
  apiRequestMock.mockReset();
  resumeSessionMock.mockReset();
  navigateMock.mockReset();
});

describe("SimulationHistoryPage", () => {
  it("shows the page's own header, not a dashboard-widget title", async () => {
    apiRequestMock.mockResolvedValueOnce([inProgressSession]);
    renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Simulation History" })).toBeInTheDocument());
    expect(screen.getByText(/Review your previous simulation sessions and continue unfinished simulations/i)).toBeInTheDocument();
  });

  it("lists past sessions with real progress, letting an in-progress one resume via AppContext.resumeSession", async () => {
    apiRequestMock.mockResolvedValueOnce([inProgressSession]);

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText("6 tasks assigned · 2 completed")).toBeInTheDocument());
    expect(apiRequestMock).toHaveBeenCalledWith("/sessions/");
    expect(screen.getByText("In Progress")).toBeInTheDocument();

    await user.click(screen.getByText("Continue Simulation →"));
    expect(resumeSessionMock).toHaveBeenCalledWith(inProgressSession);
  });

  it("routes a completed session's 'View Report' button to its report page", async () => {
    apiRequestMock.mockResolvedValueOnce([completedSession]);

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText("View Report")).toBeInTheDocument());
    expect(screen.getByText("Completed")).toBeInTheDocument();
    await user.click(screen.getByText("View Report"));
    expect(navigateMock).toHaveBeenCalledWith("/sessions/session-done/report");
  });

  it("shows a professional empty state with a working Start Simulation action when the user has no sessions at all", async () => {
    apiRequestMock.mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText("No simulation sessions yet")).toBeInTheDocument());
    expect(screen.getByText(/Start a simulation to begin building your session history/i)).toBeInTheDocument();

    await user.click(screen.getByText("Start Simulation"));
    expect(navigateMock).toHaveBeenCalledWith("/tasks");
  });

  it("filters the list client-side by status without any extra API call", async () => {
    apiRequestMock.mockResolvedValueOnce([inProgressSession, completedSession]);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText("Continue Simulation →")).toBeInTheDocument());
    expect(screen.getByText("View Report")).toBeInTheDocument();

    await user.click(screen.getByText("Completed (1)"));
    expect(screen.queryByText("Continue Simulation →")).not.toBeInTheDocument();
    expect(screen.getByText("View Report")).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByText("In Progress (1)"));
    expect(screen.getByText("Continue Simulation →")).toBeInTheDocument();
    expect(screen.queryByText("View Report")).not.toBeInTheDocument();
  });
});
