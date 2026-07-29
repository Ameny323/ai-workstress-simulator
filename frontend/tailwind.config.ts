import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
      colors: {
        // ── Brand / text ──────────────────────────────────────────
        ink:   "#1B2A4A",   // primary dark text
        brand: "#4C6D84",   // primary interactive (buttons, links)

        // ── Right panel (illustration side) ──────────────────────
        panel:        "#3C5D76",
        "panel-2":    "#2B4358",
        "panel-dark": "#324F64",
        "panel-border": "#3C4A57",
        "panel-muted":  "#8CA0B3",

        // ── Left panel / form ─────────────────────────────────────
        "field-bg":       "#FDFDFD",
        "field-border":   "#DCEAF2",
        "field-focus":    "#476A82",
        "text-secondary": "#6B7280",
        "text-hint":      "#7A96A8",

        // ── Stat card accents ─────────────────────────────────────
        "stat-productivity": "#4C8C6B",
        "stat-stress":       "#E091B3",
        "stat-decision":     "#8B7FD4",
      },
    },
  },
  plugins: [],
};

export default config;
