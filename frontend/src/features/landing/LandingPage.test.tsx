import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LandingPage from "./LandingPage";

// The "Start the simulation" CTA (the /#simulation showcase section's
// primary button): a logged-in visitor may already have an unfinished
// session, so clicking it now asks whether to start fresh or continue a
// previous one, instead of jumping straight into /tasks. Logged out,
// there's no session history to choose from, so it should behave exactly
// as before -- a plain link to /login, no popup.

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const { useAppMock } = vi.hoisted(() => ({ useAppMock: vi.fn() }));
vi.mock("@/contexts/AppContext", () => ({
  useApp: () => useAppMock(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigateMock.mockReset();
});

describe("LandingPage -- 'Start the simulation' CTA", () => {
  it("shows a New vs. Continue choice popup for a logged-in user instead of navigating immediately", async () => {
    useAppMock.mockReturnValue({ isAuthenticated: true, user: { name: "Test User" }, session: { state: "idle" } });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Start the simulation →" }));

    expect(screen.getByText("Start a new simulation, or continue a previous one?")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("'Start New Simulation' navigates to /tasks", async () => {
    useAppMock.mockReturnValue({ isAuthenticated: true, user: { name: "Test User" }, session: { state: "idle" } });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Start the simulation →" }));
    await user.click(screen.getByText("Start New Simulation →"));

    expect(navigateMock).toHaveBeenCalledWith("/tasks");
  });

  it("'Continue Previous Session' navigates to /simulation (the session history page)", async () => {
    useAppMock.mockReturnValue({ isAuthenticated: true, user: { name: "Test User" }, session: { state: "idle" } });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Start the simulation →" }));
    await user.click(screen.getByText("Continue Previous Session"));

    expect(navigateMock).toHaveBeenCalledWith("/simulation");
  });

  it("Cancel closes the popup without navigating anywhere", async () => {
    useAppMock.mockReturnValue({ isAuthenticated: true, user: { name: "Test User" }, session: { state: "idle" } });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Start the simulation →" }));
    await user.click(screen.getByText("Cancel"));

    expect(screen.queryByText("Start a new simulation, or continue a previous one?")).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("for a logged-out visitor, the CTA is a plain link straight to /login -- no popup, nothing to choose between", async () => {
    useAppMock.mockReturnValue({ isAuthenticated: false, user: { name: "" }, session: { state: "idle" } });
    renderPage();

    const link = screen.getByRole("link", { name: "Start the simulation →" });
    expect(link).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("button", { name: "Start the simulation →" })).not.toBeInTheDocument();
  });
});
