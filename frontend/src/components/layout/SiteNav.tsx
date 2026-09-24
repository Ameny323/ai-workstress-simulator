import { useState } from "react";
import { Link } from "react-router-dom";
import { Settings } from "lucide-react";
import { useApp } from "@/contexts/AppContext";

// Shared top nav for the "site-facing" pages (currently the landing page
// and the settings page) -- distinct from the internal app's own
// Navbar.tsx, which serves the sidebar-navigated dashboard/tasks/report
// pages. Extracted from LandingPage.tsx so both pages render the exact
// same header instead of two copies that can drift apart (which had
// already happened once: the mobile menu's settings icon was still the
// old bordered/filled button, three edits behind the desktop one).
//
// "Home" has no matching in-page section anywhere, so it resolves to "/"
// (better than a dead "#" now that this nav renders on more than one
// route) rather than inventing a destination that doesn't exist.
//
// "Analysis"/"Ethics" were removed (user request): they never had a real
// destination either and just duplicated Home's "/" target.
//
// Platform/Simulation are logged-in-only (user request): logged out, a
// visitor only sees "Home" -- Platform was just a marketing section
// anchor (/#platform) and, pre-login, Simulation would only be able to
// point at the landing page's own marketing showcase anchor too (there's
// no session history to show yet), so neither is useful before signing
// in. Logged in, Simulation becomes a real, meaningful link: the user's
// own simulation history/resume page (/simulation,
// SimulationHistoryPage.tsx).
function buildNavLinks(isAuthenticated: boolean): Record<string, string> {
  if (!isAuthenticated) {
    return { Home: "/" };
  }
  return {
    Home: "/",
    Platform: "/#platform",
    Simulation: "/simulation",
  };
}

function SessionAndSettings({ mobile = false }: { mobile?: boolean }) {
  const { isAuthenticated, user, session } = useApp();

  // Same session-state -> label/color mapping Navbar.tsx already uses
  // elsewhere in the app, so "session active" reads consistently.
  const sessionColor = session.state === "running" ? "#22c55e" : session.state === "paused" ? "#f59e0b" : "#94a3b8";
  const sessionLabel = session.state === "running" ? "Session Active" : session.state === "paused" ? "Paused" : "Idle";

  if (!isAuthenticated) {
    return (
      <>
        <Link to="/login" className={mobile ? "text-[13px]" : "text-[13px] font-medium"} style={{ color: "#718493" }}>
          Sign in
        </Link>
        <Link
          to="/register"
          className={`text-[13px] font-medium px-4 py-2 rounded-sm transition-all duration-200${mobile ? " text-center" : ""}`}
          style={{ background: "#263F52", color: "#F3F6F8" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#314C60")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#263F52")}
        >
          Create account →
        </Link>
      </>
    );
  }

  return (
    <div className={`flex items-center ${mobile ? "gap-2.5" : "gap-1.5"}`}>
      <span
        style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: sessionColor, display: "inline-block", flexShrink: 0 }}
      />
      <span className="text-[12px] font-medium" style={{ color: "#718493" }}>{sessionLabel}</span>
      <Link
        to="/settings"
        title={user.name}
        aria-label={`Account settings for ${user.name}`}
        className="rounded-sm transition-all duration-200"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          border: "none",
          background: "transparent",
          color: "#587A92",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#E8EEF3"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <Settings size={17} strokeWidth={1.8} />
      </Link>
    </div>
  );
}

export default function SiteNav({ scrolled }: { scrolled: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { isAuthenticated } = useApp();
  const navLinks = buildNavLinks(isAuthenticated);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-500"
      style={{
        background: scrolled ? "rgba(243,246,248,0.88)" : "rgba(243,246,248,0.97)",
        backdropFilter: scrolled ? "blur(16px)" : "none",
        borderBottom: scrolled ? "1px solid #D5DDE4" : "1px solid transparent",
      }}
    >
      <div className="px-6 lg:px-10 flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2.5 shrink-0 ml-6 lg:ml-12">
          <img src="/logo.svg" alt="" width={44} height={44} style={{ borderRadius: 8, objectFit: "cover" }} />
          <span className="font-serif text-[15px]" style={{ color: "#243746", letterSpacing: "-0.01em" }}>
            WorkPulse <span style={{ color: "#587A92" }}>AI</span>
          </span>
        </Link>

        {/* Logo stays pinned to this container's left edge and the auth
            cluster to its right edge (justify-between, content touches
            both edges directly -- no flanking blank space introduced).
            The middle gap justify-between creates shrinks because the
            container itself is narrower (1040px, down from 1280px), not
            because content was pulled inward into empty space. */}
        <div className="hidden md:flex items-center gap-8 lg:gap-10">
          <div className="flex items-center gap-8">
            {Object.entries(navLinks).map(([item, href]) => (
              <Link
                key={item}
                to={href}
                className="text-[13px] font-medium transition-colors duration-200"
                style={{ color: "#718493" }}
                onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#243746")}
                onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "#718493")}
              >
                {item}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <SessionAndSettings />
          </div>
        </div>

        <button className="md:hidden flex flex-col gap-1.5 p-2" onClick={() => setMenuOpen(!menuOpen)}>
          <span className="w-5 h-px bg-wp-text block" />
          <span className="w-5 h-px bg-wp-text block" />
          <span className="w-3 h-px bg-wp-text block" />
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-wp-border px-6 py-4 space-y-3" style={{ background: "#F3F6F8" }}>
          {Object.entries(navLinks).map(([item, href]) => (
            <Link key={item} to={href} className="block text-[14px]" style={{ color: "#718493" }}>{item}</Link>
          ))}
          <div className="pt-2 flex flex-col gap-2">
            <SessionAndSettings mobile />
          </div>
        </div>
      )}
    </nav>
  );
}
