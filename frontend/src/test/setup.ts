import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver -- Recharts' ResponsiveContainer (used by
// the session report's charts) needs one to avoid throwing during tests.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom has no IntersectionObserver either -- the landing page's scroll-
// reveal sections (useSectionReveal in LandingPage.tsx) construct one on
// mount, which would otherwise throw during tests.
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
}

