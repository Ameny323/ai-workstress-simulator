// src/lib/motion.ts
//
// Shared motion tokens for the task-section animation system. Values are
// plain numbers/hex/cubic-bezier arrays (not CSS strings) so the same
// constant works identically as a CSS transition value and as a
// framer-motion `transition`/`animate` prop -- one source of truth for
// both, rather than two copies drifting apart.
//
// Everything below was pulled from what ValidationTask/DocumentOrganization
// Task/MatchingTask (all three, byte-identical) and the app shell already
// use, not invented fresh -- see each token's comment for exactly where it
// already appears. The one genuinely new addition is GLOW_VALID_TARGET,
// since drag-and-drop hover states don't exist anywhere in the app yet.

// ── Durations (ms) ──────────────────────────────────────────────────

// Micro-feedback: hover/press states, a row toggling selected. Already the
// dominant "quick interaction" value -- ActionButton's `opacity/transform
// 0.15s` (QuickActions.tsx, Dashboard.tsx) and DocumentOrganizationTask's
// row-background hover transition.
export const DURATION_FAST = 150;

// Default for state-change transitions -- a color/value changing in place.
// Already the timer badge's own background-color transition in all three
// task components (`transition: "width 1s linear, background 0.3s"`).
export const DURATION_BASE = 300;

// Real-time-linked animation -- something draining/ticking in step with an
// actual clock, not a UI reaction. Already the exact width-drain duration
// on all three existing countdown bars (1 tick = 1 real second = 1s
// transition), which is precisely what DeadlineBar takes over in Step 3.
export const DURATION_SLOW = 1000;

// ── Easing curves ────────────────────────────────────────────────────
// Cubic-bezier control points, usable directly as a framer-motion `ease`
// array or joined into a CSS `cubic-bezier(...)` string.

// Entering/appearing content (a task card mounting, a value fading in).
// Matches the CSS `ease` keyword already used by globals.css's `.fade-in`
// keyframe and .glass-card's hover transition -- both are the browser's
// default "ease", written out as its equivalent bezier so framer-motion
// and CSS agree on the exact same curve instead of two approximations.
export const EASE_ENTER: [number, number, number, number] = [0.25, 0.1, 0.25, 1];

// State-change feedback (a pulse, a flash, a counter landing on its new
// value). No equivalent currently exists in the codebase -- every existing
// transition either omits an easing keyword (implicit default "ease", same
// as EASE_ENTER above) or uses `linear` for the real-time countdown.
// Feedback specifically wants a fast, punchy deceleration rather than a
// smooth ease, so this is the one new curve: a snappy easeOut (sometimes
// called "easeOutExpo") that front-loads the motion.
export const EASE_FEEDBACK: [number, number, number, number] = [0.16, 1, 0.3, 1];

// ── Feedback color vocabulary ────────────────────────────────────────
// Reused from existing theme colors (globals.css / the task components'
// own inline hex) wherever one already exists for the concept -- nothing
// here is a new hue except the glow.

// Success pulse. Same green already used for the "Submitted ✓" state
// across all three task components (button bg rgba(34,197,94,0.15), text
// #16a34a) and StressWidget's "Very Low" band.
export const COLOR_SUCCESS = "#22c55e";
// Darker text-on-light-bg variant, matching the existing submitted-button
// convention (base color for fills/glows, this for text).
export const COLOR_SUCCESS_TEXT = "#16a34a";

// Error pulse. Same red already used as the *critical* stage of all three
// task timers' own color ramp, and as the error-text color on
// TasksPage/SessionReportPage. Deliberately not #ef4444 (Dashboard's
// Emergency Break, StressWidget's "Very High" band) -- that red already
// means something else (a destructive action / extreme self-reported
// stress), not "an operation failed," so it's left alone rather than
// merged in.
export const COLOR_ERROR = "#c0505a";

// Warning / mid-state. Same amber already used as the middle stage of all
// three task timers' color ramp (distinct from StressWidget's brighter
// #f59e0b "Moderate" band, which -- like the error red above -- represents
// a different concept and isn't being merged in here).
export const COLOR_WARNING = "#c98a2c";

// The timer ramp's own thresholds (fraction of time remaining), already
// identical across all three task components -- named here so DeadlineBar
// and anything built on top of it share these instead of re-copying the
// magic numbers 0.5/0.25.
export const DEADLINE_WARNING_THRESHOLD = 0.5;
export const DEADLINE_CRITICAL_THRESHOLD = 0.25;

// Hover/valid-drop-target glow. Genuinely new -- no drag-and-drop exists
// yet to have established a precedent. Based on the primary brand blue
// (#5B84C6) rather than a new hue, since that's already the app's color
// for "interactive/selected" (buttons, the timer's own normal state,
// selected-row backgrounds). This is that same blue at glow strength.
export const COLOR_HOVER_VALID_TARGET = "#5B84C6";
export const GLOW_VALID_TARGET = "rgba(91, 132, 198, 0.35)";
