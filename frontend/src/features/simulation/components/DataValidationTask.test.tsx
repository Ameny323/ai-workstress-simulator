import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DataValidationTask, { type DataValidationTaskData } from "./DataValidationTask";

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock("@/api/client", () => ({ apiRequest: apiRequestMock }));

function makeTask(): DataValidationTaskData {
  return {
    id: "task-1",
    title: "Contact records",
    description: "Review the imported contact list.",
    instance_data: {
      columns: ["Name", "Email", "Phone"],
      records: [
        { id: 1, Name: "James Smith", Email: "james.smith@gmail.com", Phone: "(555) 123-4567", is_valid: true },
        { id: 2, Name: "Maria Garcia", Email: "maria.garciagmail.com", Phone: "(555) 987-6543", is_valid: false },
      ],
    },
    deadline_seconds: 120,
  };
}

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe("DataValidationTask", () => {
  it("renders the real task data (title, description, real records) -- no hardcoded demo records", () => {
    render(<DataValidationTask task={makeTask()} onCompleted={vi.fn()} />);
    expect(screen.getByText("Contact records")).toBeInTheDocument();
    expect(screen.getByText("Review the imported contact list.")).toBeInTheDocument();
    expect(screen.getByText("James Smith")).toBeInTheDocument();
    expect(screen.getByText("maria.garciagmail.com")).toBeInTheDocument();
  });

  it("calls the real engagement endpoint exactly once, on the first genuine interaction (never on render)", async () => {
    apiRequestMock.mockResolvedValue({ content_score: 100, time_taken_seconds: 12, error_count: 0 });
    const user = userEvent.setup();
    render(<DataValidationTask task={makeTask()} onCompleted={vi.fn()} />);

    expect(apiRequestMock.mock.calls.some(([url]) => url === "/tasks/task-1/engage")).toBe(false);

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    await waitFor(() => expect(apiRequestMock.mock.calls.some(([url]) => url === "/tasks/task-1/engage")).toBe(true));

    await user.click(checkboxes[1]);
    const engageCalls = apiRequestMock.mock.calls.filter(([url]) => url === "/tasks/task-1/engage");
    expect(engageCalls.length).toBe(1);
  });

  it("lets the user flag records as invalid and submits exactly the flagged ids", async () => {
    apiRequestMock.mockResolvedValue({ content_score: 100, time_taken_seconds: 12, error_count: 0 });
    const user = userEvent.setup();
    render(<DataValidationTask task={makeTask()} onCompleted={vi.fn()} />);

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[1]); // flag record id=2

    await user.click(screen.getByRole("button", { name: /submit task/i }));

    await waitFor(() => expect(apiRequestMock.mock.calls.some(([url]) => url === "/tasks/task-1/complete")).toBe(true));
    const [, options] = apiRequestMock.mock.calls.find(([url]) => url === "/tasks/task-1/complete")!;
    const body = JSON.parse((options as { body: string }).body);
    expect(body.flagged_ids).toEqual([2]);
  });

  it("calls onCompleted with the real backend-computed score, never a fabricated one", async () => {
    apiRequestMock.mockResolvedValue({ content_score: 50, time_taken_seconds: 8, error_count: 1 });
    const onCompleted = vi.fn();
    const user = userEvent.setup();
    render(<DataValidationTask task={makeTask()} onCompleted={onCompleted} />);

    await user.click(screen.getByRole("button", { name: /submit task/i }));

    await waitFor(() =>
      expect(onCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ contentScore: 50, errorCount: 1, timedOut: false })
      )
    );
  });

  it("shows a real error message and re-enables submit when the backend call fails", async () => {
    apiRequestMock.mockRejectedValue(new Error("Network down"));
    const user = userEvent.setup();
    render(<DataValidationTask task={makeTask()} onCompleted={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /submit task/i }));

    await waitFor(() => expect(screen.getByText("Network down")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /submit task/i })).not.toBeDisabled();
  });
});
