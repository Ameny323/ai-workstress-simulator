import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type {
  User,
  Session,
  Task,
  ChatMessage,
  Notification,
  PerformanceMetrics,
  TimelineEvent,
  ManagerMode,
  StressLevel,
  NavSection,
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
  stressLevel: StressLevel;
  isTyping: boolean;
  activeNav: NavSection;
  setStressLevel: (level: StressLevel) => void;
  setActiveNav: (nav: NavSection) => void;
  startSimulation: () => void;
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

const MOCK_SESSION: Session = {
  id: "SIM-2025-0728-04",
  phase: "peak",
  elapsedTime: 4320,
  remainingTime: 2880,
  state: "running",
  startedAt: new Date(Date.now() - 4320 * 1000),
};

const MOCK_TASK: Task = {
  id: "t_09",
  title: "Quarterly Performance Analysis Report",
  type: "report",
  priority: "high",
  deadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
  progress: 62,
  estimatedDuration: 90,
};

const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: "m_01",
    role: "manager",
    content:
      "Good morning, Alex. Today's priority is the Q3 performance analysis. I expect a first draft by 14:00. Focus on the revenue variance section — there are discrepancies we need addressed.",
    timestamp: new Date(Date.now() - 3600 * 1000),
  },
  {
    id: "m_02",
    role: "user",
    content: "Understood. I've already pulled the data. I'll have the draft ready well before the deadline.",
    timestamp: new Date(Date.now() - 3540 * 1000),
  },
  {
    id: "m_03",
    role: "manager",
    content:
      "Good. Also note: the deadline for the stakeholder summary has been moved up. I need that by end of day, not tomorrow. Please adjust your schedule accordingly.",
    timestamp: new Date(Date.now() - 1800 * 1000),
  },
  {
    id: "m_04",
    role: "manager",
    content:
      "Current progress is at 62%. You are slightly behind the expected pace for this phase. Please increase output or flag any blockers immediately.",
    timestamp: new Date(Date.now() - 600 * 1000),
  },
];

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "n_01",
    type: "task_assigned",
    title: "New Task Assigned",
    description: "Stakeholder Executive Summary — due today at 17:30",
    timestamp: new Date(Date.now() - 1800 * 1000),
    read: false,
  },
  {
    id: "n_02",
    type: "deadline_reduced",
    title: "Deadline Reduced",
    description: "Q3 Performance Report moved from tomorrow to 14:00 today",
    timestamp: new Date(Date.now() - 3200 * 1000),
    read: false,
  },
  {
    id: "n_03",
    type: "pressure_increased",
    title: "Pressure Level Increased",
    description: "Session pressure elevated from Moderate to High",
    timestamp: new Date(Date.now() - 5400 * 1000),
    read: true,
  },
  {
    id: "n_04",
    type: "reminder",
    title: "Check-in Reminder",
    description: "AI Manager check-in scheduled in 15 minutes",
    timestamp: new Date(Date.now() - 7200 * 1000),
    read: true,
  },
];

const MOCK_METRICS: PerformanceMetrics = {
  productivity: 78,
  fatigue: 34,
  responseTime: 4.2,
  errorRate: 2.1,
};

const MOCK_TIMELINE: TimelineEvent[] = [
  {
    id: "tl_05",
    type: "manager_message",
    title: "Manager check-in",
    description: "Progress update requested — current pace flagged",
    timestamp: new Date(Date.now() - 600 * 1000),
  },
  {
    id: "tl_04",
    type: "stress_declared",
    title: "Stress declared",
    description: "Level set to Moderate by user",
    timestamp: new Date(Date.now() - 2400 * 1000),
  },
  {
    id: "tl_03",
    type: "task_assigned",
    title: "Task assigned",
    description: "Stakeholder Executive Summary added to queue",
    timestamp: new Date(Date.now() - 1800 * 1000),
  },
  {
    id: "tl_02",
    type: "task_completed",
    title: "Task completed",
    description: "Data extraction & normalization — 100%",
    timestamp: new Date(Date.now() - 3600 * 1000),
  },
  {
    id: "tl_01",
    type: "manager_message",
    title: "Session briefing",
    description: "AI Manager issued daily priorities and expectations",
    timestamp: new Date(Date.now() - 4320 * 1000),
  },
];

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(MOCK_SESSION);
  const [stressLevel, setStressLevelState] = useState<StressLevel>(3);
  const [activeNav, setActiveNav] = useState<NavSection>("dashboard");
  const [isTyping, setIsTyping] = useState(false);
  const [messages] = useState<ChatMessage[]>(MOCK_MESSAGES);
  const managerMode: ManagerMode = "demanding";
  const pressureScore = 67;

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

  const startSimulation = () => setSession((s) => ({ ...s, state: "running" }));
  const pauseSimulation = () => setSession((s) => ({ ...s, state: "paused" }));
  const resumeSimulation = () => setSession((s) => ({ ...s, state: "running" }));
  const finishSession = () => setSession((s) => ({ ...s, state: "finished" }));
  const completeTask = () => {};
  const setStressLevel = (level: StressLevel) => setStressLevelState(level);

  const value: AppContextValue = {
    user: MOCK_USER,
    session,
    currentTask: MOCK_TASK,
    messages,
    notifications: MOCK_NOTIFICATIONS,
    metrics: MOCK_METRICS,
    timeline: MOCK_TIMELINE,
    managerMode,
    pressureScore,
    stressLevel,
    isTyping,
    activeNav,
    setStressLevel,
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
