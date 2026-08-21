import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { apiRequest } from "../api/client";
import type {
  User,
  Session,
  Task,
  ChatMessage,
  Notification,
  PerformanceMetrics,
  TimelineEvent,
  ManagerMode,
  NavSection,
  SimulationPhase,
  SimulationState,
} from "../types";

interface AppContextValue {
  user: User;
  session: Session;
  currentTask: Task;
  messages: ChatMessage[];
  notifications: Notification[];
  metrics: PerformanceMetrics;
  timeline: TimelineEvent[];
  managerMode: ManagerMode;
  pressureScore: number;
  isTyping: boolean;
  activeNav: NavSection;
  setActiveNav: (nav: NavSection) => void;
  startSimulation: () => Promise<void>;
  pauseSimulation: () => void;
  resumeSimulation: () => void;
  finishSession: () => void;
  completeTask: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const MOCK_USER: User = {
  id: "u_01",
  name: "Alex Morgan",
  email: "alex.morgan@workpulse.ai",
  role: "Senior Analyst",
};

const EMPTY_SESSION: Session = {
  id: "",
  phase: "onboarding",
  elapsedTime: 0,
  remainingTime: 0,
  state: "idle",
  startedAt: new Date(),
};

const EMPTY_TASK: Task = {
  id: "",
  title: "No task assigned yet",
  type: "analysis",
  priority: "medium",
  deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
  progress: 0,
  estimatedDuration: 0,
};

const EMPTY_METRICS: PerformanceMetrics = {
  productivity: 0,
  fatigue: 0,
  responseTime: 0,
  errorRate: 0,
};

function toFrontendPhase(phase?: string): SimulationPhase {
  switch (phase) {
    case "accueil":
      return "onboarding";
    case "montee_pression":
      return "warmup";
    case "pic_charge":
      return "peak";
    case "debriefing":
      return "review";
    default:
      return "onboarding";
  }
}

function toFrontendState(status?: string): SimulationState {
  switch (status) {
    case "in_progress":
      return "running";
    case "completed":
    case "abandoned":
      return "finished";
    default:
      return "idle";
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(EMPTY_SESSION);
  const [currentTask, setCurrentTask] = useState<Task>(EMPTY_TASK);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [metrics, setMetrics] = useState<PerformanceMetrics>(EMPTY_METRICS);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [activeNav, setActiveNav] = useState<NavSection>("dashboard");
  const [isTyping, setIsTyping] = useState(false);
  const [managerMode] = useState<ManagerMode>("professional");
  const [pressureScore, setPressureScore] = useState(0);

  useEffect(() => {
    if (session.state !== "running") return;
    const timer = setInterval(() => {
      setSession((s) => ({
        ...s,
        elapsedTime: s.elapsedTime + 1,
        remainingTime: Math.max(0, s.remainingTime - 1),
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, [session.state]);

  useEffect(() => {
    const cycle = setInterval(() => {
      setIsTyping(true);
      setTimeout(() => setIsTyping(false), 2800);
    }, 12000);
    return () => clearInterval(cycle);
  }, []);

  const startSimulation = async () => {
    try {
      const createdSession = await apiRequest<{
        id: string;
        user_id: string;
        started_at: string;
        ended_at: string | null;
        current_phase: string;
        status: string;
      }> ("/sessions/", { method: "POST" });

      const taskDeadline = new Date(Date.now() + 4 * 60 * 60 * 1000);
      const createdTask = await apiRequest<{
        id: string;
        session_id: string;
        type: string;
        title: string;
        description: string | null;
        assigned_at: string;
        deadline: string | null;
        completed_at: string | null;
        status: string;
        priority: string;
        error_count: number;
      }>(`/sessions/${createdSession.id}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          type: "validation_donnees",
          title: "Initial planning review",
          description: "Prepare the first response for the current workload.",
          deadline: taskDeadline.toISOString(),
          priority: "normal",
        }),
      });

      const nextSession: Session = {
        id: createdSession.id,
        phase: toFrontendPhase(createdSession.current_phase),
        elapsedTime: 0,
        remainingTime: 60 * 60 * 3,
        state: toFrontendState(createdSession.status),
        startedAt: new Date(createdSession.started_at),
      };

      const nextTask: Task = {
        id: createdTask.id,
        title: createdTask.title,
        type: "analysis",
        priority: createdTask.priority === "urgent" ? "high" : "medium",
        deadline: createdTask.deadline ? new Date(createdTask.deadline) : new Date(Date.now() + 4 * 60 * 60 * 1000),
        progress: 0,
        estimatedDuration: 45,
      };

      setSession(nextSession);
      setCurrentTask(nextTask);
      setMessages([
        {
          id: "welcome",
          role: "manager",
          content: "Simulation started. Review the task, monitor the pressure, and keep your pace steady.",
          timestamp: new Date(),
        },
      ]);
      setNotifications([
        {
          id: "welcome-note",
          type: "task_assigned",
          title: "Simulation started",
          description: "Your first task has been assigned and the dashboard has been activated.",
          timestamp: new Date(),
          read: false,
        },
      ]);
      setMetrics({ productivity: 62, fatigue: 24, responseTime: 3.8, errorRate: 1.4 });
      setTimeline([
        {
          id: "timeline-start",
          type: "task_assigned",
          title: "Session launched",
          description: "A new simulation session is now active.",
          timestamp: new Date(),
        },
      ]);
      setPressureScore(24);
    } catch (error) {
      console.error("Could not start simulation", error);
      setSession({ ...EMPTY_SESSION, state: "running", phase: "onboarding", remainingTime: 60 * 60 * 3 });
      setCurrentTask({ ...EMPTY_TASK, id: "fallback-task", title: "Fallback planning task", priority: "medium", estimatedDuration: 30, progress: 0 });
      setMessages([
        {
          id: "fallback-welcome",
          role: "manager",
          content: "The backend is unavailable, so the dashboard is using a fallback session for now.",
          timestamp: new Date(),
        },
      ]);
      setNotifications([
        {
          id: "fallback-note",
          type: "reminder",
          title: "Fallback mode",
          description: "The app is running locally until the API is reachable.",
          timestamp: new Date(),
          read: false,
        },
      ]);
      setMetrics({ productivity: 48, fatigue: 18, responseTime: 4.4, errorRate: 2.2 });
      setTimeline([
        {
          id: "timeline-fallback",
          type: "manager_message",
          title: "Fallback session",
          description: "The local experience is now active.",
          timestamp: new Date(),
        },
      ]);
      setPressureScore(20);
    }
  };

  const pauseSimulation = () => setSession((s) => ({ ...s, state: "paused" }));
  const resumeSimulation = () => setSession((s) => ({ ...s, state: "running" }));
  const finishSession = () => setSession((s) => ({ ...s, state: "finished" }));
  const completeTask = () => {
    setCurrentTask((task) => ({ ...task, progress: 100 }));
    setTimeline((events) => [
      {
        id: `timeline-${Date.now()}`,
        type: "task_completed",
        title: "Task completed",
        description: "The current task has been marked complete.",
        timestamp: new Date(),
      },
      ...events,
    ]);
  };
  const value: AppContextValue = {
    user: MOCK_USER,
    session,
    currentTask,
    messages,
    notifications,
    metrics,
    timeline,
    managerMode,
    pressureScore,
    isTyping,
    activeNav,
    setActiveNav,
    startSimulation,
    pauseSimulation,
    resumeSimulation,
    finishSession,
    completeTask,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
