import { useState, useCallback, useEffect } from "react";
import { apiRequest, clearToken } from "@/api/client";
import { useApp } from "@/contexts/AppContext";
import SiteNav from "@/components/layout/SiteNav";
import type { User } from "@/types";

// Ported from the delivered "User Profile & Settings Design" (Figma Make
// export) as faithfully as possible -- unlike the landing page, this file
// needed no tailwind.config.ts/globals.css changes at all, since it only
// uses arbitrary-value Tailwind classes (border-[#DDE4EA] etc.) and no
// custom keyframes.
//
// REAL vs DELIVERED-MOCK, stated plainly rather than left ambiguous:
//   REAL: the user's name/email/avatar initials/member-since date (from
//   the same GET /auth/me AppContext already fetches for the landing
//   page), the total session count (GET /sessions/, already existing,
//   just counted), and both "Log out" buttons (the same
//   clearToken()+redirect Sidebar.tsx already uses).
//   STILL MOCK (exactly as delivered, not touched): every preference
//   toggle, the AI supervisor style picker, notification settings, 2FA,
//   password-change modal, data export/deletion buttons, and the entire
//   session history list (SESSIONS below) -- none of these have a
//   backing table/endpoint in this project yet. They're fully
//   interactive (toggles flip, the dirty/save bar works) but nothing
//   persists past a page refresh. Flagging this once here rather than
//   scattering a disclaimer through nine sections.
//
// Internal Section ids/state keys below (e.g. "profil", "donnees",
// nouvelleSimu) are never displayed to the user -- only the label/desc
// strings rendered in JSX are, and those are all in English.

type Section =
  | "profil"
  | "preferences"
  | "simulation-prefs"
  | "notifications"
  | "donnees"
  | "confidentialite"
  | "historique"
  | "securite"
  | "compte";

const NAV_GROUPS = [
  {
    label: "MY PROFILE",
    items: [
      { id: "profil" as Section, label: "Profile" },
      { id: "preferences" as Section, label: "Preferences" },
    ],
  },
  {
    label: "SIMULATION",
    items: [
      { id: "simulation-prefs" as Section, label: "Simulation preferences" },
      { id: "notifications" as Section, label: "Notifications" },
    ],
  },
  {
    label: "DATA & PRIVACY",
    items: [
      { id: "donnees" as Section, label: "Personal data" },
      { id: "confidentialite" as Section, label: "Privacy" },
      { id: "historique" as Section, label: "Session history" },
    ],
  },
  {
    label: "ACCOUNT",
    items: [
      { id: "securite" as Section, label: "Security" },
      { id: "compte" as Section, label: "Account" },
    ],
  },
];

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase();
}

function logout() {
  clearToken();
  window.location.href = "/login";
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none"
      style={{ backgroundColor: on ? "#587A92" : "#CBD5DC" }}
    >
      <span
        className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200"
        style={{ transform: on ? "translateX(18px)" : "translateX(2px)" }}
      />
    </button>
  );
}

