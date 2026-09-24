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

        // ── Landing page ("front office") design tokens ───────────
        // Most of the landing page's colors are literal inline hex (matches
        // this project's own inline-style convention already), so only the
        // couple of spots that use Tailwind color utility classes
        // (bg-wp-text, border-wp-border) actually need these registered --
        // the rest of this set is included for completeness/documentation
        // of the design system, not because every token has a utility-class
        // call site today.
        "wp-primary":   "#587A92",
        "wp-dark":      "#263F52",
        "wp-deep":      "#314C60",
        "wp-soft":      "#F3F6F8",
        "wp-text":      "#243746",
        "wp-secondary": "#718493",
        "wp-muted":     "#7E8DA3",
        "wp-purple":    "#8D88A8",
        "wp-green":     "#719887",
        "wp-amber":     "#B89A61",
        "wp-border":    "#D5DDE4",
      },
    },
  },
  plugins: [],
};

export default config;
