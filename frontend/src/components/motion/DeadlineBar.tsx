import { motion } from "framer-motion";
import {
  COLOR_ERROR,
  COLOR_WARNING,
  DEADLINE_CRITICAL_THRESHOLD,
  DEADLINE_WARNING_THRESHOLD,
  DURATION_BASE,
  DURATION_SLOW,
  EASE_ENTER,
  EASE_FEEDBACK,
} from "@/lib/motion";

// Same "normal" blue all three existing task timers already fall back to
// (`#5B84C6`, matches --primary in globals.css). Not pulled from motion.ts
// -- that file's charter is durations/easing/feedback colors, not a full
// restatement of the app's brand palette.
const COLOR_NORMAL = "#5B84C6";

interface DeadlineBarProps {
  // Seconds remaining / seconds total -- the exact `remaining`/
  // `totalSeconds` state each task component already owns via its own
  // countdown `useEffect`. DeadlineBar does not run a timer itself; it
  // only visualizes whatever the caller is already ticking.
  remaining: number;
  total: number;
  style?: React.CSSProperties;
}

export default function DeadlineBar({ remaining, total, style }: DeadlineBarProps) {
  const timeRatio = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 1;
  const isCritical = timeRatio <= DEADLINE_CRITICAL_THRESHOLD;
  const isWarning = !isCritical && timeRatio <= DEADLINE_WARNING_THRESHOLD;
  const color = isCritical ? COLOR_ERROR : isWarning ? COLOR_WARNING : COLOR_NORMAL;

  return (
    <div
      style={{
        height: 4,
        borderRadius: 99,
        background: "rgba(0,0,0,0.06)",
        overflow: "hidden",
        ...style,
      }}
    >
      <motion.div
        animate={{
          width: `${timeRatio * 100}%`,
          backgroundColor: color,
          // Subtle pulse once time is critical -- a nudge beyond the plain
          // color change, using the feedback curve/color since this is
          // reactive urgency, not passive draining.
          opacity: isCritical ? [1, 0.75, 1] : 1,
        }}
        transition={{
          // Width tracks real elapsed time linearly, exactly like the
          // existing bars' `transition: "width 1s linear"`.
          width: { duration: DURATION_SLOW / 1000, ease: "linear" },
          backgroundColor: { duration: DURATION_BASE / 1000, ease: EASE_ENTER },
          opacity: isCritical
            ? { duration: DURATION_BASE / 1000, ease: EASE_FEEDBACK, repeat: Infinity }
            : { duration: DURATION_BASE / 1000 },
        }}
        style={{ height: "100%", borderRadius: 99 }}
      />
    </div>
  );
}
