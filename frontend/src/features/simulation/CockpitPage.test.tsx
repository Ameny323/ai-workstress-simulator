import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { FakeWebSocket } from "@/test/fakeWebSocket";
import CockpitPage from "./CockpitPage";

// This suite validates the CONTROLLED SEQUENTIAL SIMULATION flow:
// CockpitPage must fetch "whatever the backend says is current"
// (GET /sessions/{id}/next-task, now sequence-driven and never sent a
// task_type by the client), render the matching component, and expose
// the sidebar as a READ-ONLY progress indicator -- no clickable tabs, no
// way to jump to another task. It must also keep consuming the real ARIA
// pipeline (WebSocket + GET manager-messages/performance-snapshot) and
// the real stress-declaration endpoint, unchanged by this pass.

const ensureSessionMock = vi.fn();
const finishSessionMock = vi.fn();
vi.mock("@/contexts/AppContext", () => ({
  useApp: () => ({
    ensureSession: ensureSessionMock,
    abandonSession: vi.fn(),
    finishSession: finishSessionMock,
    user: { name: "Test User" },
    isAuthenticated: true,
  }),
}));

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, apiRequest: apiRequestMock, getToken: () => "fake-token" };
});

function sequencedTask(overrides: Record<string, unknown>) {
  return {
    id: "task-1",
    deadline_seconds: 240,
    sequence_index: 0,
    sequence_total: 6,
    remaining_global_seconds: 1700,
    ...overrides,
  };
}

const DATA_VALIDATION_TASK = sequencedTask({
  type: "data_validation",
  title: "Contact records",
  description: "Review the imported contact list.",
  instance_data: {
    columns: ["Name", "Email"],
    records: [
      { id: 1, Name: "James Smith", Email: "james.smith@gmail.com", is_valid: true },
      { id: 2, Name: "Maria Garcia", Email: "mariagarciagmail.com", is_valid: false },
    ],
  },
});

const DOC_ORG_TASK = sequencedTask({
  type: "document_organization",
  title: "Sort the inbox",
  description: null,
  sequence_index: 2,
  instance_data: {
    categories: ["Finance", "HR"],
    records: [
      { id: 1, filename: "invoice.pdf", correct_category: "Finance" },
      { id: 2, filename: "onboarding.docx", correct_category: "HR" },
    ],
  },
});

const EMAIL_WRITING_TASK = sequencedTask({
  type: "email_writing",
  title: "Reply to the client",
  description: null,
  sequence_index: 4,
  instance_data: {
    sender: "Jamie Fox",
    sender_role: "Client",
    subject: "Delay update needed",
    context: "Shipment delayed.",
    original_request: "When will it ship?",
    objective: "Explain the delay.",
    urgency: 3,
    required_points: ["new delivery date"],
    forbidden_points: [],
    min_length: 10,
    max_length: 500,
  },
});

const URGENT_REQUEST_TASK = sequencedTask({
  type: "urgent_request",
  title: "Production outage",
  description: null,
  sequence_index: 5,
  instance_data: {
    sender: "Ops Bot",
    sender_role: "Automated Alert",
    subject: "ALERT",
    message: "Production is down.",
    urgency: 5,
    options: [
      { id: "escalate", label: "Escalate to on-call" },
      { id: "ignore", label: "Ignore it" },
    ],
    correct_action: "escalate",
  },
});

function mockApiResponses(overrides: {
  nextTask?: unknown;
  managerMessages?: unknown[];
  performanceSnapshot?: unknown;
  stress?: unknown;
} = {}) {
  apiRequestMock.mockImplementation(async (path: string) => {
    if (path === "/sessions/session-1/next-task") return overrides.nextTask ?? DATA_VALIDATION_TASK;
    if (path.includes("/manager-messages")) return overrides.managerMessages ?? [];
    if (path.includes("/performance-snapshot")) {
      return (
        overrides.performanceSnapshot ?? {
          avg_score: 0,
          consecutive_errors: 0,
          declared_stress: null,
          tasks_completed_in_session: 0,
          window_size: 0,
          current_phase: "accueil",
        }
      );
    }
    if (path.includes("/stress")) {
      return (
        overrides.stress ?? {
          id: "sd-1",
          session_id: "session-1",
          task_id: null,
          stress_level: 3,
          declared_at: new Date().toISOString(),
          elapsed_seconds: 10,
          simulation_phase: "accueil",
          aria_state: "bienveillant",
          previous_stress_level: null,
          stress_change: null,
        }
      );
    }
    throw new Error(`Unhandled apiRequest path in test: ${path}`);
  });
}

