import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LandingPage  from "@/features/landing/LandingPage";
import LoginPage    from "@/features/auth/LoginPage";
import RegisterPage from "@/features/auth/RegisterPage";
import Dashboard from "@/features/dashboard/Dashboard";
import CockpitPage from "@/features/simulation/CockpitPage";
import SimulationHistoryPage from "@/features/simulation/SimulationHistoryPage";
import SessionReportPage from "@/features/report/SessionReportPage";
import SettingsPage from "@/features/settings/SettingsPage";
import { AppProvider } from "@/contexts/AppContext";
import MainLayout from "@/components/layout/MainLayout";
import RequireAuth from "@/components/auth/RequireAuth";

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route path="/"          element={<LandingPage/>}/>
          <Route path="/login"    element={<LoginPage/>}/>
          <Route path="/register" element={<RegisterPage/>}/>
          <Route path="/settings" element={<SettingsPage/>}/>

          {/* /simulation (Simulation History) and /sessions/:id/report (the
              debriefing report) are front-office pages, not back-office
              Dashboard sections -- both render their own SiteNav header,
              the exact same shared chrome as the Home/Landing and Settings
              pages, instead of MainLayout's Sidebar+Navbar shell. Both were
              deliberately moved out of the MainLayout block below after
              user feedback that nesting them there made them look like
              "another dashboard widget" rather than their own platform
              pages. */}
          <Route path="/simulation" element={<SimulationHistoryPage/>} />
          <Route path="/sessions/:id/report" element={<SessionReportPage/>} />

          {/* /tasks is the front-office cockpit -- the ONLY task UI. It runs
              the backend-authoritative sequential simulation (see
              CockpitPage.tsx) covering the four cahier-required task types
              (data_validation, document_organization, email_writing,
              urgent_request); email_prioritization remains a separate,
              real, working task type kept out of the default sequence
              (see EmailPrioritizationTask.tsx). No layout wrapper:
              CockpitPage renders its own full-height header/sidebar/
              ARIA-panel chrome directly. The old generic, freely-navigable
              multi-type task pool (TasksPage/TaskRenderer/taskRegistry) was
              removed from the frontend entirely and is not part of the
              current architecture. */}
          <Route path="/tasks" element={<RequireAuth><CockpitPage/></RequireAuth>} />

          <Route element={<MainLayout/>}>
            <Route path="/bureau" element={<Dashboard/>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}
