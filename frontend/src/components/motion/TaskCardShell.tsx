import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { DURATION_BASE, EASE_ENTER } from "@/lib/motion";

interface TaskCardShellProps {
  children: ReactNode;
}

// Wraps whatever a task type renders, giving it a consistent enter/exit
// transition when one task is replaced by the next. Mirrors globals.css's
// `.fade-in` keyframe (opacity + a small upward settle) using the same
// entering-content curve, so a task card mounting reads the same way the
// page shell itself already does. Requires an AnimatePresence ancestor
// with a changing `key` (task.id) on this component to actually see the
// exit transition play -- not wired into TaskRenderer yet (see Step 3
// notes: that integration touches TaskRenderer's switch structure, which
// is more than the "minimal, low-risk" scope asked for there).
export default function TaskCardShell({ children }: TaskCardShellProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: DURATION_BASE / 1000, ease: EASE_ENTER }}
    >
      {children}
    </motion.div>
  );
}
