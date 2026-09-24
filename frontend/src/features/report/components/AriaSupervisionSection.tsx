import { ARIA_TONE_COLORS, ARIA_TONE_LABELS_FR, ARIA_TONE_ORDER, REPORT_COLORS as C } from "../reportTheme";
import type { AriaSupervisionPoint } from "../reportTypes";
import { EmptyState, MethodologyNote, Pill, SectionCard } from "./primitives";

// Real, already-persisted tone history (each ManagerMessage's tone at the
// moment it was sent) -- never fabricated. If this history were ever
// empty, this section explains why rather than drawing fake data (cahier
// section 11's explicit "do not fabricate" constraint).
export default function AriaSupervisionSection({ history }: { history: AriaSupervisionPoint[] }) {
  return (
    <SectionCard
      title="AI supervision and adaptation (ARIA)"
      subtitle="The supervision level evolved based on the simulation's events and behavioral indicators."
    >
      {history.length === 0 ? (
        <EmptyState>No supervision message was generated during this session.</EmptyState>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {history.map((point, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Pill text={ARIA_TONE_LABELS_FR[point.tone] ?? point.tone} color={ARIA_TONE_COLORS[point.tone] ?? C.secondary} />
              {i < history.length - 1 && <span style={{ color: C.secondary, fontSize: 12 }}>→</span>}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
        {ARIA_TONE_ORDER.map((tone) => (
          <span key={tone} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.secondary }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: ARIA_TONE_COLORS[tone], display: "inline-block" }} />
            {ARIA_TONE_LABELS_FR[tone]}
          </span>
        ))}
      </div>
      <MethodologyNote>
        This level reflects the simulation assistant's automatic adaptation -- it is not a detection of the
        participant's mental state.
      </MethodologyNote>
    </SectionCard>
  );
}
