// src/components/ui/StatCard.tsx

interface StatCardProps {
  icon: string;
  label: string;
  value: string;
  sublabel?: string;
  className?: string;
}

export default function StatCard({ icon, label, value, sublabel, className = "" }: StatCardProps) {
  return (
    <div
      className={className}
      style={{
        background: "rgba(255,255,255,0.17)",
        border: "1px solid rgba(255,255,255,0.22)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderRadius: 12,
        padding: "10px 14px",
        minWidth: 172,
        boxShadow: "0 4px 18px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.10)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 500 }}>{label}</span>
      </div>
      <p style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.90)", lineHeight: 1.2 }}>{value}</p>
      {sublabel && (
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", marginTop: 2 }}>{sublabel}</p>
      )}
    </div>
  );
}
