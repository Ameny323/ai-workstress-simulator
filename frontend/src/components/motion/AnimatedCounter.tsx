import { useEffect, useState, type CSSProperties } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { DURATION_BASE, EASE_FEEDBACK } from "@/lib/motion";

interface AnimatedCounterProps {
  value: number;
  format?: (rounded: number) => string;
  style?: CSSProperties;
}

// Smoothly tweens the displayed number toward `value` whenever it changes
// -- for "N flagged"/"N sorted"/"N matched" style counters. Generic: the
// caller composes it with whatever surrounding text it needs, e.g.
// `<AnimatedCounter value={flaggedCount} /> flagged`.
export default function AnimatedCounter({ value, format, style }: AnimatedCounterProps) {
  const motionValue = useMotionValue(value);
  const [display, setDisplay] = useState(Math.round(value));

  useEffect(() => {
    // framer-motion's `animate()` takes duration in seconds; motion.ts's
    // token is in ms (the unit the Step 1 spec asked for), so divide here
    // at the point of use rather than keeping two copies of the constant.
    const controls = animate(motionValue, value, {
      duration: DURATION_BASE / 1000,
      ease: EASE_FEEDBACK,
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <motion.span style={style}>{format ? format(display) : display}</motion.span>;
}
