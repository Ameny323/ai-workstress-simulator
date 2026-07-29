import type { ReactNode } from "react";
import type { NavSection } from "../../types";
import { useApp } from "../../contexts/AppContext";

interface NavItem {
  id: NavSection | "logout";
  label: string;
  icon: ReactNode;
}

function LayoutGridIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function PlayCircleIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="9" />
      <polygon fill="currentColor" stroke="none" points="10,8 17,12 10,16" />
    </svg>
  );
}

function CheckSquareIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <path d="M12 11V7" />
      <circle cx="12" cy="5" r="2" />
      <circle cx="8" cy="16" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BarChartIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function FileTextIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

const PRIMARY_NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutGridIcon /> },
  { id: "simulation", label: "Simulation", icon: <PlayCircleIcon /> },
  { id: "tasks", label: "Tasks", icon: <CheckSquareIcon /> },
  { id: "manager", label: "AI Manager", icon: <BotIcon /> },
  { id: "analytics", label: "Analytics", icon: <BarChartIcon /> },
  { id: "reports", label: "Reports", icon: <FileTextIcon /> },
];

const BOTTOM_NAV: NavItem[] = [
  { id: "settings", label: "Settings", icon: <SettingsIcon /> },
  { id: "logout", label: "Logout", icon: <LogOutIcon /> },
];

export default function Sidebar() {
  const { activeNav, setActiveNav } = useApp();

  return (
    <aside
      style={{
        width: 232,
        minWidth: 232,
        backgroundColor: "#27435D",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
        padding: "0 12px",
        zIndex: 40,
      }}
    >
      {/* Logo */}
      <div style={{ padding: "24px 8px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: "linear-gradient(135deg, #5B84C6, #8D74FF)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>
              WorkPulse
            </div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              AI Platform
            </div>
          </div>
        </div>
      </div>

      {/* Primary nav */}
      <nav style={{ flex: 1, paddingTop: 16, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", padding: "0 12px 8px" }}>
          Workspace
        </div>
        {PRIMARY_NAV.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeNav === item.id ? "active" : ""}`}
            onClick={() => setActiveNav(item.id as NavSection)}
            style={{ background: "none", border: "none", width: "100%", textAlign: "left" }}
          >
            <span style={{ opacity: activeNav === item.id ? 1 : 0.6 }}>{item.icon}</span>
            <span>{item.label}</span>
            {item.id === "simulation" && (
              <span
                style={{
                  marginLeft: "auto",
                  background: "#5B84C6",
                  color: "white",
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 99,
                  letterSpacing: "0.04em",
                }}
              >
                LIVE
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Bottom nav */}
      <div style={{ paddingBottom: 16, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 2 }}>
        {BOTTOM_NAV.map((item) => (
          <button
            key={item.id}
            className="nav-item"
            style={{ background: "none", border: "none", width: "100%", textAlign: "left" }}
          >
            <span style={{ opacity: 0.6 }}>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
