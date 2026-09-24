import { REPORT_COLORS as C } from "../reportTheme";
import { SectionCard } from "./primitives";

const POINTS = [
  "The data comes exclusively from the simulation session that was actually run.",
  "Execution times are measured server-side, from real timestamps.",
  "Errors come from a deterministic evaluation of each task, never an estimate.",
  "The pressure level is self-declared by the participant, on a scale of 1 to 5.",
  "The productivity index is a behavioral indicator, not a universal scientific measurement.",
  "Cognitive load is an estimate (a proxy indicator), not a direct measurement.",
  "Fatigue is a behavioral indicator based on an observed decline, not a medical diagnosis.",
  "The results are specific to this simulation and do not constitute a medical or psychological diagnosis.",
  "The results cannot automatically be generalized to real professional behavior.",
];

export default function MethodologySection() {
  return (
    <SectionCard title="Methodology and transparency">
      <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
        {POINTS.map((point, i) => (
          <li key={i} style={{ fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>
            {point}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
