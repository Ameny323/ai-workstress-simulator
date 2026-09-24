import { forwardRef, useImperativeHandle, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "framer-motion";
import { COLOR_SUCCESS, COLOR_ERROR, DURATION_BASE, EASE_FEEDBACK } from "@/lib/motion";

export interface FeedbackPulseHandle {
  flash: (type: "success" | "error") => void;
}

interface FeedbackPulseProps {
  children: ReactNode;
  // Applied to the wrapping element, not the pulse overlay -- pass
  // `borderRadius` here to match whatever's being wrapped, since the
  // overlay inherits it (see below).
  style?: CSSProperties;
}

// How long the pulse takes to fade out, on top of DURATION_BASE. Not a
// motion.ts token itself -- it's this component's own "how long is a
// flash" behavior, not a reusable timing/easing/color vocabulary entry.
const FLASH_FADE_MS = 400;

// Wraps a child element; exposes an imperative `.flash("success"|"error")`
// via ref, so a parent can trigger a brief flash in response to an event
// (e.g. a submit succeeding) without having to manage extra state just to
// force a retrigger.
const FeedbackPulse = forwardRef<FeedbackPulseHandle, FeedbackPulseProps>(function FeedbackPulse(
  { children, style },
  ref
) {
  const [active, setActive] = useState<{ type: "success" | "error"; key: number } | null>(null);
  const counter = useRef(0);

  useImperativeHandle(ref, () => ({
    flash: (type) => {
      counter.current += 1;
      setActive({ type, key: counter.current });
    },
  }));

  const color = active?.type === "error" ? COLOR_ERROR : COLOR_SUCCESS;

  return (
    <div style={{ position: "relative", ...style }}>
      {children}
      {active && (
        <motion.div
          key={active.key}
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 0 }}
          transition={{ duration: (DURATION_BASE + FLASH_FADE_MS) / 1000, ease: EASE_FEEDBACK }}
          onAnimationComplete={() =>
            setActive((current) => (current?.key === active.key ? null : current))
          }
          style={{
            position: "absolute",
            inset: -2,
            borderRadius: "inherit", // resolves against this wrapper's own style.borderRadius
            background: color,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
});

export default FeedbackPulse;
