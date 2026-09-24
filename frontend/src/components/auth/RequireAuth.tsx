import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";

// Route-level guard: redirects to /login unless the user is actually
// authenticated -- not just "the landing page's link happened to point
// here." Without this, a direct URL visit (typed address, bookmark,
// back-forward) or an expired session would still render a protected
// page. Waits on authChecked before deciding: isAuthenticated starts
// false even for a genuinely logged-in user until the initial GET
// /auth/me resolves, so redirecting on isAuthenticated alone would bounce
// a real user refreshing the page straight to /login.
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, authChecked } = useApp();

  if (!authChecked) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
