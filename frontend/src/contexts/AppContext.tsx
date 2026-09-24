import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest, getToken } from "../api/client";
import { getMe } from "../features/auth/authApi";
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
  isAuthenticated: boolean;
  authChecked: boolean;
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
  ensureSession: () => Promise<string | null>;
  resumeSession: (session: { id: string; started_at: string; current_phase: string; status: string }) => void;
  abandonSession: () => Promise<void>;
  pauseSimulation: () => void;
  resumeSimulation: () => void;
  finishSession: () => Promise<void>;
  completeTask: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

// Placeholder shown only before a real user is loaded (or when logged
// out) -- pages gate its visibility on `isAuthenticated`, so this never
// renders as if it were a real logged-in identity.
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
  const navigate = useNavigate();
  const [user, setUser] = useState<User>(MOCK_USER);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // False until the initial GET /auth/me (or the decision to skip it,
  // when there's no token at all) has resolved -- lets route guards
  // distinguish "confirmed logged out" from "haven't checked yet," so a
  // logged-in user refreshing a protected page isn't bounced to /login
  // during the brief async window before isAuthenticated flips true.
  const [authChecked, setAuthChecked] = useState(false);
  const [session, setSession] = useState<Session>(EMPTY_SESSION);
  // Bug fix: ensureSession/abandonSession/finishSession below must see the
  // LATEST session, not whatever it was when a caller's own reference to
  // one of these functions happened to be created. CockpitPage's
  // loadCurrentTask (and other consumers) deliberately memoize with an
  // empty useCallback dependency array so the mount effect runs exactly
  // once -- but that also freezes whichever `ensureSession` instance was
  // captured at that moment, permanently closing over `session` as it was
  // on CockpitPage's very first render (EMPTY_SESSION). Every subsequent
  // call through that frozen reference therefore always saw session.id =
  // "" and created a brand-new session instead of reusing the real one --
  // silently discarding all sequence progress on every "Continue to Next
  // Task" click. A ref is mutable and always reflects the latest value at
  // CALL time regardless of which stale function reference invokes it,
  // so reading through sessionRef.current (instead of the `session`
  // closure variable directly) fixes every current and future caller at
  // the source, without requiring every consumer's dependency array to be
  // correct.
  const sessionRef = useRef(session);
  sessionRef.current = session;
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

  // Real: fetches the actual logged-in user via GET /auth/me. Runs once on
  // mount if a token already exists (so a page refresh after login doesn't
  // fall back to looking logged-out), and again right after login inside
  // startSimulation below.
  const refreshUser = async () => {
    try {
      const me = await getMe();
      setUser({ id: me.id, name: me.full_name, email: me.email, role: "", createdAt: me.created_at });
      setIsAuthenticated(true);
    } catch (error) {
      console.error("Could not load the current user", error);
      setIsAuthenticated(false);
    } finally {
      setAuthChecked(true);
    }
  };

  useEffect(() => {
    if (getToken()) {
      void refreshUser();
    } else {
      // Nothing to check -- already a confirmed "logged out."
      setAuthChecked(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real, minimal session lifecycle for pages that just need a session id
  // to fetch/submit real tasks against -- unlike startSimulation below,
  // this doesn't seed a fake dashboard task or any of AppContext's mock
  // messages/metrics/timeline state, and it doesn't navigate anywhere.
  // Reuses an already-running session instead of creating a new one every
  // time a page mounts. Returns null (rather than throwing) on failure so
  // callers can show their own inline error state.
  const ensureSession = async (): Promise<string | null> => {
    if (sessionRef.current.id && sessionRef.current.state !== "idle") return sessionRef.current.id;
    try {
      const createdSession = await apiRequest<{
        id: string;
        started_at: string;
        current_phase: string;
        status: string;
      }>("/sessions/", { method: "POST" });
      setSession({
        id: createdSession.id,
        phase: toFrontendPhase(createdSession.current_phase),
        elapsedTime: 0,
        remainingTime: 60 * 60 * 3,
        state: toFrontendState(createdSession.status),
        startedAt: new Date(createdSession.started_at),
      });
      return createdSession.id;
    } catch (error) {
      console.error("Could not start a session", error);
      return null;
    }
  };

  // Real: lets the simulation-history page hand back an in-progress
  // session it already fetched (GET /sessions/) without re-POSTing a new
  // one. Sets local session state directly from that data, then navigates
  // to /tasks -- once there, CockpitPage's loadCurrentTask calls
  // ensureSession(), which (via sessionRef, see above) sees this id/state
  // already set and reuses it instead of creating a new session, so
  // GET /sessions/{id}/next-task resumes exactly where task_sequence_
  // position left off.
  const resumeSession = (target: { id: string; started_at: string; current_phase: string; status: string }) => {
    setSession({
      id: target.id,
      phase: toFrontendPhase(target.current_phase),
      elapsedTime: 0,
      remainingTime: 60 * 60 * 3,
      state: toFrontendState(target.status),
      startedAt: new Date(target.started_at),
    });
    navigate("/tasks");
  };

  // Real: calls POST /sessions/{id}/abandon (marks status -> abandoned,
  // doesn't delete anything) and resets local session state back to idle.
  // Used when the user explicitly chooses not to keep an in-progress
  // session for later -- e.g. the cockpit's "leave without finishing"
  // exit prompt's "Delete" option. A no-op if there's no running session.
  const abandonSession = async () => {
    if (!sessionRef.current.id || sessionRef.current.state === "idle") return;
    try {
      await apiRequest(`/sessions/${sessionRef.current.id}/abandon`, { method: "POST" });
    } catch (error) {
      console.error("Could not abandon the session", error);
    } finally {
      setSession(EMPTY_SESSION);
    }
  };

  const startSimulation = async () => {
    await refreshUser();
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
          type: "data_validation",
          title: "Initial planning review",
          description: "Prepare the first response for the current workload.",
          deadline: taskDeadline.toISOString(),
          priority: "medium",
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
      navigate("/tasks");
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
  const finishSession = async () => {
    // No real backend session to end (e.g. startSimulation fell back to a
    // local mock session because the API was unreachable) -- just flip
    // local state, there's nowhere real to navigate to.
    if (!sessionRef.current.id) {
      setSession((s) => ({ ...s, state: "finished" }));
      return;
    }
    const realSessionId = sessionRef.current.id;
    try {
      const ended = await apiRequest<{
        id: string;
        current_phase: string;
        status: string;
      }>(`/sessions/${realSessionId}/end`, { method: "POST" });
      setSession((s) => ({
        ...s,
        phase: toFrontendPhase(ended.current_phase),
        state: toFrontendState(ended.status),
      }));
    } catch (error) {
      // Already ended (409) or unreachable -- either way the user is
      // trying to leave the session. A 409 specifically means the report
      // genuinely exists (something already ended it), so still navigate
      // below rather than stranding them on the dashboard.
      console.error("Could not end session on the backend", error);
      setSession((s) => ({ ...s, state: "finished" }));
    }
    navigate(`/sessions/${realSessionId}/report`);
  };
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
    user,
    isAuthenticated,
    authChecked,
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
    ensureSession,
    resumeSession,
    abandonSession,
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
