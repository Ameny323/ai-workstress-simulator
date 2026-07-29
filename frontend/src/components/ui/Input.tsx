// src/components/ui/Input.tsx
import { useState, ReactNode, InputHTMLAttributes } from "react";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  trailing?: ReactNode;
}

export default function Input({
  label, id, type = "text", value, onChange, placeholder, trailing, ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div>
      {label && (
        <label htmlFor={id} style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#445D72", marginBottom: 6 }}>
          {label}
        </label>
      )}
      <div style={{ position: "relative" }}>
        <input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: "100%",
            padding: trailing ? "8px 38px 8px 13px" : "8px 13px",
            fontSize: 13,
            color: "#2A3D4D",
            background: "#FDFDFD",
            border: `1.5px solid ${focused ? "#476A82" : "#DCEAF2"}`,
            borderRadius: 16,
            outline: "none",
            boxShadow: focused ? "0 0 0 3px rgba(60,90,115,0.14)" : "0 1px 3px rgba(0,0,0,0.04)",
            transition: "border-color 0.2s, box-shadow 0.2s",
            boxSizing: "border-box",
          }}
          {...rest}
        />
        {trailing && (
          <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", display: "flex" }}>
            {trailing}
          </div>
        )}
      </div>
    </div>
  );
}
