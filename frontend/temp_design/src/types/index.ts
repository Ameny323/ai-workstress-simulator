export type SimulationState = "idle" | "running" | "paused" | "finished";
export type SimulationPhase = "onboarding" | "warmup" | "peak" | "cooldown" | "review";
export type PressureLevel = "very_low" | "low" | "moderate" | "high" | "very_high";
export type ManagerMode = "supportive" | "professional" | "demanding" | "strict" | "micromanager";
export type StressLevel = 1 | 2 | 3 | 4 | 5;
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type TaskType = "analysis" | "report" | "review" | "meeting" | "research" | "design";
export type NavSection =
  | "dashboard"
  | "simulation"
  | "tasks"
  | "manager"
  | "analytics"
  | "reports"
  | "settings";

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: string;
}

export interface Session {
  id: string;
  phase: SimulationPhase;
  elapsedTime: number; // seconds
  remainingTime: number; // seconds
  state: SimulationState;
  startedAt: Date;
}

export interface Task {
  id: string;
  title: string;
  type: TaskType;
  priority: TaskPriority;
  deadline: Date;
  progress: number; // 0–100
  estimatedDuration: number; // minutes
}

export interface ChatMessage {
  id: string;
  role: "manager" | "user";
  content: string;
  timestamp: Date;
}

export interface Notification {
  id: string;
  type: "task_assigned" | "deadline_reduced" | "pressure_increased" | "reminder";
  title: string;
  description: string;
  timestamp: Date;
  read: boolean;
}

export interface PerformanceMetrics {
  productivity: number;
  fatigue: number;
  responseTime: number; // seconds
  errorRate: number; // percentage
}

export interface TimelineEvent {
  id: string;
  type: "task_completed" | "manager_message" | "stress_declared" | "task_assigned";
  title: string;
  description?: string;
  timestamp: Date;
}
