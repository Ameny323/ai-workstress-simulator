import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmailWritingTask, { type EmailWritingTaskData } from "./EmailWritingTask";

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock("@/api/client", () => ({ apiRequest: apiRequestMock }));

function makeTask(overrides: Partial<EmailWritingTaskData> = {}): EmailWritingTaskData {
  return {
    id: "task-1",
    title: "Reply to the client",
    description: null,
    instance_data: {
      sender: "Jamie Fox",
      sender_role: "Client",
      subject: "Delay update needed",
      context: "Shipment delayed.",
      original_request: "When will it ship?",
      objective: "Explain the delay.",
      urgency: 3,
      required_points: ["new delivery date", "reason for delay"],
      forbidden_points: [],
      min_length: 10,
      max_length: 500,
    },
    deadline_seconds: 300,
    ...overrides,
  };
}

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe("EmailWritingTask", () => {
  it("renders the real generated scenario -- sender, subject, original request, required points", () => {
    render(<EmailWritingTask task={makeTask()} onCompleted={vi.fn()} />);
    expect(screen.getByText("Jamie Fox")).toBeInTheDocument();
    expect(screen.getByText("Delay update needed")).toBeInTheDocument();
    expect(screen.getByText(/When will it ship/)).toBeInTheDocument();
    expect(screen.getByText("new delivery date")).toBeInTheDocument();
  });

  it("lets the user type a real, persisted response -- not a fake unpersisted field", async () => {
    apiRequestMock.mockResolvedValue({ content_score: 100, time_taken_seconds: 30, error_count: 0 });
    const user = userEvent.setup();
    render(<EmailWritingTask task={makeTask()} onCompleted={vi.fn()} />);

    const textarea = screen.getByPlaceholderText("Write your reply here...");
    await user.type(textarea, "Here is the new delivery date and reason for delay.");
    expect(textarea).toHaveValue("Here is the new delivery date and reason for delay.");

    await user.click(screen.getByRole("button", { name: /send reply/i }));

    await waitFor(() => expect(apiRequestMock.mock.calls.some(([url]) => url === "/tasks/task-1/complete")).toBe(true));
    const [, options] = apiRequestMock.mock.calls.find(([url]) => url === "/tasks/task-1/complete")!;
    const body = JSON.parse((options as { body: string }).body);
    expect(body.written_response).toBe("Here is the new delivery date and reason for delay.");
  });

  it("submits aggregate typing telemetry through the existing mechanism, never the raw typed text as telemetry", async () => {
    apiRequestMock.mockResolvedValue({ content_score: 100, time_taken_seconds: 30, error_count: 0 });
    const user = userEvent.setup();
    render(<EmailWritingTask task={makeTask()} onCompleted={vi.fn()} />);

    const textarea = screen.getByPlaceholderText("Write your reply here...");
    await user.type(textarea, "A reasonably long confidential reply covering the points.");
    await user.click(screen.getByRole("button", { name: /send reply/i }));

    await waitFor(() => expect(apiRequestMock.mock.calls.some(([url]) => url === "/tasks/task-1/complete")).toBe(true));
    const [, options] = apiRequestMock.mock.calls.find(([url]) => url === "/tasks/task-1/complete")!;
    const body = JSON.parse((options as { body: string }).body);
    expect(body.typing_metrics).toBeDefined();
    expect(typeof body.typing_metrics.character_count).toBe("number");
    expect(Object.values(body.typing_metrics).every((v) => typeof v === "number")).toBe(true);
    // The telemetry payload itself must never carry the typed text.
    expect(JSON.stringify(body.typing_metrics)).not.toContain("confidential");
  });

  it("calls onCompleted with the real backend-computed score, not a fabricated one", async () => {
    apiRequestMock.mockResolvedValue({ content_score: 75, time_taken_seconds: 42, error_count: 1 });
    const onCompleted = vi.fn();
    const user = userEvent.setup();
    render(<EmailWritingTask task={makeTask()} onCompleted={onCompleted} />);

    await user.type(screen.getByPlaceholderText("Write your reply here..."), "Reply text.");
    await user.click(screen.getByRole("button", { name: /send reply/i }));

    await waitFor(() =>
      expect(onCompleted).toHaveBeenCalledWith(expect.objectContaining({ contentScore: 75, errorCount: 1 }))
    );
  });

  it("shows a real error message and re-enables the send button when the backend call fails", async () => {
    apiRequestMock.mockRejectedValue(new Error("Network down"));
    const user = userEvent.setup();
    render(<EmailWritingTask task={makeTask()} onCompleted={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Write your reply here..."), "Reply text.");
    await user.click(screen.getByRole("button", { name: /send reply/i }));

    await waitFor(() => expect(screen.getByText("Network down")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /send reply/i })).not.toBeDisabled();
  });
});
