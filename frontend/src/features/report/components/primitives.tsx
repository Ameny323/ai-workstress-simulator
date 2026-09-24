import type { ReactNode } from "react";
import { REPORT_COLORS as C } from "../reportTheme";

export function SectionCard({
  title,
  subtitle,
  children,
  id,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="report-section-card"
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "22px 24px",
      }}
    >
      <h2 style={{ fontSize: 15, fontWeight: 700, color: C.dark, margin: 0, letterSpacing: "-0.01em" }}>{title}</h2>
      {subtitle && (
        <p style={{ fontSize: 12.5, color: C.secondary, margin: "4px 0 16px", lineHeight: 1.5, maxWidth: 640 }}>
          {subtitle}
        </p>
      )}
      {!subtitle && <div style={{ marginBottom: 14 }} />}
      {children}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  caption,
  accent,
}: {
  label: string;
  value: string;
  caption?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        flex: "1 1 160px",
        minWidth: 150,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "14px 16px",
        background: C.background,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: C.secondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent ?? C.dark, marginTop: 4, letterSpacing: "-0.02em" }}>
        {value}
      </div>
      {caption && <div style={{ fontSize: 11.5, color: C.secondary, marginTop: 3, lineHeight: 1.4 }}>{caption}</div>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "18px 16px",
        textAlign: "center",
        color: C.secondary,
        fontSize: 12.5,
        background: C.background,
        borderRadius: 8,
        border: `1px dashed ${C.border}`,
      }}
    >
      {children}
    </div>
  );
}

export function Pill({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        color,
        background: `${color}18`,
        border: `1px solid ${color}40`,
        padding: "3px 10px",
        borderRadius: 99,
      }}
    >
      {text}
    </span>
  );
}

export const axisTick = { fontSize: 11, fill: C.secondary };
export const tooltipStyle = { fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}`, color: C.text };

export function MethodologyNote({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontSize: 11.5, color: C.secondary, marginTop: 12, lineHeight: 1.5, fontStyle: "italic" }}>
      {children}
    </p>
  );
}
