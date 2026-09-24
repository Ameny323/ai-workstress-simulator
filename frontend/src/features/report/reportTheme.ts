// Palette + display labels for the final simulation report only -- scoped
// to this feature rather than changing the app-wide theme in globals.css,
// since the report's visual identity (professional/research-oriented,
// cahier section 27) is deliberately distinct from the live simulation
// cockpit's own colors.
export const REPORT_COLORS = {
  primary: "#587A92",
  dark: "#263F52",
  deep: "#314C60",
  background: "#F3F6F8",
  surface: "#FFFFFF",
  text: "#243746",
  secondary: "#718493",
  accent: "#7E8DA3",
  subtleAi: "#8D88A8",
  mutedSuccess: "#719887",
  mutedWarning: "#B89A61",
  mutedDanger: "#B97878",
  border: "rgba(36,55,70,0.10)",
} as const;

// Human-readable labels -- the report must never expose raw internal enum
// names (cahier section 8). Keyed loosely (Record<string, string>) rather
// than PlayableTaskType so an unrecognized future type still degrades to a
// readable fallback instead of a TypeScript error.
// Names keep their historical _FR suffix (avoids a repo-wide rename churn
// across every importer) even though the displayed strings are now English.
export const TASK_TYPE_LABELS_FR: Record<string, string> = {
  data_validation: "Data validation",
  document_organization: "Document filing",
  image_matching: "Item matching",
  email_writing: "Email writing",
  urgent_request: "Urgent request response",
  email_prioritization: "Email prioritization",
};

export function taskTypeLabelFr(type: string): string {
  return TASK_TYPE_LABELS_FR[type] ?? type.replace(/_/g, " ");
}

export const PHASE_LABELS_FR: Record<string, string> = {
  accueil: "Onboarding",
  montee_pression: "Rising pressure",
  pic_charge: "Peak load",
  debriefing: "Debriefing",
};

// ManagerTone (ARIA's FSM tone) -- human labels for the supervision
// evolution section. Raw enum values are never shown directly.
export const ARIA_TONE_LABELS_FR: Record<string, string> = {
  bienveillant: "Supportive",
  neutre: "Neutral",
  exigeant: "Demanding",
  intrusif: "Intrusive",
};

export const ARIA_TONE_ORDER = ["bienveillant", "neutre", "exigeant", "intrusif"];

export const ARIA_TONE_COLORS: Record<string, string> = {
  bienveillant: REPORT_COLORS.mutedSuccess,
  neutre: REPORT_COLORS.secondary,
  exigeant: REPORT_COLORS.mutedWarning,
  intrusif: REPORT_COLORS.mutedDanger,
};

export const TASK_STATUS_LABELS_FR: Record<string, string> = {
  completed: "Completed",
  pending: "Pending",
  in_progress: "In progress",
  expired: "Expired",
};

// Declared-stress 1-5 scale labels, exactly as specified (cahier section 6)
// -- self-reported only, never inferred from behavior.
export const STRESS_LEVEL_LABELS_FR: Record<number, string> = {
  1: "Calm",
  2: "Slightly under pressure",
  3: "Moderately under pressure",
  4: "Strongly under pressure",
  5: "Extremely under pressure",
};
