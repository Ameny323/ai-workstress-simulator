import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BehavioralInterpretationSection from "./BehavioralInterpretationSection";
import type { BehavioralEvaluation } from "../reportTypes";

// This component renders the BACKEND's authoritative classification only --
// it must never compute stable/improving/declining itself. These tests
// assert exact pass-through of whatever the backend sent, not a recomputed
// value.
function makeEvaluation(overrides: Partial<BehavioralEvaluation> = {}): BehavioralEvaluation {
  return {
    performance: { early_value: 90, late_value: 40, change: -50, evolution: "DECLINING" },
    pace: { early_value: 80, late_value: 60, change: -20, evolution: "SLOWING" },
    errors: { early_value: 0, late_value: 3, change: 3, evolution: "INCREASING" },
    pauses: { early_value: 0, late_value: 0, change: 0, evolution: "STABLE" },
    workflow: { early_value: null, late_value: null, change: null, evolution: "INSUFFICIENT_DATA" },
    stress: { early_value: 2, late_value: 5, change: 3, evolution: "INCREASING" },
    typing: null,
    observations: [
      { code: "SLOW_INACCURATE", title: "Performance decline and slowdown", description: "Test description A", supporting_signals: ["PACE_SLOWING", "PERFORMANCE_DECLINING", "ERRORS_INCREASING"] },
    ],
    primary_observation: { code: "SLOW_INACCURATE", title: "Performance decline and slowdown", description: "Test description A", supporting_signals: [] },
    confidence: "MODERATE",
    disclaimer: "This interpretation describes the behaviors observed during the simulation. It does not constitute a medical or psychological evaluation.",
    ...overrides,
  };
}

describe("BehavioralInterpretationSection", () => {
  it("renders the backend's real primary observation title and description, never recomputed", () => {
    render(<BehavioralInterpretationSection evaluation={makeEvaluation()} />);
    expect(screen.getAllByText("Performance decline and slowdown").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Test description A").length).toBeGreaterThan(0);
  });

  it("renders the backend's confidence level, not an invented one", () => {
    render(<BehavioralInterpretationSection evaluation={makeEvaluation({ confidence: "LOW" })} />);
    expect(screen.getByText("Low")).toBeInTheDocument();
  });

  it("shows the fixed methodological disclaimer", () => {
    render(<BehavioralInterpretationSection evaluation={makeEvaluation()} />);
    expect(screen.getByText(/does not constitute a medical or psychological evaluation/i)).toBeInTheDocument();
  });

  it("renders an insufficient-data empty state instead of fabricating content when evaluation is null", () => {
    render(<BehavioralInterpretationSection evaluation={null} />);
    expect(screen.getByText(/Insufficient data/i)).toBeInTheDocument();
  });

  it("renders every real observation, not just the primary one", () => {
    const evaluation = makeEvaluation({
      observations: [
        { code: "SLOW_INACCURATE", title: "Obs 1", description: "d1", supporting_signals: [] },
        { code: "STRESS_PERFORMANCE_DECLINE", title: "Obs 2", description: "d2", supporting_signals: [] },
      ],
    });
    render(<BehavioralInterpretationSection evaluation={evaluation} />);
    expect(screen.getByText("Obs 1")).toBeInTheDocument();
    expect(screen.getByText("Obs 2")).toBeInTheDocument();
  });

  it("never renders medical or psychological diagnostic language", () => {
    render(<BehavioralInterpretationSection evaluation={makeEvaluation()} />);
    const bannedTerms = [/anxious/i, /burnout/i, /exhaustion/i, /diagnosis/i, /mental disorder/i];
    for (const term of bannedTerms) {
      expect(screen.queryByText(term)).not.toBeInTheDocument();
    }
  });
});
