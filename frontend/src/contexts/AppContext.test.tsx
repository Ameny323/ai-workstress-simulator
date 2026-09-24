import { useCallback } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppProvider, useApp } from "./AppContext";

// Regression test for the real bug this file's own ensureSession/
// abandonSession/finishSession fix addresses: a consumer that memoizes a
// callback with an empty dependency array (CockpitPage.tsx's
// loadCurrentTask does exactly this, deliberately, so its mount effect
// runs exactly once) permanently freezes whichever `ensureSession`
// function instance it captured at that first render. Before the fix,
// that frozen instance's own closure over `session` was `session` AS IT
// WAS at that render (EMPTY_SESSION) -- forever -- so every later call
// through it always thought no session existed and created a brand new
// one, silently discarding all real progress. CockpitPage.test.tsx
// cannot catch this because it mocks ensureSession entirely (a plain
// vi.fn() that isn't subject to closure staleness at all); this test
// exercises the REAL AppProvider instead.

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, apiRequest: apiRequestMock, getToken: () => null };
});

// Mirrors CockpitPage.tsx's own pattern exactly: capture ensureSession via
// useCallback([]) so it is frozen after the first render, then expose a
// button that calls it. Clicking twice simulates "mount" then "Continue to
// Next Task" -- the second call must reuse the same session, not create a
// new one, even though this component's own closure over ensureSession
// never updates.
function FrozenClosureConsumer() {
  const { ensureSession } = useApp();
  const callEnsureSession = useCallback(async () => {
    const id = await ensureSession();
    const el = document.getElementById("result");
    if (el) el.textContent = (el.textContent ?? "") + `${id};`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div>
      <button onClick={() => void callEnsureSession()}>call</button>
      <div id="result" />
    </div>
  );
}

function renderWithProvider() {
  return render(
    <MemoryRouter>
      <AppProvider>
        <FrozenClosureConsumer />
      </AppProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  apiRequestMock.mockReset();
  let callCount = 0;
  apiRequestMock.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (path === "/sessions/" && options?.method === "POST") {
      callCount += 1;
      return { id: `session-${callCount}`, started_at: new Date().toISOString(), current_phase: "accueil", status: "in_progress" };
    }
    throw new Error(`Unhandled apiRequest path in test: ${path}`);
  });
});

describe("AppContext ensureSession -- real (non-mocked) closure-staleness regression", () => {
  it("reuses the same session id across two calls made through a frozen (useCallback([])) closure, never creating a second session", async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByText("call"));
    await waitFor(() => expect(screen.getByText(/session-1;/)).toBeInTheDocument());

    await user.click(screen.getByText("call"));
    await waitFor(() => expect(screen.getByText(/session-1;session-1;/)).toBeInTheDocument());

    const sessionPostCalls = apiRequestMock.mock.calls.filter(([path, opts]) => path === "/sessions/" && (opts as { method?: string })?.method === "POST");
    expect(sessionPostCalls.length).toBe(1);
  });
});