function renderCockpit() {
  return render(
    <MemoryRouter>
      <CockpitPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  ensureSessionMock.mockReset();
  ensureSessionMock.mockResolvedValue("session-1");
  finishSessionMock.mockReset();
  finishSessionMock.mockResolvedValue(undefined);
  apiRequestMock.mockReset();
  FakeWebSocket.reset();
  vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CockpitPage -- controlled sequential simulation", () => {
  it("fetches the current task from the backend without ever sending a task_type", async () => {
    mockApiResponses({ nextTask: DATA_VALIDATION_TASK });
    renderCockpit();

    await waitFor(() => expect(screen.getByText("Contact records")).toBeInTheDocument());
    const nextTaskCall = apiRequestMock.mock.calls.find(([path]) => (path as string).includes("next-task"));
    expect(nextTaskCall![0]).toBe("/sessions/session-1/next-task");
  });

  it("renders the correct component for whatever type the backend returns: data_validation", async () => {
    mockApiResponses({ nextTask: DATA_VALIDATION_TASK });
    renderCockpit();
    await waitFor(() => expect(screen.getByText("Contact records")).toBeInTheDocument());
    expect(screen.getByText("James Smith")).toBeInTheDocument();
  });

  it("renders the correct component for document_organization", async () => {
    mockApiResponses({ nextTask: DOC_ORG_TASK });
    renderCockpit();
    await waitFor(() => expect(screen.getByText("invoice.pdf")).toBeInTheDocument());
  });

  it("renders the correct component for email_writing", async () => {
    mockApiResponses({ nextTask: EMAIL_WRITING_TASK });
    renderCockpit();
    await waitFor(() => expect(screen.getByText("Jamie Fox")).toBeInTheDocument());
  });

  it("renders the correct component for urgent_request", async () => {
    mockApiResponses({ nextTask: URGENT_REQUEST_TASK });
    renderCockpit();
    await waitFor(() => expect(screen.getByText("Production is down.")).toBeInTheDocument());
    expect(screen.getByText("Escalate to on-call")).toBeInTheDocument();
  });

  it("shows real sequence metadata (Task N / total) from the backend response, never invented locally", async () => {
    mockApiResponses({ nextTask: DOC_ORG_TASK }); // sequence_index=2, sequence_total=6
    renderCockpit();
    await waitFor(() => expect(screen.getByText(/Task 3 \/ 6/)).toBeInTheDocument());
  });

  it("the sidebar sequence progress indicator is entirely read-only -- no clickable navigation", async () => {
    mockApiResponses({ nextTask: DOC_ORG_TASK });
    renderCockpit();
    await waitFor(() => expect(screen.getByText("invoice.pdf")).toBeInTheDocument());

    // No button anywhere lets the user pick a different task type/tab.
    const allButtons = screen.getAllByRole("button");
    for (const button of allButtons) {
      expect(button.textContent).not.toMatch(/Email Writing|Data Validation|Urgent Request|Document Organization/);
    }
  });

  it("marks completed sequence positions with a checkmark and future positions as locked", async () => {
    mockApiResponses({ nextTask: DOC_ORG_TASK }); // index 2 of 6: two done, three locked after
    renderCockpit();
    await waitFor(() => expect(screen.getByText("invoice.pdf")).toBeInTheDocument());

    expect(screen.getAllByText("✓").length).toBe(2); // positions 0 and 1 already done
    expect(screen.getAllByText(/🔒/).length).toBe(3); // positions 3, 4, 5 not reached yet
    expect(screen.getByText("●")).toBeInTheDocument(); // the current, active position
  });

  it("completing the current task shows the real result, then fetches the next one on Continue", async () => {
    mockApiResponses({ nextTask: DATA_VALIDATION_TASK });
    const user = userEvent.setup();
    renderCockpit();
    await waitFor(() => expect(screen.getByText("Contact records")).toBeInTheDocument());

    apiRequestMock.mockImplementation(async (path: string) => {
      if (path === "/tasks/task-1/complete") return { content_score: 50, time_taken_seconds: 8, error_count: 1 };
      throw new Error(`unexpected: ${path}`);
    });
    await user.click(screen.getByRole("button", { name: /submit task/i }));

    await waitFor(() => expect(screen.getByText("Task Complete")).toBeInTheDocument());
    expect(screen.getByText("50%")).toBeInTheDocument();

    mockApiResponses({ nextTask: DOC_ORG_TASK });
    await user.click(screen.getByRole("button", { name: /continue to next task/i }));
    await waitFor(() => expect(screen.getByText("invoice.pdf")).toBeInTheDocument());
  });

  it("a refresh (remount) returns the same active task the backend reports as current, not a different one", async () => {
    mockApiResponses({ nextTask: DOC_ORG_TASK });
    const { unmount } = renderCockpit();
    await waitFor(() => expect(screen.getByText("invoice.pdf")).toBeInTheDocument());
    unmount();

    renderCockpit();
    await waitFor(() => expect(screen.getByText("invoice.pdf")).toBeInTheDocument());
  });

  it("treats a 409 (sequence complete / global timeout) as the real end of the simulation, not an error", async () => {
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path === "/sessions/session-1/next-task") {
        const { ApiError } = await vi.importActual<typeof import("@/api/client")>("@/api/client");
        throw new ApiError("Task sequence is complete", 409);
      }
      if (path.includes("/manager-messages")) return [];
      if (path.includes("/performance-snapshot")) return null;
      throw new Error(`unexpected: ${path}`);
    });
    renderCockpit();

    await waitFor(() => expect(finishSessionMock).toHaveBeenCalled());
    expect(screen.getByText(/Simulation finished/i)).toBeInTheDocument();
  });
});