function FieldRow({
  label,
  value,
  editable = true,
}: {
  label: string;
  value: string;
  editable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  useEffect(() => setVal(value), [value]);
  return (
    <div className="flex items-start justify-between py-4 border-b border-[#DDE4EA] last:border-0 group">
      <div className="flex-1">
        <div className="text-xs font-medium text-[#718493] uppercase tracking-wide mb-0.5">
          {label}
        </div>
        {editing ? (
          <input
            autoFocus
            className="text-sm text-[#243746] border-b border-[#587A92] outline-none bg-transparent w-full pb-0.5"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => setEditing(false)}
          />
        ) : (
          <div className="text-sm text-[#243746] font-medium">{val}</div>
        )}
      </div>
      {editable && !editing && (
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-[#587A92] font-medium hover:text-[#263F52] transition-colors ml-4 opacity-0 group-hover:opacity-100"
        >
          Edit
        </button>
      )}
    </div>
  );
}

function PulseWaveform() {
  const points = Array.from({ length: 80 }, (_, i) => {
    const x = (i / 79) * 100;
    let y = 50;
    if (i > 20 && i < 30) y = 50 - Math.sin(((i - 20) / 10) * Math.PI) * 18;
    else if (i > 30 && i < 35) y = 50 + Math.sin(((i - 30) / 5) * Math.PI) * 8;
    else if (i > 50 && i < 60) y = 50 - Math.sin(((i - 50) / 10) * Math.PI) * 14;
    else if (i > 60 && i < 65) y = 50 + Math.sin(((i - 60) / 5) * Math.PI) * 6;
    return `${x},${y}`;
  });
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full"
      style={{ opacity: 0.07 }}
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="#587A92"
        strokeWidth="0.8"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function formatMemberSince(iso?: string): string {
  if (!iso) return "Recently";
  const d = new Date(iso);
  return `Member since ${d.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
}

function SectionProfil({ user, onDirty }: { user: User; onDirty: () => void }) {
  const [avatar, setAvatar] = useState<string | null>(null);
  void onDirty;
  void setAvatar;
  return (
    <div>
      {/* Profile header */}
      <div className="relative overflow-hidden rounded-xl bg-[#EDF1F5] mb-8 px-8 py-7">
        <PulseWaveform />
        <div className="relative flex items-center gap-6">
          <div className="relative group cursor-pointer">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold text-white select-none"
              style={{ backgroundColor: "#314C60" }}
            >
              {avatar ? (
                <img src={avatar} alt="Avatar" className="w-full h-full rounded-full object-cover" />
              ) : (
                getInitials(user.name)
              )}
            </div>
            <div className="absolute inset-0 rounded-full bg-[#263F52]/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-[10px] font-medium">Edit</span>
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-[#243746]">{user.name}</h2>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#3D7A5A] bg-[#D4EDE0] px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3D7A5A] inline-block" />
                Active profile
              </span>
            </div>
            {user.role && <div className="text-sm text-[#718493] mt-0.5">{user.role}</div>}
            <div className="text-xs text-[#7E8DA3] mt-1">{formatMemberSince(user.createdAt)}</div>
          </div>
        </div>
      </div>

      {/* Personal information */}
      <div className="mb-10">
        <h3 className="text-base font-semibold text-[#243746] mb-1">Personal information</h3>
        <p className="text-xs text-[#718493] mb-4">This information is used to personalize your experience on the platform.</p>
        <FieldRow label="Full name" value={user.name} />
        <FieldRow label="Email address" value={user.email} />
        <FieldRow label="Job title" value={user.role || "—"} />
        <FieldRow label="Organization" value="WorkPulse Research" />
      </div>

      {/* Simulation profile */}
      <div>
        <h3 className="text-base font-semibold text-[#243746] mb-1">Your simulation profile</h3>
        <p className="text-xs text-[#718493] mb-4">Summary of your current configuration on the platform.</p>
        {/* Experience level/simulation type have no backend concept yet --
            left as the delivered placeholder values, distinct from the
            real fields above. */}
        <div className="grid grid-cols-2 gap-px bg-[#DDE4EA] rounded-xl overflow-hidden border border-[#DDE4EA]">
          {[
            { label: "Professional role", value: user.role || "—" },
            { label: "Experience level", value: "Intermediate" },
            { label: "Simulation type", value: "Administrative work" },
          ].map((item) => (
            <div key={item.label} className="bg-white px-5 py-4">
              <div className="text-xs text-[#718493] mb-1">{item.label}</div>
              <div className="text-sm font-semibold text-[#243746]">{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionPreferences({ onDirty }: { onDirty: () => void }) {
  const [langue, setLangue] = useState("English");
  const [duree, setDuree] = useState("15 min");
  const [intensite, setIntensite] = useState("Standard");
  const [conseils, setConseils] = useState(true);
  const [indicateurs, setIndicateurs] = useState(true);
  const [superviseur, setSuperviseur] = useState(true);

  const dirty = useCallback(() => onDirty(), [onDirty]);

  return (
    <div>
      <h3 className="text-base font-semibold text-[#243746] mb-1">Interface preferences</h3>
      <p className="text-xs text-[#718493] mb-6 max-w-lg">
        Personalize your experience without changing the evaluation mechanisms. These settings don't affect the underlying methodology.
      </p>

      <div className="space-y-0 border-t border-[#DDE4EA]">
        <div className="flex items-center justify-between py-4 border-b border-[#DDE4EA]">
          <div>
            <div className="text-sm font-medium text-[#243746]">Language</div>
            <div className="text-xs text-[#718493]">Platform display language</div>
          </div>
          <select
            className="text-sm text-[#243746] border border-[#DDE4EA] rounded-lg px-3 py-1.5 bg-white outline-none focus:border-[#587A92] transition-colors"
            value={langue}
            onChange={(e) => { setLangue(e.target.value); dirty(); }}
          >
            <option>English</option>
            <option>Français</option>
            <option>Español</option>
          </select>
        </div>

        <div className="flex items-center justify-between py-4 border-b border-[#DDE4EA]">
          <div>
            <div className="text-sm font-medium text-[#243746]">Preferred duration</div>
            <div className="text-xs text-[#718493]">Indicative session length</div>
          </div>
          <select
            className="text-sm text-[#243746] border border-[#DDE4EA] rounded-lg px-3 py-1.5 bg-white outline-none focus:border-[#587A92] transition-colors"
            value={duree}
            onChange={(e) => { setDuree(e.target.value); dirty(); }}
          >
            <option>5 min</option>
            <option>10 min</option>
            <option>15 min</option>
            <option>30 min</option>
          </select>
        </div>

        <div className="flex items-center justify-between py-4 border-b border-[#DDE4EA]">
          <div>
            <div className="text-sm font-medium text-[#243746]">Initial intensity level</div>
            <div className="text-xs text-[#718493]">Starting point for simulations</div>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-[#DDE4EA] text-xs">
            {["Light", "Standard", "High"].map((opt) => (
              <button
                key={opt}
                onClick={() => { setIntensite(opt); dirty(); }}
                className="px-3 py-1.5 font-medium transition-colors"
                style={{
                  backgroundColor: intensite === opt ? "#587A92" : "#FFFFFF",
                  color: intensite === opt ? "#FFFFFF" : "#718493",
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {[
          { label: "Show tips during the simulation", desc: "Contextual help visible during the session", val: conseils, set: setConseils },
          { label: "Show performance indicators", desc: "Real-time dashboard visible", val: indicateurs, set: setIndicateurs },
          { label: "Show AI supervisor messages", desc: "ARIA's interventions during the session", val: superviseur, set: setSuperviseur },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between py-4 border-b border-[#DDE4EA] last:border-0">
            <div>
              <div className="text-sm font-medium text-[#243746]">{item.label}</div>
              <div className="text-xs text-[#718493]">{item.desc}</div>
            </div>
            <Toggle on={item.val} onToggle={() => { item.set(!item.val); dirty(); }} />
          </div>
        ))}
      </div>

      <div className="mt-6 bg-[#EDF1F5] border border-[#DDE4EA] rounded-xl px-5 py-4">
        <div className="flex gap-3">
          <div className="w-1 rounded-full bg-[#587A92] shrink-0" />
          <p className="text-xs text-[#718493] leading-relaxed">
            These interface settings don't alter the underlying evaluation methodology. The data collected and the analysis algorithms remain identical regardless of your configuration.
          </p>
        </div>
      </div>
    </div>
  );
}

function SectionSuperviseurIA({ onDirty }: { onDirty: () => void }) {
  const [style, setStyle] = useState("Professional");
  const [notifs, setNotifs] = useState(true);
  const [explications, setExplications] = useState(true);
  const [pressionChanges, setPressionChanges] = useState(true);
  const dirty = useCallback(() => onDirty(), [onDirty]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-base font-semibold text-[#243746]">AI Supervisor — ARIA</h3>
        <span className="text-[10px] font-semibold text-[#8D88A8] bg-[#F0EFF8] px-2 py-0.5 rounded-full tracking-wide uppercase">
          AI
        </span>
      </div>
      <p className="text-xs text-[#718493] mb-6 max-w-lg">
        Configure how ARIA communicates with you during simulations.
      </p>

      <div className="border-t border-[#DDE4EA]">
        <div className="py-5 border-b border-[#DDE4EA]">
          <div className="text-sm font-medium text-[#243746] mb-3">Communication style</div>
          <div className="flex flex-col gap-2">
            {["Professional", "Direct", "Encouraging"].map((opt) => (
              <label key={opt} className="flex items-center gap-3 cursor-pointer group">
                <div
                  className="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors"
                  style={{ borderColor: style === opt ? "#587A92" : "#CBD5DC" }}
                  onClick={() => { setStyle(opt); dirty(); }}
                >
                  {style === opt && (
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#587A92" }} />
                  )}
                </div>
                <span className="text-sm text-[#243746]">{opt}</span>
              </label>
            ))}
          </div>
        </div>

        {[
          { label: "Supervisor notifications", desc: "Receive alerts from ARIA", val: notifs, set: setNotifs },
          { label: "Show explanations after an intervention", desc: "Understand ARIA's algorithmic decisions", val: explications, set: setExplications },
          { label: "Show pressure level changes", desc: "Visible indicator when workload is adjusted", val: pressionChanges, set: setPressionChanges },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between py-4 border-b border-[#DDE4EA] last:border-0">
            <div>
              <div className="text-sm font-medium text-[#243746]">{item.label}</div>
              <div className="text-xs text-[#718493]">{item.desc}</div>
            </div>
            <Toggle on={item.val} onToggle={() => { item.set(!item.val); dirty(); }} />
          </div>
        ))}
      </div>

      <div className="mt-6 bg-[#F0EFF8] border border-[#E5E3F2] rounded-xl px-5 py-4">
        <div className="flex gap-3">
          <div className="w-1 rounded-full bg-[#8D88A8] shrink-0" />
          <p className="text-xs text-[#718493] leading-relaxed">
            ARIA's behaviors can evolve automatically during a simulation in order to reproduce different levels of algorithmic supervision. These adjustments are part of the research protocol and are not customizable.
          </p>
        </div>
      </div>
    </div>
  );
}

function SectionNotifications({ onDirty }: { onDirty: () => void }) {
  const [settings, setSettings] = useState({
    nouvelleSimu: true,
    rapportTermine: true,
    rappelSession: true,
    nouveauAriaMsg: true,
    changementImportant: true,
    miseAJour: false,
  });
  const toggle = (key: keyof typeof settings) => {
    setSettings((s) => ({ ...s, [key]: !s[key] }));
    onDirty();
  };

  const groups = [
    {
      label: "ACTIVITY",
      items: [
        { key: "nouvelleSimu" as const, label: "New simulation available", desc: "When a new scenario becomes accessible" },
        { key: "rapportTermine" as const, label: "Simulation report finished", desc: "As soon as your report is generated" },
        { key: "rappelSession" as const, label: "Session reminder", desc: "Reminders for scheduled sessions" },
      ],
    },
    {
      label: "AI SUPERVISOR",
      items: [
        { key: "nouveauAriaMsg" as const, label: "New message from ARIA", desc: "Supervisor messages outside a session" },
        { key: "changementImportant" as const, label: "Important change during a simulation", desc: "Critical alerts during sessions" },
      ],
    },
    {
      label: "SYSTEM",
      items: [
        { key: "miseAJour" as const, label: "Platform updates", desc: "New features and fixes" },
      ],
    },
  ];

  return (
    <div>
      <h3 className="text-base font-semibold text-[#243746] mb-1">Notifications</h3>
      <p className="text-xs text-[#718493] mb-6">Manage the alerts you want to receive.</p>
      {groups.map((group) => (
        <div key={group.label} className="mb-8">
          <div className="text-[11px] font-semibold text-[#7E8DA3] uppercase tracking-widest mb-3">{group.label}</div>
          <div className="border-t border-[#DDE4EA]">
            {group.items.map((item) => (
              <div key={item.key} className="flex items-center justify-between py-4 border-b border-[#DDE4EA]">
                <div>
                  <div className="text-sm font-medium text-[#243746]">{item.label}</div>
                  <div className="text-xs text-[#718493]">{item.desc}</div>
                </div>
                <Toggle on={settings[item.key]} onToggle={() => toggle(item.key)} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionDonnees() {
  return (
    <div>
      <h3 className="text-base font-semibold text-[#243746] mb-1">Personal data</h3>
      <p className="text-xs text-[#718493] mb-6 max-w-lg">
        WorkPulse AI collects certain data related to your interactions during simulations in order to analyze your experience and generate your report.
      </p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          {
            label: "SESSION DATA",
            items: ["Execution time", "Activity", "Errors", "Pauses"],
          },
          {
            label: "EXPERIENCE DATA",
            items: ["Declared stress", "Perceived workload", "User feedback"],
          },
          {
            label: "ANALYSIS DATA",
            items: ["Performance indicators", "Simulation results", "Generated reports"],
          },
        ].map((cat) => (
          <div key={cat.label} className="bg-[#EDF1F5] rounded-xl p-5">
            <div className="text-[10px] font-semibold text-[#7E8DA3] uppercase tracking-widest mb-3">{cat.label}</div>
            <ul className="space-y-1.5">
              {cat.items.map((item) => (
                <li key={item} className="flex items-center gap-2 text-xs text-[#243746]">
                  <span className="w-1 h-1 rounded-full bg-[#587A92] shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#DDE4EA] rounded-xl p-5 mb-6">
        <div className="text-sm font-semibold text-[#243746] mb-1">You stay in control of your data.</div>
        <p className="text-xs text-[#718493] leading-relaxed">
          All collected data is used exclusively to analyze your experience. No data is shared with third parties without your explicit consent.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button className="text-sm font-medium text-[#587A92] border border-[#587A92] rounded-lg px-4 py-2 hover:bg-[#EDF1F5] transition-colors">
          Export my data
        </button>
        <button className="text-sm font-medium text-[#718493] border border-[#DDE4EA] rounded-lg px-4 py-2 hover:bg-[#EDF1F5] transition-colors">
          View the privacy policy
        </button>
        <button className="text-sm font-medium text-[#8A5A5A] border border-[#E0CECE] rounded-lg px-4 py-2 hover:bg-[#F8F0F0] transition-colors">
          Delete my history
        </button>
      </div>
    </div>
  );
}

function SectionConfidentialite() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const items = [
    {
      title: "Data collection",
      content: "The data collected during simulations is strictly limited to what is necessary to generate your analysis report. No biometric data is collected.",
    },
    {
      title: "Sharing and third parties",
      content: "Your data is never sold. As part of research partnerships, anonymized and aggregated data may be used, subject to your consent.",
    },
    {
      title: "Data retention",
      content: "Session data is retained for 24 months after your last activity. You can request deletion at any time.",
    },
    {
      title: "Your rights",
      content: "You have the right to access, rectify, delete, and port your data. Contact privacy@workpulse.ai to exercise these rights.",
    },
  ];
  return (
    <div>
      <h3 className="text-base font-semibold text-[#243746] mb-1">Privacy policy</h3>
      <p className="text-xs text-[#718493] mb-6">Detailed information about how your personal data is handled.</p>
      <div className="border-t border-[#DDE4EA]">
        {items.map((item) => (
          <div key={item.title} className="border-b border-[#DDE4EA]">
            <button
              className="w-full flex items-center justify-between py-4 text-left"
              onClick={() => setExpanded(expanded === item.title ? null : item.title)}
            >
              <span className="text-sm font-medium text-[#243746]">{item.title}</span>
              <span className="text-[#718493] text-lg transition-transform duration-200" style={{ transform: expanded === item.title ? "rotate(45deg)" : "rotate(0deg)" }}>
                +
              </span>
            </button>
            {expanded === item.title && (
              <div className="pb-4 text-xs text-[#718493] leading-relaxed">{item.content}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Delivered mock data -- no per-session title/stress/performance endpoint
// exists to back a real version of this list yet (would need a report per
// session, and /report is gated on status==completed). Left as the
// original design's placeholder history, not wired to real sessions.
const SESSIONS = [
  { date: "12 SEP 2026", day: "12", month: "SEP", title: "Administrative organization", status: "Finished", stress: "Moderate", stressColor: "#B07A2A", perf: 91, perfColor: "#3D7A5A" },
  { date: "08 SEP 2026", day: "08", month: "SEP", title: "Email prioritization", status: "Finished", stress: "Low", stressColor: "#3D7A5A", perf: 94, perfColor: "#3D7A5A" },
  { date: "04 SEP 2026", day: "04", month: "SEP", title: "Deadline management", status: "Finished", stress: "High", stressColor: "#8A5A5A", perf: 82, perfColor: "#7A6A3A" },
  { date: "29 AUG 2026", day: "29", month: "AUG", title: "Team coordination", status: "Finished", stress: "Moderate", stressColor: "#B07A2A", perf: 88, perfColor: "#3D7A5A" },
  { date: "24 AUG 2026", day: "24", month: "AUG", title: "Meeting under pressure", status: "Finished", stress: "High", stressColor: "#8A5A5A", perf: 79, perfColor: "#7A6A3A" },
];

function SectionHistorique({ sessionCount }: { sessionCount: number | null }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-semibold text-[#243746] mb-0.5">Simulation history</h3>
          <p className="text-xs text-[#718493]">
            {sessionCount === null ? "…" : sessionCount} session{sessionCount === 1 ? "" : "s"} completed
          </p>
        </div>
        <button className="text-xs text-[#587A92] border border-[#DDE4EA] rounded-lg px-3 py-1.5 hover:bg-[#EDF1F5] transition-colors">
          Export
        </button>
      </div>

      <div className="relative">
        <div className="absolute left-10 top-0 bottom-0 w-px bg-[#DDE4EA]" />
        <div className="space-y-1">
          {SESSIONS.map((s, i) => (
            <div
              key={i}
              className="relative flex items-center gap-4 group cursor-pointer"
            >
              <div className="w-20 shrink-0 flex flex-col items-center py-4">
                <div className="text-lg font-semibold text-[#243746] leading-none">{s.day}</div>
                <div className="text-[10px] font-semibold text-[#7E8DA3] tracking-widest uppercase">{s.month}</div>
              </div>
              <div className="absolute left-10 w-2.5 h-2.5 rounded-full border-2 border-[#587A92] bg-white z-10" style={{ top: "50%", transform: "translate(-50%,-50%)" }} />
              <div className="flex-1 flex items-center justify-between bg-white border border-[#DDE4EA] rounded-xl px-5 py-4 ml-2 group-hover:border-[#587A92] group-hover:shadow-sm transition-all duration-150">
                <div>
                  <div className="text-sm font-semibold text-[#243746]">{s.title}</div>
                  <div className="flex items-center gap-3 mt-1">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: s.stressColor + "18", color: s.stressColor }}
                    >
                      Stress: {s.stress}
                    </span>
                    <span className="text-xs text-[#718493]">{s.status}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-semibold" style={{ color: s.perfColor }}>{s.perf}%</div>
                  <div className="text-[10px] text-[#7E8DA3]">Performance</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionSecurite({ onDirty }: { onDirty: () => void }) {
  const [twofa, setTwofa] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  void onDirty;
  return (
    <div>
      <h3 className="text-base font-semibold text-[#243746] mb-6">Security</h3>

      {/* Password */}
      <div className="mb-8">
        <div className="text-[11px] font-semibold text-[#7E8DA3] uppercase tracking-widest mb-3">PASSWORD</div>
        <div className="flex items-center justify-between py-4 border-t border-b border-[#DDE4EA]">
          <div>
            <div className="text-sm font-medium text-[#243746]">Password</div>
            <div className="text-xs text-[#718493]">Last changed: 24 days ago</div>
          </div>
          <button
            onClick={() => setShowPwdModal(true)}
            className="text-sm font-medium text-[#587A92] border border-[#DDE4EA] rounded-lg px-4 py-2 hover:border-[#587A92] hover:bg-[#EDF1F5] transition-colors"
          >
            Change password
          </button>
        </div>
      </div>

      {/* 2FA */}
      <div className="mb-8">
        <div className="text-[11px] font-semibold text-[#7E8DA3] uppercase tracking-widest mb-3">AUTHENTICATION</div>
        <div className="flex items-center justify-between py-4 border-t border-b border-[#DDE4EA]">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium text-[#243746]">Two-factor authentication</div>
              <span className="text-[10px] font-semibold text-[#3D7A5A] bg-[#D4EDE0] px-2 py-0.5 rounded-full">Recommended</span>
            </div>
            <div className="text-xs text-[#718493]">Strengthen your account's security</div>
          </div>
          {twofa ? (
            <button onClick={() => setTwofa(false)} className="text-sm font-medium text-[#8A5A5A] border border-[#E0CECE] rounded-lg px-4 py-2 hover:bg-[#F8F0F0] transition-colors">Disable</button>
          ) : (
            <button onClick={() => setTwofa(true)} className="text-sm font-medium text-white rounded-lg px-4 py-2 hover:opacity-90 transition-opacity" style={{ backgroundColor: "#587A92" }}>Enable</button>
          )}
        </div>
      </div>

      {/* Active sessions */}
      <div>
        <div className="text-[11px] font-semibold text-[#7E8DA3] uppercase tracking-widest mb-3">ACTIVE SESSIONS</div>
        <div className="border border-[#DDE4EA] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#DDE4EA] bg-[#EDF1F5]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#314C60] flex items-center justify-center text-white text-xs font-medium">W</div>
              <div>
                <div className="text-sm font-medium text-[#243746]">This device</div>
                <div className="text-xs text-[#718493]">Windows · Chrome</div>
              </div>
            </div>
            <span className="text-xs text-[#3D7A5A] font-medium bg-[#D4EDE0] px-2 py-0.5 rounded-full">Current session</span>
          </div>
          <div className="px-5 py-3">
            <button onClick={logout} className="text-xs text-[#8A5A5A] font-medium hover:underline">Log out of all devices</button>
          </div>
        </div>
      </div>

      {showPwdModal && (
        <div className="fixed inset-0 bg-[#243746]/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowPwdModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-8 w-96" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-base font-semibold text-[#243746] mb-5">Change password</h4>
            <div className="space-y-4">
              {["Current password", "New password", "Confirm new password"].map((lbl) => (
                <div key={lbl}>
                  <label className="text-xs font-medium text-[#718493] block mb-1">{lbl}</label>
                  <input type="password" className="w-full border border-[#DDE4EA] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#587A92] transition-colors" />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowPwdModal(false)} className="flex-1 text-sm font-medium text-[#718493] border border-[#DDE4EA] rounded-lg py-2 hover:bg-[#EDF1F5] transition-colors">Cancel</button>
              <button className="flex-1 text-sm font-medium text-white rounded-lg py-2 hover:opacity-90 transition-opacity" style={{ backgroundColor: "#587A92" }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionCompte({ user }: { user: User }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  return (
    <div>
      <h3 className="text-base font-semibold text-[#243746] mb-6">Account information</h3>

      <div className="mb-10">
        <div className="border-t border-[#DDE4EA]">
          {[
            { label: "Email address", value: user.email },
            { label: "Account type", value: "Participant — Research" },
            { label: "Creation date", value: user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }) : "—" },
            { label: "Language", value: "English" },
            { label: "Time zone", value: "Europe/Paris (UTC+2)" },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-4 border-b border-[#DDE4EA]">
              <div className="text-xs font-medium text-[#718493] uppercase tracking-wide">{item.label}</div>
              <div className="text-sm text-[#243746] font-medium">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-[#E0CECE] rounded-xl p-6" style={{ backgroundColor: "#FDF8F8" }}>
        <div className="text-[11px] font-semibold text-[#8A5A5A] uppercase tracking-widest mb-1">Danger zone</div>
        <h4 className="text-sm font-semibold text-[#6B4040] mb-1">Permanently delete my account</h4>
        <p className="text-xs text-[#9E6E6E] mb-4 leading-relaxed">
          This action is irreversible. All your data, sessions, and reports will be permanently deleted.
        </p>
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-sm font-medium text-[#8A5A5A] border border-[#E0CECE] rounded-lg px-4 py-2 hover:bg-[#F8F0F0] transition-colors"
          >
            Delete my account
          </button>
        ) : (
          <div className="bg-white border border-[#E0CECE] rounded-lg p-4">
            <p className="text-xs text-[#6B4040] mb-3 font-medium">Are you sure you want to delete your account?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="text-sm font-medium text-[#718493] border border-[#DDE4EA] rounded-lg px-4 py-2 hover:bg-[#EDF1F5] transition-colors">Cancel</button>
              <button className="text-sm font-medium text-white rounded-lg px-4 py-2" style={{ backgroundColor: "#8A5A5A" }}>Confirm deletion</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SaveBar({ dirty, onSave, onCancel }: { dirty: boolean; onSave: () => void; onCancel: () => void }) {
  const [saved, setSaved] = useState(false);
  const handleSave = () => {
    onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };
  if (!dirty && !saved) return null;
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 px-5 py-3 rounded-xl shadow-lg border"
      style={{ backgroundColor: saved ? "#EDF5F0" : "white", borderColor: saved ? "#A8D4BC" : "#DDE4EA", transition: "all 0.2s" }}
    >
      {saved ? (
        <span className="text-sm font-medium text-[#3D7A5A] flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="7" fill="#3D7A5A" /><polyline points="4,7 6,9 10,5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Changes saved
        </span>
      ) : (
        <>
          <span className="text-sm text-[#718493]">Unsaved changes</span>
          <button onClick={onCancel} className="text-sm font-medium text-[#718493] hover:text-[#243746] transition-colors">Cancel</button>
          <button onClick={handleSave} className="text-sm font-medium text-white rounded-lg px-4 py-1.5 hover:opacity-90 transition-opacity" style={{ backgroundColor: "#587A92" }}>Save</button>
        </>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useApp();
  const [active, setActive] = useState<Section>("profil");
  const [dirty, setDirty] = useState(false);
  const [sessionCount, setSessionCount] = useState<number | null>(null);

  useEffect(() => {
    apiRequest<unknown[]>("/sessions/")
      .then((rows) => setSessionCount(rows.length))
      .catch(() => setSessionCount(null));
  }, []);

  const makeDirty = useCallback(() => setDirty(true), []);
  const handleSave = () => setDirty(false);
  const handleCancel = () => setDirty(false);

  const renderSection = () => {
    switch (active) {
      case "profil": return <SectionProfil user={user} onDirty={makeDirty} />;
      case "preferences": return <SectionPreferences onDirty={makeDirty} />;
      case "simulation-prefs": return <SectionSuperviseurIA onDirty={makeDirty} />;
      case "notifications": return <SectionNotifications onDirty={makeDirty} />;
      case "donnees": return <SectionDonnees />;
      case "confidentialite": return <SectionConfidentialite />;
      case "historique": return <SectionHistorique sessionCount={sessionCount} />;
      case "securite": return <SectionSecurite onDirty={makeDirty} />;
      case "compte": return <SectionCompte user={user} />;
      default: return null;
    }
  };

  const sectionTitles: Record<Section, string> = {
    profil: "My profile",
    preferences: "Preferences",
    "simulation-prefs": "AI Supervisor",
    notifications: "Notifications",
    donnees: "Personal data",
    confidentialite: "Privacy",
    historique: "Session history",
    securite: "Security",
    compte: "Account",
  };

  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: "#F3F6F8", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Same header as the landing page -- SiteNav is shared so both
          pages render identically instead of maintaining two copies.
          scrolled=true keeps it in its bordered/opaque state permanently,
          since this page isn't a long scroll like the landing page (no
          scroll listener here to drive the transition). Note this drops
          the previous settings-specific header extras (notification bell,
          "My profile/Settings/Help" dropdown) in favor of matching the
          landing page exactly, as asked -- SiteNav's own settings icon
          already routes back here, and its session-status pill covers
          the same "who's logged in" purpose the old dropdown served. */}
      <SiteNav scrolled />

      {/* Page -- pt-20 clears SiteNav's fixed 64px height (it's
          position:fixed, unlike the old sticky header, so content needs
          explicit top clearance instead of flowing below it naturally). */}
      <div className="max-w-[1200px] mx-auto px-6 pt-20 pb-8">
        {/* Page title */}
        <div className="mb-8">
          <div className="text-xs text-[#7E8DA3] mb-1">Account · {sectionTitles[active]}</div>
          <h1 className="text-2xl font-semibold text-[#243746]">{sectionTitles[active]}</h1>
        </div>

        <div className="flex gap-8 items-start">
          {/* Left nav */}
          <aside className="w-52 shrink-0 sticky top-[88px]">
            <nav className="space-y-6">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="text-[10px] font-semibold text-[#7E8DA3] uppercase tracking-widest mb-2 px-3">{group.label}</div>
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setActive(item.id)}
                        className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 flex items-center gap-2"
                        style={{
                          backgroundColor: active === item.id ? "#EDF1F5" : "transparent",
                          color: active === item.id ? "#263F52" : "#718493",
                        }}
                      >
                        {active === item.id && (
                          <div className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: "#587A92" }} />
                        )}
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-[#DDE4EA]">
                <button onClick={logout} className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-[#8A5A5A] hover:bg-[#F8F0F0] transition-colors">
                  Log out
                </button>
              </div>
            </nav>
          </aside>

          {/* Content */}
          <main className="flex-1 min-w-0 bg-white rounded-2xl border border-[#DDE4EA] p-8">
            {renderSection()}
          </main>
        </div>
      </div>

      <SaveBar dirty={dirty} onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}
