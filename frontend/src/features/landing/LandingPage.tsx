import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import SiteNav from "@/components/layout/SiteNav";

// Ported from the delivered "Premium Landing Page Design" (Figma Make
// export) as faithfully as possible. Routing-aware changes only: the
// design's own placeholder `href="#"` links for Sign in/Create account/the
// primary conversion CTAs now point at this app's real /login and
// /register routes; a couple of nav items that had no matching in-page
// anchor were pointed at the section id that already exists
// (#platform/#simulation). Everything else -- copy, layout, colors,
// animations, the demo-only contact form -- is unchanged from the
// delivered design. See the CONTACT section below for the one spot that's
// still a placeholder, flagged there rather than silently shipped as real.

// ─── Pulse waveform SVG path ───────────────────────────────────────────────
function PulseWaveform({
  color = "#587A92",
  opacity = 0.6,
  className = "",
}: {
  color?: string;
  opacity?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 260 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      preserveAspectRatio="none"
    >
      <path
        d="M0,16 L40,16 L50,4 L60,28 L70,2 L80,30 L90,10 L100,16 L140,16 L154,16 L164,6 L174,26 L184,2 L194,30 L204,12 L214,16 L260,16"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
      />
    </svg>
  );
}

// ─── Section reveal hook ──────────────────────────────────────────────────
function useSectionReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("revealed");
          obs.unobserve(el);
        }
      },
      { threshold: 0.08 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

function Section({ children, className = "", style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useSectionReveal();
  return (
    <div ref={ref} className={`section-reveal ${className}`} style={style}>
      {children}
    </div>
  );
}

function Label({ children }: { children: string }) {
  return (
    <span
      className="inline-block font-mono text-[10px] uppercase tracking-[0.18em] px-3 py-1 rounded-full mb-6"
      style={{ background: "#E8EEF3", color: "#587A92", border: "1px solid #D5DDE4" }}
    >
      {children}
    </span>
  );
}

export default function LandingPage() {
  const { isAuthenticated, user } = useApp();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", subject: "", message: "" });
  const [supervisorLevel, setSupervisorLevel] = useState(0);
  // "Start the simulation" CTA below: a logged-in user may already have an
  // unfinished session, so clicking it asks whether to start a fresh one
  // (-> /tasks, which creates/continues via CockpitPage's own ensureSession)
  // or go pick up a previous one from the history list (-> /simulation).
  // Logged out, there's no session to choose from -- goes straight to
  // /login, same as before.
  const [showStartChoice, setShowStartChoice] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const supervisorLevels = [
    { label: "SUPPORTIVE", color: "#719887", desc: "Your work is progressing well. Keep it up — you are on track." },
    { label: "NEUTRAL", color: "#587A92", desc: "Your pace is within the expected average for this task." },
    { label: "DEMANDING", color: "#B89A61", desc: "Your pace is slightly below average. 02:14 remaining to complete the task." },
    { label: "INTRUSIVE", color: "#8D4A4A", desc: "Performance is insufficient. A productivity analysis has been initiated on your session." },
  ];

  return (
    <div className="min-h-screen" style={{ background: "#F3F6F8", color: "#243746" }}>
      <SiteNav scrolled={scrolled} />

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-20 md:pt-40 md:pb-28 max-w-[1280px] mx-auto px-6 lg:px-10">
        <div className="grid md:grid-cols-2 gap-16 lg:gap-20 items-center">
          <div>
            {isAuthenticated && (
              <p className="text-[14px] font-medium mb-3" style={{ color: "#243746" }}>
                Welcome, <span style={{ color: "#587A92" }}>{user.name}</span>
              </p>
            )}
            <div className="flex items-center gap-3 mb-8">
              <div className="h-px w-8" style={{ background: "#587A92" }} />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "#587A92" }}>
                AI Work Stress &amp; Well-Being Simulator
              </span>
            </div>
            <h1
              className="font-serif text-[44px] md:text-[54px] lg:text-[64px] leading-[1.1] mb-6"
              style={{ color: "#243746", letterSpacing: "-0.02em" }}
            >
              AI is transforming work.
              <br />
              <em style={{ color: "#587A92" }}>But what happens to the human?</em>
            </h1>
            <p className="text-[16px] md:text-[17px] leading-[1.75] mb-10" style={{ color: "#718493", maxWidth: "480px" }}>
              WorkPulse AI lets you experience a professional simulation under algorithmic supervision — observe the impact of digital pressure and understand the realities of work in the age of artificial intelligence.
            </p>
            <div className="flex flex-wrap gap-4">
              <a
                href="#simulation"
                className="inline-flex items-center gap-2 px-6 py-3.5 text-[14px] font-medium rounded-sm transition-all duration-200"
                style={{ background: "#263F52", color: "#F3F6F8" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#314C60")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#263F52")}
              >
                Explore the simulation →
              </a>
              <a
                href="#platform"
                className="inline-flex items-center gap-2 px-6 py-3.5 text-[14px] font-medium rounded-sm border transition-all duration-200"
                style={{ border: "1px solid #D5DDE4", color: "#587A92", background: "transparent" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#E8EEF3"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                Learn about the platform
              </a>
            </div>
            <div className="mt-12 opacity-40">
              <PulseWaveform color="#587A92" opacity={1} className="h-8 w-full max-w-[320px]" />
            </div>
          </div>
          <div className="hidden md:flex items-center justify-center">
            <img src="/logo.svg" alt="WorkPulse AI" className="w-full h-auto" style={{ maxWidth: 520 }} />
          </div>
        </div>
      </section>

      {/* ── PROBLEM ──────────────────────────────────────────────────── */}
      <section id="platform" style={{ background: "#263F52" }} className="py-24 md:py-32">
        <Section className="max-w-[1280px] mx-auto px-6 lg:px-10">
          <div className="grid md:grid-cols-2 gap-16 lg:gap-24 items-start">
            <div>
              <Label>The Problem</Label>
              <h2
                className="font-serif text-[38px] md:text-[52px] leading-[1.1] mb-8"
                style={{ color: "#F3F6F8", letterSpacing: "-0.02em" }}
              >
                When AI becomes your manager
              </h2>
              <p className="text-[16px] leading-[1.8] mb-6" style={{ color: "#7E8DA3" }}>
                Artificial intelligence is progressively integrating into professional environments. It automates tasks, analyzes performance, and can even participate in managerial decisions.
              </p>
              <p className="text-[18px] leading-[1.7] font-medium" style={{ color: "#D5DDE4" }}>
                "But what happens when this technology becomes a permanent source of surveillance and pressure?"
              </p>
            </div>
            <div className="space-y-0">
              {[
                { label: "EMPLOYEE", sub: "Individual at work", color: "#587A92" },
                { label: "AI MONITORING", sub: "Algorithmic surveillance", color: "#8D88A8" },
                { label: "PERFORMANCE", sub: "Continuous measurement", color: "#7E8DA3" },
                { label: "PRESSURE", sub: "Increased cognitive load", color: "#B89A61" },
                { label: "BEHAVIOR", sub: "Observable impact", color: "#719887" },
              ].map((item, i) => (
                <div key={item.label} className="flex items-stretch gap-0">
                  <div className="flex flex-col items-center w-10 shrink-0">
                    <div className="w-px flex-1" style={{ background: i === 0 ? "transparent" : "#314C60" }} />
                    <div className="w-2 h-2 rounded-full shrink-0 my-1" style={{ background: item.color }} />
                    <div className="w-px flex-1" style={{ background: i === 4 ? "transparent" : "#314C60" }} />
                  </div>
                  <div
                    className="flex-1 flex items-center gap-4 py-4 px-5 ml-4 rounded-sm"
                    style={{ background: "rgba(255,255,255,0.04)", borderLeft: `2px solid ${item.color}30` }}
                  >
                    <div>
                      <div className="font-mono text-[11px] uppercase tracking-[0.15em] mb-0.5" style={{ color: item.color }}>{item.label}</div>
                      <div className="text-[13px]" style={{ color: "#7E8DA3" }}>{item.sub}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </section>

      {/* ── WHY WORKPULSE ────────────────────────────────────────────── */}
      <section className="py-24 md:py-32 max-w-[1280px] mx-auto px-6 lg:px-10">
        <Section>
          <div className="mb-16">
            <Label>The Approach</Label>
            <h2 className="font-serif text-[38px] md:text-[50px] leading-[1.1]" style={{ color: "#243746", letterSpacing: "-0.02em" }}>
              Why a simulation?
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-0 border-t" style={{ borderColor: "#D5DDE4" }}>
            {[
              {
                num: "01",
                title: "Experience",
                body: "Live a work situation under algorithmic supervision. Feel the pressure rather than simply reading about it.",
                icon: (
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="12" r="7" stroke="#587A92" strokeWidth="1.2" />
                    <path d="M9,22 Q16,28 23,22" stroke="#587A92" strokeWidth="1.2" fill="none" />
                    <circle cx="16" cy="12" r="2" fill="#587A92" opacity="0.5" />
                  </svg>
                ),
              },
              {
                num: "02",
                title: "Measure",
                body: "Observe the evolution of performance, pace, and workload as the simulation progresses in real time.",
                icon: (
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <path d="M4,24 L8,24 L10,16 L12,24 L14,10 L16,24 L18,18 L20,24 L28,24" stroke="#587A92" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                  </svg>
                ),
              },
              {
                num: "03",
                title: "Understand",
                body: "Identify the mechanisms of pressure and their effects on human experience. Build ethical, evidence-based recommendations.",
                icon: (
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="16" r="10" stroke="#587A92" strokeWidth="1.2" />
                    <line x1="16" y1="10" x2="16" y2="16" stroke="#587A92" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="16" y1="16" x2="21" y2="16" stroke="#587A92" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="16" cy="16" r="1.5" fill="#587A92" />
                  </svg>
                ),
              },
            ].map((item) => (
              <div
                key={item.num}
                className="pt-10 pb-10 pr-10 border-b md:border-b-0 md:border-r last:border-0 transition-all duration-300"
                style={{ borderColor: "#D5DDE4" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#ECEFF2")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
              >
                <div className="font-mono text-[11px] uppercase tracking-[0.2em] mb-6" style={{ color: "#7E8DA3" }}>{item.num}</div>
                <div className="mb-4">{item.icon}</div>
                <h3 className="font-serif text-[26px] mb-4" style={{ color: "#243746", letterSpacing: "-0.01em" }}>{item.title}</h3>
                <p className="text-[14px] leading-[1.75]" style={{ color: "#718493" }}>{item.body}</p>
              </div>
            ))}
          </div>
        </Section>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
      <section style={{ background: "#EDF1F5" }} className="py-24 md:py-32">
        <Section className="max-w-[1280px] mx-auto px-6 lg:px-10">
          <div className="mb-16">
            <Label>The Protocol</Label>
            <h2 className="font-serif text-[38px] md:text-[50px] leading-[1.1]" style={{ color: "#243746", letterSpacing: "-0.02em" }}>
              An experience in 4 steps
            </h2>
          </div>
          <div className="relative">
            <div className="hidden md:block absolute top-8 left-0 right-0" style={{ height: "32px", zIndex: 0 }}>
              <svg viewBox="0 0 1200 32" preserveAspectRatio="none" className="w-full h-full" fill="none">
                <path
                  d="M0,16 L200,16 L215,6 L228,26 L241,4 L254,28 L267,12 L280,16 L480,16 L495,6 L508,26 L521,4 L534,28 L547,12 L560,16 L760,16 L775,6 L788,26 L801,4 L814,28 L827,12 L840,16 L1200,16"
                  stroke="#587A92" strokeWidth="1.5" opacity="0.35"
                />
              </svg>
            </div>
            <div className="grid md:grid-cols-4 gap-8 relative z-10">
              {[
                { step: "01", verb: "Enter", body: "Start your simulation session. Set up your profile and enter the workplace environment." },
                { step: "02", verb: "Work", body: "Complete the tasks assigned by your AI supervisor within the allotted time." },
                { step: "03", verb: "Adapt", body: "The supervisor behavior evolves based on your performance, progressively introducing algorithmic pressure." },
                { step: "04", verb: "Analyze", body: "Receive your personalized report and the recommendations generated by the platform." },
              ].map((item) => (
                <div key={item.step} className="flex flex-col">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "#263F52", border: "2px solid #587A92" }}>
                      <span className="font-mono text-[9px]" style={{ color: "#587A92" }}>{item.step}</span>
                    </div>
                    <div className="h-px flex-1" style={{ background: "#D5DDE4" }} />
                  </div>
                  <h3 className="font-serif text-[22px] mb-3" style={{ color: "#243746", letterSpacing: "-0.01em" }}>{item.verb}</h3>
                  <p className="text-[14px] leading-[1.75]" style={{ color: "#718493" }}>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </section>

      {/* ── SIMULATION PREVIEW ───────────────────────────────────────── */}
      <section id="simulation" style={{ background: "#1C2E3C" }} className="py-24 md:py-32">
        <Section className="max-w-[1280px] mx-auto px-6 lg:px-10">
          <div className="mb-12">
            <Label>The Simulation</Label>
            <h2 className="font-serif text-[38px] md:text-[50px] leading-[1.1]" style={{ color: "#F3F6F8", letterSpacing: "-0.02em" }}>
              Enter your work environment
            </h2>
          </div>

          <div className="rounded-lg overflow-hidden" style={{ background: "#243746", border: "1px solid #314C60", boxShadow: "0 32px 80px rgba(0,0,0,0.4)" }}>
            <div className="flex items-center gap-2 px-5 py-3 border-b" style={{ borderColor: "#314C60", background: "#1C2E3C" }}>
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#8D4A4A" }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#B89A61" }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#719887" }} />
              <span className="ml-4 font-mono text-[11px]" style={{ color: "#7E8DA3" }}>WorkPulse AI — Active Session</span>
              <span className="ml-auto font-mono text-[11px]" style={{ color: "#719887" }}>● RECORDING</span>
            </div>

            <div className="grid md:grid-cols-3 gap-0">
              <div className="md:col-span-2 p-8 border-r" style={{ borderColor: "#314C60" }}>
                <div className="flex gap-4 p-5 rounded-sm mb-8" style={{ background: "#1C2E3C", borderLeft: "3px solid #B89A61" }}>
                  <div className="shrink-0">
                    <div className="w-8 h-8 rounded-sm flex items-center justify-center" style={{ background: "#314C60" }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <rect x="2" y="2" width="12" height="12" rx="2" stroke="#587A92" strokeWidth="1" />
                        <line x1="2" y1="8" x2="14" y2="8" stroke="#587A92" strokeWidth="0.8" />
                        <line x1="8" y1="2" x2="8" y2="14" stroke="#587A92" strokeWidth="0.8" />
                        <circle cx="8" cy="8" r="2" fill="#587A92" opacity="0.6" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] mb-2 uppercase tracking-widest" style={{ color: "#B89A61" }}>AI Supervisor — Performance Alert</div>
                    <p className="text-[14px] leading-[1.7]" style={{ color: "#D5DDE4" }}>
                      Your pace is slightly below average. There is{" "}
                      <span className="font-mono" style={{ color: "#B89A61" }}>02:14</span> remaining to complete this task. A report will be generated at the end of the session.
                    </p>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: "#7E8DA3" }}>Current Task — 3 of 7</span>
                    <span className="font-mono text-[13px]" style={{ color: "#B89A61" }}>02:14</span>
                  </div>
                  <div className="rounded-sm p-5" style={{ background: "#1C2E3C", border: "1px solid #314C60" }}>
                    <h4 className="text-[15px] font-medium mb-2" style={{ color: "#F3F6F8" }}>Write a client meeting summary</h4>
                    <p className="text-[13px] leading-[1.7]" style={{ color: "#7E8DA3" }}>
                      Summarize the key points from the Sept 8 meeting with Veradis Group. Target length: 200–250 words. Include decisions made and next steps agreed upon.
                    </p>
                  </div>
                  <div className="mt-3">
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: "#314C60" }}>
                      <div className="h-full rounded-full" style={{ width: "43%", background: "#587A92" }} />
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="font-mono text-[10px]" style={{ color: "#7E8DA3" }}>43% complete</span>
                      <span className="font-mono text-[10px]" style={{ color: "#7E8DA3" }}>~86 words</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-5">
                <div className="font-mono text-[10px] uppercase tracking-widest mb-4" style={{ color: "#7E8DA3" }}>Indicators</div>
                {[
                  { label: "Productivity", value: "72%", bar: 72, color: "#587A92" },
                  { label: "Workload", value: "HIGH", bar: 78, color: "#B89A61" },
                  { label: "Cognitive Load", value: "64", bar: 64, color: "#8D88A8" },
                  { label: "Error Rate", value: "2.1%", bar: 21, color: "#719887" },
                ].map((m) => (
                  <div key={m.label}>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-[12px]" style={{ color: "#7E8DA3" }}>{m.label}</span>
                      <span className="font-mono text-[12px]" style={{ color: m.color }}>{m.value}</span>
                    </div>
                    <div className="h-0.5 rounded-full overflow-hidden" style={{ background: "#314C60" }}>
                      <div className="h-full" style={{ width: `${m.bar}%`, background: m.color, opacity: 0.8 }} />
                    </div>
                  </div>
                ))}
                <div className="pt-4 border-t" style={{ borderColor: "#314C60" }}>
                  <div className="font-mono text-[10px] uppercase tracking-widest mb-3" style={{ color: "#7E8DA3" }}>AI Supervision</div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full animate-breathe" style={{ background: "#B89A61" }} />
                    <span className="text-[13px]" style={{ color: "#B89A61" }}>Demanding</span>
                  </div>
                </div>
                <div className="pt-4 border-t" style={{ borderColor: "#314C60" }}>
                  <PulseWaveform color="#587A92" opacity={0.5} className="h-6 w-full" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 text-center">
            {isAuthenticated ? (
              <button
                onClick={() => setShowStartChoice(true)}
                className="inline-flex items-center gap-2 px-8 py-4 text-[15px] font-medium rounded-sm transition-all duration-200"
                style={{ background: "#587A92", color: "#F3F6F8", border: "none", cursor: "pointer" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#4A6880")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#587A92")}
              >
                Start the simulation →
              </button>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-8 py-4 text-[15px] font-medium rounded-sm transition-all duration-200"
                style={{ background: "#587A92", color: "#F3F6F8" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#4A6880")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#587A92")}
              >
                Start the simulation →
              </Link>
            )}
          </div>
        </Section>
      </section>

      {showStartChoice && (
        <div
          className="fixed inset-0 flex items-center justify-center px-6"
          style={{ background: "rgba(28,46,60,0.55)", zIndex: 60 }}
          onClick={() => setShowStartChoice(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-7"
            style={{ background: "#fff" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold mb-1.5" style={{ color: "#243746" }}>
              Start a new simulation, or continue a previous one?
            </h2>
            <p className="text-[12.5px] leading-relaxed mb-6" style={{ color: "#718493" }}>
              You may already have an unfinished session. Choose how you'd like to proceed.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => navigate("/tasks")}
                className="w-full py-2.5 rounded-xl text-[12.5px] font-semibold transition-all"
                style={{ background: "#587A92", color: "#fff", border: "none", cursor: "pointer" }}
              >
                Start New Simulation →
              </button>
              <button
                onClick={() => navigate("/simulation")}
                className="w-full py-2.5 rounded-xl text-[12.5px] font-semibold transition-all"
                style={{ background: "#F3F6F8", color: "#587A92", border: "1px solid #D9E2E8", cursor: "pointer" }}
              >
                Continue Previous Session
              </button>
              <button
                onClick={() => setShowStartChoice(false)}
                className="w-full py-2 text-[12px] font-medium"
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI SUPERVISOR ────────────────────────────────────────────── */}
      <section className="py-24 md:py-32 max-w-[1280px] mx-auto px-6 lg:px-10">
        <Section>
          <div className="grid md:grid-cols-2 gap-16 items-start">
            <div>
              <Label>The Engine</Label>
              <h2 className="font-serif text-[38px] md:text-[48px] leading-[1.1] mb-6" style={{ color: "#243746", letterSpacing: "-0.02em" }}>
                An AI supervisor that adapts to your behavior
              </h2>
              <p className="text-[15px] leading-[1.8]" style={{ color: "#718493" }}>
                The algorithmic supervisor in WorkPulse AI is not static. It analyzes your actions in real time and adapts its communication style — progressively shifting from a supportive tone to increasing managerial pressure.
              </p>
            </div>
            <div className="space-y-3">
              {supervisorLevels.map((level, i) => (
                <button
                  key={level.label}
                  onClick={() => setSupervisorLevel(i)}
                  className="w-full text-left rounded-sm p-5 border transition-all duration-300"
                  style={{
                    background: supervisorLevel === i ? "#263F52" : "transparent",
                    border: `1px solid ${supervisorLevel === i ? level.color + "60" : "#D5DDE4"}`,
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: level.color }} />
                    <span className="font-mono text-[11px] uppercase tracking-[0.15em]" style={{ color: level.color }}>{level.label}</span>
                  </div>
                  {supervisorLevel === i && (
                    <p className="text-[13px] leading-[1.6] pl-5 border-l ml-1" style={{ color: "#D5DDE4", borderColor: level.color + "50" }}>
                      "{level.desc}"
                    </p>
                  )}
                </button>
              ))}
              <p className="text-[12px] pt-2" style={{ color: "#7E8DA3" }}>
                Click each level to preview the supervisor communication style.
              </p>
            </div>
          </div>
        </Section>
      </section>

      {/* ── WHAT IS MEASURED ─────────────────────────────────────────── */}
      <section style={{ background: "#EDF1F5" }} className="py-24 md:py-32">
        <Section className="max-w-[1280px] mx-auto px-6 lg:px-10">
          <div className="mb-16">
            <Label>The Observatory</Label>
            <h2 className="font-serif text-[38px] md:text-[50px] leading-[1.1]" style={{ color: "#243746", letterSpacing: "-0.02em" }}>
              What WorkPulse observes
            </h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { metric: "Execution Time", value: "18.4s", unit: "avg. per task", bar: 62, color: "#587A92", icon: "⏱" },
              { metric: "Error Rate", value: "2.1%", unit: "across 7 tasks", bar: 21, color: "#719887", icon: "△" },
              { metric: "Activity Pace", value: "↑ 12%", unit: "over time", bar: 72, color: "#8D88A8", icon: "~" },
              { metric: "Break Frequency", value: "0.3", unit: "breaks per hour", bar: 30, color: "#B89A61", icon: "○" },
              { metric: "Est. Cognitive Load", value: "64/100", unit: "average score", bar: 64, color: "#8D88A8", icon: "◈" },
              { metric: "Reported Stress", value: "Moderate", unit: "self-assessment", bar: 55, color: "#B89A61", icon: "♡" },
            ].map((item) => (
              <div
                key={item.metric}
                className="rounded-sm p-6 border transition-all duration-200"
                style={{ background: "#F3F6F8", border: "1px solid #D5DDE4" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = item.color + "60"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#D5DDE4"; }}
              >
                <div className="flex items-start justify-between mb-4">
                  <span className="font-mono text-[13px]" style={{ color: item.color }}>{item.icon}</span>
                  <span className="font-mono text-[22px] font-medium" style={{ color: "#243746" }}>{item.value}</span>
                </div>
                <div className="text-[13px] font-medium mb-1" style={{ color: "#243746" }}>{item.metric}</div>
                <div className="text-[12px] mb-4" style={{ color: "#7E8DA3" }}>{item.unit}</div>
                <div className="h-1 rounded-full overflow-hidden" style={{ background: "#D5DDE4" }}>
                  <div className="h-full rounded-full" style={{ width: `${item.bar}%`, background: item.color, opacity: 0.7 }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-16">
            <PulseWaveform color="#587A92" opacity={0.3} className="h-8 w-full" />
          </div>
        </Section>
      </section>

      {/* ── RESULTS / REPORT ─────────────────────────────────────────── */}
      <section className="py-24 md:py-32 max-w-[1280px] mx-auto px-6 lg:px-10">
        <Section>
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <Label>The Report</Label>
              <h2 className="font-serif text-[38px] md:text-[48px] leading-[1.1] mb-6" style={{ color: "#243746", letterSpacing: "-0.02em" }}>
                Turn experience into understanding
              </h2>
              <p className="text-[15px] leading-[1.8] mb-8" style={{ color: "#718493" }}>
                At the end of the simulation, WorkPulse AI transforms the collected data into clear analysis and tailored recommendations — for you, your team, or your organization.
              </p>
              {/* No public sample-report page exists yet -- left as a
                  same-page anchor rather than a fabricated route. */}
              <a
                href="#simulation"
                className="inline-flex items-center gap-2 text-[14px] font-medium border-b pb-0.5 transition-colors duration-200"
                style={{ color: "#587A92", borderColor: "#587A92" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#263F52"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#587A92"; }}
              >
                View a sample report →
              </a>
            </div>
            <div className="rounded-sm p-8" style={{ background: "#263F52", border: "1px solid #314C60" }}>
              <div className="flex items-center justify-between mb-8">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-widest mb-1" style={{ color: "#7E8DA3" }}>Session Report</div>
                  <div className="font-serif text-[20px]" style={{ color: "#F3F6F8" }}>Personalized Analysis</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[10px]" style={{ color: "#7E8DA3" }}>09.09.2026</div>
                  <div className="font-mono text-[10px]" style={{ color: "#587A92" }}>Session #4721</div>
                </div>
              </div>
              <div className="space-y-4 mb-8">
                {[
                  { label: "Overall Performance", score: 72, color: "#587A92" },
                  { label: "Reported Stress Level", score: 58, color: "#B89A61" },
                  { label: "Workload", score: 81, color: "#8D88A8" },
                  { label: "AI Supervision Intensity", score: 65, color: "#7E8DA3" },
                ].map((r) => (
                  <div key={r.label}>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-[13px]" style={{ color: "#D5DDE4" }}>{r.label}</span>
                      <span className="font-mono text-[13px]" style={{ color: r.color }}>{r.score}</span>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: "#314C60" }}>
                      <div className="h-full rounded-full" style={{ width: `${r.score}%`, background: r.color, opacity: 0.8 }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-sm p-4" style={{ background: "#1C2E3C", borderLeft: "3px solid #719887" }}>
                <div className="font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: "#719887" }}>Primary Recommendation</div>
                <p className="text-[13px] leading-[1.6]" style={{ color: "#7E8DA3" }}>
                  Reduce the frequency of automated alerts during writing tasks. Introduce focused work intervals free of AI interruption.
                </p>
              </div>
            </div>
          </div>
        </Section>
      </section>

      {/* ── ETHICAL AI ───────────────────────────────────────────────── */}
      <section style={{ background: "#263F52" }} className="py-24 md:py-32">
        <Section className="max-w-[1280px] mx-auto px-6 lg:px-10">
          <div className="max-w-[720px] mx-auto text-center mb-16">
            <Label>Our Commitment</Label>
            <h2 className="font-serif text-[38px] md:text-[54px] leading-[1.1] mb-6" style={{ color: "#F3F6F8", letterSpacing: "-0.02em" }}>
              AI at work must remain <em style={{ color: "#8D88A8" }}>human.</em>
            </h2>
            <p className="text-[16px] leading-[1.8]" style={{ color: "#7E8DA3" }}>
              WorkPulse AI does not seek to replace human judgment. The platform aims to understand how to design algorithmic supervision systems that are more transparent, accountable, and respectful of well-being.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-0 border-t border-b" style={{ borderColor: "#314C60" }}>
            {[
              {
                icon: (<svg width="36" height="36" viewBox="0 0 36 36" fill="none"><circle cx="18" cy="18" r="14" stroke="#8D88A8" strokeWidth="1" /><path d="M12,18 L16,22 L24,14" stroke="#8D88A8" strokeWidth="1.5" strokeLinecap="round" /></svg>),
                title: "Transparency",
                body: "Every algorithmic decision is documented and explained. Users understand why the AI supervisor responds in a particular way.",
                color: "#8D88A8",
              },
              {
                icon: (<svg width="36" height="36" viewBox="0 0 36 36" fill="none"><path d="M18,4 L18,32 M4,18 L32,18" stroke="#719887" strokeWidth="1" opacity="0.4" /><rect x="10" y="10" width="16" height="16" rx="2" stroke="#719887" strokeWidth="1.2" /><circle cx="18" cy="18" r="4" fill="#719887" opacity="0.4" /></svg>),
                title: "Accountability",
                body: "The platform produces concrete ethical data and recommendations to guide organizational decisions around AI-powered management.",
                color: "#719887",
              },
              {
                icon: (<svg width="36" height="36" viewBox="0 0 36 36" fill="none"><path d="M18,6 C10,6 4,12 4,18 C4,24 10,30 18,30 C26,30 32,24 32,18" stroke="#587A92" strokeWidth="1.2" fill="none" /><path d="M18,10 C13,10 9,14 9,18 C9,22 13,26 18,26" stroke="#587A92" strokeWidth="1" opacity="0.5" fill="none" /><circle cx="18" cy="18" r="3" fill="#587A92" opacity="0.7" /></svg>),
                title: "Human Well-Being",
                body: "Participant well-being is the absolute priority. Simulations have built-in ethical limits and psychological support options.",
                color: "#587A92",
              },
            ].map((p) => (
              <div key={p.title} className="py-12 px-8 border-b md:border-b-0 md:border-r last:border-0" style={{ borderColor: "#314C60" }}>
                <div className="mb-6">{p.icon}</div>
                <h3 className="font-serif text-[26px] mb-4" style={{ color: "#F3F6F8", letterSpacing: "-0.01em" }}>{p.title}</h3>
                <p className="text-[14px] leading-[1.75]" style={{ color: "#7E8DA3" }}>{p.body}</p>
              </div>
            ))}
          </div>
        </Section>
      </section>

      {/* ── RESEARCH POSITIONING ─────────────────────────────────────── */}
      <section className="py-24 md:py-32 max-w-[1280px] mx-auto px-6 lg:px-10">
        <Section>
          <div className="text-center mb-16">
            <Label>Who It Is For</Label>
            <h2 className="font-serif text-[38px] md:text-[54px] leading-[1.1] mb-4" style={{ color: "#243746", letterSpacing: "-0.02em" }}>
              A research laboratory for work
              <br />
              <em style={{ color: "#587A92" }}>in the age of AI.</em>
            </h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { audience: "Students", desc: "Understand the stakes of AI-driven work before entering the professional world.", icon: "◻" },
              { audience: "Researchers", desc: "Access anonymized behavioral datasets for your studies in occupational psychology.", icon: "◈" },
              { audience: "Organizations", desc: "Evaluate the impact of your digital supervision tools on employee well-being.", icon: "◇" },
              { audience: "HR Professionals", desc: "Develop a more informed and human-centered approach to performance and algorithmic management.", icon: "○" },
              { audience: "AI Ethics Specialists", desc: "Experiment with different levels of algorithmic supervision and observe the effects on human behavior.", icon: "△" },
              { audience: "Leadership Teams", desc: "Train your teams to recognize and mitigate the effects of algorithmic pressure in the workplace.", icon: "□" },
            ].map((item) => (
              <div
                key={item.audience}
                className="p-6 rounded-sm border transition-all duration-200"
                style={{ border: "1px solid #D5DDE4", background: "#FAFBFC" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#587A92"; (e.currentTarget as HTMLElement).style.background = "#F0F4F7"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#D5DDE4"; (e.currentTarget as HTMLElement).style.background = "#FAFBFC"; }}
              >
                <div className="font-mono text-[16px] mb-4" style={{ color: "#587A92" }}>{item.icon}</div>
                <h3 className="font-medium text-[15px] mb-2" style={{ color: "#243746" }}>{item.audience}</h3>
                <p className="text-[13px] leading-[1.7]" style={{ color: "#718493" }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </Section>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────── */}
      <section style={{ background: "#1C2E3C" }} className="py-28 md:py-40">
        <Section className="max-w-[900px] mx-auto px-6 text-center">
          <div className="mb-6">
            <PulseWaveform color="#587A92" opacity={0.4} className="h-8 w-64 mx-auto" />
          </div>
          <h2 className="font-serif text-[40px] md:text-[58px] lg:text-[66px] leading-[1.1] mb-6" style={{ color: "#F3F6F8", letterSpacing: "-0.02em" }}>
            What if you could feel what it is like to work under AI supervision?
          </h2>
          <p className="text-[16px] md:text-[17px] leading-[1.8] mb-10" style={{ color: "#7E8DA3", maxWidth: "560px", margin: "0 auto 40px" }}>
            Discover what your performance, your behavior, and your perception reveal when artificial intelligence becomes your manager.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-8 py-4 text-[15px] font-medium rounded-sm transition-all duration-200"
              style={{ background: "#587A92", color: "#F3F6F8" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#4A6880")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#587A92")}
            >
              Begin the experience →
            </Link>
            <a
              href="#platform"
              className="inline-flex items-center gap-2 px-8 py-4 text-[15px] font-medium rounded-sm border transition-all duration-200"
              style={{ border: "1px solid #314C60", color: "#7E8DA3" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#587A92"; (e.currentTarget as HTMLElement).style.color = "#F3F6F8"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#314C60"; (e.currentTarget as HTMLElement).style.color = "#7E8DA3"; }}
            >
              Learn more
            </a>
          </div>
        </Section>
      </section>

      {/* ── CONTACT ──────────────────────────────────────────────────── */}
      <section className="py-24 md:py-32 max-w-[1280px] mx-auto px-6 lg:px-10">
        <Section>
          <div className="grid md:grid-cols-2 gap-16 lg:gap-24">
            <div>
              <Label>Contact</Label>
              <h2 className="font-serif text-[36px] md:text-[46px] leading-[1.1] mb-6" style={{ color: "#243746", letterSpacing: "-0.02em" }}>
                A question about WorkPulse AI?
              </h2>
              <p className="text-[15px] leading-[1.8] mb-10" style={{ color: "#718493" }}>
                We are available for researchers, organizations, and anyone interested in exploring the implications of algorithmic supervision in the workplace.
              </p>
              <div className="space-y-4">
                {[
                  { label: "Email", value: "contact@workpulse.ai", icon: "✉" },
                  { label: "LinkedIn", value: "linkedin.com/company/workpulse-ai", icon: "in" },
                  { label: "GitHub", value: "github.com/workpulse-ai", icon: "</>" },
                ].map((link) => (
                  <div key={link.label} className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-sm flex items-center justify-center shrink-0" style={{ background: "#E8EEF3", border: "1px solid #D5DDE4" }}>
                      <span className="font-mono text-[10px]" style={{ color: "#587A92" }}>{link.icon}</span>
                    </div>
                    <div>
                      <div className="text-[11px] font-mono uppercase tracking-widest mb-0.5" style={{ color: "#7E8DA3" }}>{link.label}</div>
                      <div className="text-[13px]" style={{ color: "#587A92" }}>{link.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Demo-only: no contact-form backend exists in this project.
                Submitting just shows a confirmation alert, exactly as
                delivered in the design -- not wired to a real endpoint.
                Flagging here rather than letting it quietly look real. */}
            <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); alert("Message sent."); }}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: "#7E8DA3" }}>Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-sm text-[14px] outline-none transition-all duration-200"
                    style={{ background: "#EDF1F5", border: "1px solid #D5DDE4", color: "#243746" }}
                    onFocus={(e) => ((e.target as HTMLElement).style.borderColor = "#587A92")}
                    onBlur={(e) => ((e.target as HTMLElement).style.borderColor = "#D5DDE4")}
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: "#7E8DA3" }}>Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-sm text-[14px] outline-none transition-all duration-200"
                    style={{ background: "#EDF1F5", border: "1px solid #D5DDE4", color: "#243746" }}
                    onFocus={(e) => ((e.target as HTMLElement).style.borderColor = "#587A92")}
                    onBlur={(e) => ((e.target as HTMLElement).style.borderColor = "#D5DDE4")}
                    placeholder="your@email.com"
                  />
                </div>
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: "#7E8DA3" }}>Subject</label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full px-4 py-3 rounded-sm text-[14px] outline-none transition-all duration-200"
                  style={{ background: "#EDF1F5", border: "1px solid #D5DDE4", color: "#243746" }}
                  onFocus={(e) => ((e.target as HTMLElement).style.borderColor = "#587A92")}
                  onBlur={(e) => ((e.target as HTMLElement).style.borderColor = "#D5DDE4")}
                  placeholder="What is your inquiry about?"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-widest mb-2" style={{ color: "#7E8DA3" }}>Message</label>
                <textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  rows={5}
                  className="w-full px-4 py-3 rounded-sm text-[14px] outline-none transition-all duration-200 resize-none"
                  style={{ background: "#EDF1F5", border: "1px solid #D5DDE4", color: "#243746" }}
                  onFocus={(e) => ((e.target as HTMLElement).style.borderColor = "#587A92")}
                  onBlur={(e) => ((e.target as HTMLElement).style.borderColor = "#D5DDE4")}
                  placeholder="Your message..."
                />
              </div>
              <button
                type="submit"
                className="w-full py-3.5 text-[14px] font-medium rounded-sm transition-all duration-200"
                style={{ background: "#263F52", color: "#F3F6F8" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#314C60")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#263F52")}
              >
                Send message →
              </button>
            </form>
          </div>
        </Section>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────── */}
      <footer style={{ background: "#1C2E3C", borderTop: "1px solid #263F52" }}>
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-16">
          <div className="grid md:grid-cols-4 gap-12 mb-16">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
                  <circle cx="14" cy="14" r="13" stroke="#587A92" strokeWidth="1.5" />
                  <path d="M4,14 L9,14 L11,9 L13,19 L15,7 L17,20 L19,11 L21,14 L24,14" stroke="#587A92" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
                <span className="font-serif text-[15px]" style={{ color: "#F3F6F8" }}>WorkPulse <span style={{ color: "#587A92" }}>AI</span></span>
              </div>
              <p className="text-[13px] leading-[1.7]" style={{ color: "#7E8DA3" }}>
                Understanding the impact of AI on human work.
              </p>
            </div>

            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] mb-5" style={{ color: "#587A92" }}>Platform</div>
              <ul className="space-y-3">
                {["Home", "Simulation", "Analysis", "Ethics"].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-[13px] transition-colors duration-200" style={{ color: "#7E8DA3" }}
                      onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#D5DDE4")}
                      onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "#7E8DA3")}
                    >{item}</a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] mb-5" style={{ color: "#587A92" }}>Resources</div>
              <ul className="space-y-3">
                {["About", "Documentation", "FAQ"].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-[13px] transition-colors duration-200" style={{ color: "#7E8DA3" }}
                      onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#D5DDE4")}
                      onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "#7E8DA3")}
                    >{item}</a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] mb-5" style={{ color: "#587A92" }}>Contact</div>
              <ul className="space-y-3">
                {["Contact", "Email", "LinkedIn", "GitHub"].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-[13px] transition-colors duration-200" style={{ color: "#7E8DA3" }}
                      onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#D5DDE4")}
                      onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "#7E8DA3")}
                    >{item}</a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t" style={{ borderColor: "#263F52" }}>
            <div className="flex items-center gap-4">
              <span className="text-[12px]" style={{ color: "#7E8DA3" }}>© 2026 WorkPulse AI</span>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded" style={{ background: "#263F52", color: "#587A92" }}>
                AI Work Stress &amp; Well-Being Simulator
              </span>
            </div>
            <div className="flex gap-6">
              {["Privacy Policy", "Terms of Use"].map((item) => (
                <a key={item} href="#" className="text-[12px]" style={{ color: "#7E8DA3" }}>{item}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
