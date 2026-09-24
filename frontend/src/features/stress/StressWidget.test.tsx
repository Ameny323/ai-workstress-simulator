import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StressWidget from "./StressWidget";
import { ApiError } from "@/api/client";

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, apiRequest: apiRequestMock };
});

const SESSION_ID = "11111111-1111-1111-1111-111111111111";

function successResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "d1",
    session_id: SESSION_ID,
    task_id: null,
    stress_level: 3,
    declared_at: "2026-01-01T12:34:00Z",
    elapsed_seconds: 120,
    simulation_phase: "accueil",
    aria_state: "bienveillant",
    previous_stress_level: null,
    stress_change: null,
    ...overrides,
  };
}

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe("StressWidget", () => {
  it("renders the self-reported stress control with all 5 levels", () => {
    render(<StressWidget sessionId={SESSION_ID} />);
    expect(screen.getByText("How are you feeling right now?")).toBeInTheDocument();
    for (const level of [1, 2, 3, 4, 5]) {
      expect(screen.getByRole("radio", { name: new RegExp(`^${level} -`) })).toBeInTheDocument();
    }
  });

  it("exposes accessible labels for every level (screen-reader-friendly, not color-only)", () => {
    render(<StressWidget sessionId={SESSION_ID} />);
    expect(screen.getByRole("radio", { name: "1 - Calm" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "2 - Slightly pressured" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "3 - Moderately pressured" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "4 - Highly pressured" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "5 - Extremely pressured" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup")).toHaveAccessibleName();
  });

  it("uses semantic radio controls inside a radiogroup, keyboard-focusable", () => {
    render(<StressWidget sessionId={SESSION_ID} />);
    const group = screen.getByRole("radiogroup");
    const radios = screen.getAllByRole("radio");
    expect(group).toContainElement(radios[0]);
    for (const radio of radios) {
      expect(radio.tagName).toBe("BUTTON");
      expect(radio).not.toHaveAttribute("disabled");
    }
  });

  it("selecting a level submits it and shows the loading state while pending", async () => {
    let resolveRequest: (value: unknown) => void = () => {};
    apiRequestMock.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    const user = userEvent.setup();
    render(<StressWidget sessionId={SESSION_ID} />);

    await user.click(screen.getByRole("radio", { name: "3 - Moderately pressured" }));

    expect(apiRequestMock).toHaveBeenCalledWith(
      `/sessions/${SESSION_ID}/stress`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ stress_level: 3 }) })
    );
    // Loading state: every radio becomes non-interactive while a submission is in flight.
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "3 - Moderately pressured" })).toBeDisabled();
    });

    resolveRequest(successResponse({ stress_level: 3 }));
    await waitFor(() => {
      expect(screen.getByText(/Stress level recorded/)).toBeInTheDocument();
    });
  });

  it("shows the recorded confirmation with a timestamp after a successful submission", async () => {
    apiRequestMock.mockResolvedValue(successResponse({ stress_level: 4, declared_at: "2026-01-01T14:32:00Z" }));
    const user = userEvent.setup();
    render(<StressWidget sessionId={SESSION_ID} />);

    await user.click(screen.getByRole("radio", { name: "4 - Highly pressured" }));

    await waitFor(() => {
      expect(screen.getByText(/Stress level recorded/)).toBeInTheDocument();
      expect(screen.getByText(/Recorded at/)).toBeInTheDocument();
    });
    // No immediate analytical interpretation of any kind.
    expect(screen.queryByText(/your stress is high/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/performance is suffering/i)).not.toBeInTheDocument();
  });

  it("does not fire a second request while one is already in flight (duplicate submission protection)", async () => {
    let resolveRequest: (value: unknown) => void = () => {};
    apiRequestMock.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    const user = userEvent.setup();
    render(<StressWidget sessionId={SESSION_ID} />);

    const button = screen.getByRole("radio", { name: "2 - Slightly pressured" });
    await user.click(button);
    await user.click(button); // a rapid double click / retry
    await user.click(screen.getByRole("radio", { name: "5 - Extremely pressured" }));

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    resolveRequest(successResponse());
  });

  it("shows a calm, non-alarming message when the minimum interval hasn't elapsed (429)", async () => {
    apiRequestMock.mockRejectedValue(new ApiError("too soon", 429));
    const user = userEvent.setup();
    render(<StressWidget sessionId={SESSION_ID} />);

    await user.click(screen.getByRole("radio", { name: "2 - Slightly pressured" }));

    await waitFor(() => {
      expect(screen.getByText(/recorded recently.*update it again later/i)).toBeInTheDocument();
    });
  });

  it("shows a generic, non-alarming error message on a server/network failure", async () => {
    apiRequestMock.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<StressWidget sessionId={SESSION_ID} />);

    await user.click(screen.getByRole("radio", { name: "1 - Calm" }));

    await waitFor(() => {
      expect(screen.getByText("Your stress level could not be recorded. Please try again.")).toBeInTheDocument();
    });
  });

  it("is disabled and does not submit when the session is inactive", async () => {
    const user = userEvent.setup();
    render(<StressWidget sessionId={SESSION_ID} disabled />);

    const button = screen.getByRole("radio", { name: "3 - Moderately pressured" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("never uses diagnostic or clinical language anywhere in its copy", () => {
    render(<StressWidget sessionId={SESSION_ID} />);
    const text = document.body.textContent ?? "";
    for (const phrase of ["diagnos", "mental health", "anxiety", "suffering", "emergency"]) {
      expect(text.toLowerCase()).not.toContain(phrase);
    }
  });
});
