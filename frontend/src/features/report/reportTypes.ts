// Mirrors backend/app/schemas/session_report.py's SessionAnalyticsOut
// exactly -- field names, nullability, and structure. This is the single
// source of truth for the final report (cahier section 0/1): every number
// rendered by the report page must trace back to one of these fields.
// No frontend recomputation of scores/times/averages -- the backend
// remains authoritative for every calculation.
import { apiRequest } from "@/api/client";

export interface StressPoint {
  value: number;
  declared_at: string;
}

export interface TaskBreakdownItem {
  task_id: string;
  task_type: string;
  content_score: number | null;
  time_taken_seconds: number | null;
  error_count: number;
  status: string;
  completed_at: string | null;
  sequence_index: number | null;
}

export interface AriaSupervisionPoint {
  tone: string;
  at: string;
}

export interface SessionReportData {
  session_id: string;
  session_started_at: string;
  session_ended_at: string | null;
  phase_reached: string;
  total_tasks_completed: number;
  total_tasks_assigned: number;
  tasks_by_type: Record<string, number>;
  avg_score_overall: number | null;
  avg_score_first_half: number | null;
  avg_score_second_half: number | null;
  avg_time_taken_seconds_overall: number | null;
  avg_time_taken_seconds_first_half: number | null;
  avg_time_taken_seconds_second_half: number | null;
  error_count_trend: number[];
  stress_declarations: StressPoint[];
  task_breakdown: TaskBreakdownItem[];
  aria_supervision_history: AriaSupervisionPoint[];
}

export interface StressSummary {
  latest: number;
  average: number;
  minimum: number;
  maximum: number;
  change_from_first: number;
  declarations_count: number;
}

export interface BehavioralMetrics {
  pause_count: number;
  total_pause_duration_seconds: number;
  average_pause_duration_seconds: number | null;
  errors_by_type: Record<string, number>;
}

export interface TypingMetricsSummary {
  typing_sessions_count: number;
  total_typing_duration_seconds: number;
  total_character_count: number;
  average_chars_per_second: number;
  average_typing_speed_variation: number;
  total_pause_count_during_typing: number;
}

export interface Recommendation {
  title: string;
  observation: string;
  advice: string;
  source_observation: string | null;
}

// Mirrors backend/app/reports/behavioral_evaluation.py's output exactly
// (via app/schemas/session_report.py's BehavioralEvaluationOut) -- the
// backend is the sole authority on evolution/observation/confidence; this
// section only ever renders these fields, it never recomputes them.
export interface EvolutionMetric {
  early_value: number | null;
  late_value: number | null;
  change: number | null;
  evolution: string;
}

export interface TypingEvolution {
  speed: EvolutionMetric;
  variation: EvolutionMetric;
}

export interface BehavioralObservation {
  code: string;
  title: string;
  description: string;
  supporting_signals: string[];
}

export interface BehavioralEvaluation {
  performance: EvolutionMetric;
  pace: EvolutionMetric;
  errors: EvolutionMetric;
  pauses: EvolutionMetric;
  workflow: EvolutionMetric;
  stress: EvolutionMetric;
  typing: TypingEvolution | null;
  observations: BehavioralObservation[];
  primary_observation: BehavioralObservation | null;
  confidence: "HIGH" | "MODERATE" | "LOW" | "INSUFFICIENT_DATA";
  disclaimer: string;
}

export interface SessionAnalytics {
  report_data: SessionReportData;
  fatigue_score: number;
  recommendations: Recommendation[];
  stress: StressSummary | null;
  productivity_index: number | null;
  cognitive_load_estimate: number | null;
  behavioral_metrics: BehavioralMetrics;
  typing_metrics: TypingMetricsSummary | null;
  behavioral_evaluation: BehavioralEvaluation | null;
}

export function fetchSessionReport(sessionId: string): Promise<SessionAnalytics> {
  return apiRequest<SessionAnalytics>(`/sessions/${sessionId}/report`);
}
