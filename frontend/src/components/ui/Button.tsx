// src/components/ui/Button.tsx
import { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  loading?: boolean;
}

export default function Button({
  children, loading = false, disabled, type = "button", ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "12px 20px",
        fontSize: 13,
        fontWeight: 700,
        color: "#FDFDFD",
        background: "linear-gradient(135deg, #4C6D84 0%, #5D8099 100%)",
        border: "none",
        borderRadius: 16,
        cursor: isDisabled ? "not-allowed" : "pointer",
        letterSpacing: "0.06em",
        boxShadow: "0 4px 18px rgba(50,80,105,0.38)",
        transition: "opacity 0.2s, transform 0.15s",
        opacity: isDisabled ? 0.6 : 1,
      }}
      onMouseEnter={e => { if (!isDisabled) e.currentTarget.style.opacity = "0.88"; }}
      onMouseLeave={e => { if (!isDisabled) e.currentTarget.style.opacity = "1"; }}
      onMouseDown={e =>  { if (!isDisabled) e.currentTarget.style.transform = "scale(0.985)"; }}
      onMouseUp={e =>    { if (!isDisabled) e.currentTarget.style.transform = "scale(1)"; }}
      {...rest}
    >
      {loading ? "Signing in…" : children}
    </button>
  );
}