describe("CockpitPage -- real ARIA/WebSocket/stress integration (unchanged by the sequencing pass)", () => {
  it("opens a real authenticated WebSocket connection to the active session", async () => {
    mockApiResponses({ nextTask: DATA_VALIDATION_TASK });
    renderCockpit();
    await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
    expect(FakeWebSocket.instances[0].url).toContain("/ws/sessions/session-1");
    expect(FakeWebSocket.instances[0].url).toContain("token=fake-token");
  });

  it("displays a real backend aria_message delivered over the WebSocket", async () => {
    mockApiResponses({ nextTask: DATA_VALIDATION_TASK });
    renderCockpit();
    await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
    const socket = FakeWebSocket.instances[0];
    socket.simulateOpen();
    socket.simulateMessage(
      JSON.stringify({
        type: "aria_message",
        session_id: "session-1",
        id: "msg-1",
        content: "Votre rythme est stable.",
        tone: "neutre",
        trigger: "task_progress",
        sent_at: new Date().toISOString(),
        was_fallback: false,
        event_id: "evt-1",
      })
    );
    await waitFor(() => expect(screen.getByText(/Votre rythme est stable/)).toBeInTheDocument());
  });

  it("re-fetches ARIA history and telemetry after a reconnect, closing the no-catch-up gap on a dropped connection", async () => {
    // Fixed gap (cross-module architecture audit, Part P #2): a dropped
    // WebSocket previously left no way to catch up on any aria_message/
    // state_update broadcast that happened during the outage --
    // useManagerMessages/useSessionTelemetry only re-fetched on a real
    // task transition. CockpitPage now bumps the same refresh counter the
    // instant the socket comes back from "reconnecting", forcing both
    // hooks' existing REST catch-up fetch.
    mockApiResponses({ nextTask: DATA_VALIDATION_TASK });
    renderCockpit();
    await waitFor(() => expect(FakeWebSocket.instances.length).toBe(1));
    FakeWebSocket.instances[0].simulateOpen();

    const messagesCallsBefore = apiRequestMock.mock.calls.filter(([p]) => (p as string).includes("/manager-messages")).length;
    const snapshotCallsBefore = apiRequestMock.mock.calls.filter(([p]) => (p as string).includes("/performance-snapshot")).length;

    // Real, unexpected drop -- triggers the hook's own reconnect scheduling.
    FakeWebSocket.instances[0].simulateClose();

    // The hook reconnects with a real (short, first-retry) backoff delay --
    // wait for the SECOND real connection attempt rather than faking timers,
    // to exercise the actual reconnect code path end to end.
    await waitFor(() => expect(FakeWebSocket.instances.length).toBe(2), { timeout: 3000 });
    FakeWebSocket.instances[1].simulateOpen();

    await waitFor(() => {
      const messagesCallsAfter = apiRequestMock.mock.calls.filter(([p]) => (p as string).includes("/manager-messages")).length;
      const snapshotCallsAfter = apiRequestMock.mock.calls.filter(([p]) => (p as string).includes("/performance-snapshot")).length;
      expect(messagesCallsAfter).toBeGreaterThan(messagesCallsBefore);
      expect(snapshotCallsAfter).toBeGreaterThan(snapshotCallsBefore);
    });
  });

  it("exposes real stress declaration directly from /tasks", async () => {
    mockApiResponses({ nextTask: DATA_VALIDATION_TASK });
    const user = userEvent.setup();
    renderCockpit();
    await waitFor(() => expect(screen.getByText(/Self-reported stress/i)).toBeInTheDocument());
    await user.click(screen.getByRole("radio", { name: /3 - Moderately pressured/i }));
    await waitFor(() =>
      expect(apiRequestMock).toHaveBeenCalledWith(
        "/sessions/session-1/stress",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ stress_level: 3 }) })
      )
    );
  });
});
