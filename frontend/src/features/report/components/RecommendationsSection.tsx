import { REPORT_COLORS as C } from "../reportTheme";
import type { Recommendation } from "../reportTypes";
import { EmptyState, SectionCard } from "./primitives";

// Renders exactly what the backend's deterministic rule engine returned
// (app/recommendations/engine.py) -- no frontend logic decides which
// recommendation applies, this is pure presentation of backend output.
export default function RecommendationsSection({ recommendations }: { recommendations: Recommendation[] }) {
  return (
    <SectionCard title="Personalized recommendations" subtitle="Based on the indicators observed during this simulation.">
      {recommendations.length === 0 ? (
        <EmptyState>No recommendation was generated for this session.</EmptyState>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {recommendations.map((rec, i) => (
            <div
              key={i}
              style={{
                borderLeft: `3px solid ${C.primary}`,
                paddingLeft: 14,
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.dark }}>{rec.title}</div>
              <div style={{ fontSize: 12.5, color: C.text, marginTop: 3, lineHeight: 1.5 }}>{rec.observation}</div>
              <div style={{ fontSize: 12.5, color: C.secondary, marginTop: 3, lineHeight: 1.5, fontStyle: "italic" }}>{rec.advice}</div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
