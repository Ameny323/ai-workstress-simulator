import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UrgentRequestTask, { type UrgentRequestTaskData } from "./UrgentRequestTask";

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock("@/api/client", () => ({ apiRequest: apiRequestMock }));

function makeTask(): UrgentRequestTaskData {
  return {
    id: "task-1",
    title: "Production outage",
    description: null,
    instance_data: {
      sender: "Ops Bot",
      sender_role: "Automated Alert",
      subject: "ALERT",
      message: "Production is down.",
      urgency: 5,
      options: [
        { id: "escalate", label: "Escalate to on-call" },
        { id: "ignore", label: "Ignore it" },
        { id: "defer", label: "Defer to tomorrow" },
      ],
      correct_action: "escalate",
    },
    deadline_seconds: 90,
  };
}

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe("UrgentRequestTask", () => {
  it("renders the real backend-generated scenario -- no hardcoded demo content", () => {
    render(<UrgentRequestTask task={makeTask()} onCompleted={vi.fn()} />);
    expect(screen.getByText("Production is down.")).toBeInTheDocument();
    expect(screen.getByText("Escalate to on-call")).toBeInTheDocument();
    expect(screen.getByText("Ignore it")).toBeInTheDocument();
    expect(screen.getByText("Defer to tomorrow")).toBeInTheDocument();
  });

  it("never displays the correct_action answer key to the user", () => {
    render(<UrgentRequestTask task={makeTask()} onCompleted={vi.fn()} />);
    expect(screen.queryByText(/correct_action/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^escalate$/i)).not.toBeInTheDocument();
  });

  it("disables Respond until an option is chosen", () => {
    render(<UrgentRequestTask task={makeTask()} onCompleted={vi.fn()} />);
    expect(screen.getByRole("button", { name: /respond/i })).toBeDisabled();
  });

  it("calls the real engagement endpoint on the first option selection, never on render", async () => {
    apiRequestMock.mockResolvedValue({});
    const user = userEvent.setup();
    render(<UrgentRequestTask task={makeTask()} onCompleted={vi.fn()} />);
    expect(apiRequestMock.mock.calls.some(([url]) => url === "/tasks/task-1/engage")).toBe(false);
    await user.click(screen.getByText("Escalate to on-call"));
    await waitFor(() => expect(apiRequestMock.mock.calls.some(([url]) => url === "/tasks/task-1/engage")).toBe(true));
  });

  it("submits through the existing task completion mechanism with the selected action and reconsideration count", async () => {
    apiRequestMock.mockResolvedValue({ content_score: 100, time_taken_seconds: 12, error_count: 0 });
    const user = userEvent.setup();
    render(<UrgentRequestTask task={makeTask()} onCompleted={vi.fn()} />);

    await user.click(screen.getByText("Ignore it"));
    await user.click(screen.getByText("Escalate to on-call")); // a genuine reconsideration
    await user.click(screen.getByRole("button", { name: /respond/i }));

    await waitFor(() => expect(apiRequestMock.mock.calls.some(([url]) => url === "/tasks/task-1/complete")).toBe(true));
    const [, options] = apiRequestMock.mock.calls.find(([url]) => url === "/tasks/task-1/complete")!;
    const body = JSON.parse((options as { body: string }).body);
    expect(body.selected_action).toBe("escalate");
    expect(body.reconsideration_count).toBe(1);
  });

  it("does not count the very first selection as a reconsideration", async () => {
    apiRequestMock.mockResolvedValue({ content_score: 100, time_taken_seconds: 12, error_count: 0 });
    const user = userEvent.setup();
    render(<UrgentRequestTask task={makeTask()} onCompleted={vi.fn()} />);

    await user.click(screen.getByText("Escalate to on-call"));
    await user.click(screen.getByRole("button", { name: /respond/i }));

    await waitFor(() => expect(apiRequestMock.mock.calls.some(([url]) => url === "/tasks/task-1/complete")).toBe(true));
    const [, options] = apiRequestMock.mock.calls.find(([url]) => url === "/tasks/task-1/complete")!;
    const body = JSON.parse((options as { body: string }).body);
    expect(body.reconsideration_count).toBe(0);
  });

  it("calls onCompleted with the real backend-computed result, never a fabricated one", async () => {
    apiRequestMock.mockResolvedValue({ content_score: 100, time_taken_seconds: 12, error_count: 0 });
    const onCompleted = vi.fn();
    const user = userEvent.setup();
    render(<UrgentRequestTask task={makeTask()} onCompleted={onCompleted} />);

    await user.click(screen.getByText("Escalate to on-call"));
    await user.click(screen.getByRole("button", { name: /respond/i }));

    await waitFor(() =>
      expect(onCompleted).toHaveBeenCalledWith(expect.objectContaining({ contentScore: 100, errorCount: 0 }))
    );
  });

  it("shows a real error message and re-enables Respond when the backend call fails", async () => {
    apiRequestMock.mockRejectedValue(new Error("Network down"));
    const user = userEvent.setup();
    render(<UrgentRequestTask task={makeTask()} onCompleted={vi.fn()} />);

    await user.click(screen.getByText("Escalate to on-call"));
    await user.click(screen.getByRole("button", { name: /respond/i }));

    await waitFor(() => expect(screen.getByText("Network down")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /respond/i })).not.toBeDisabled();
  });
});
