import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage    from "@/features/auth/LoginPage";
import RegisterPage from "@/features/auth/RegisterPage";
import Dashboard from "@/features/dashboard/Dashboard";
import { AppProvider } from "@/contexts/AppContext";
import MainLayout from "@/components/layout/MainLayout";

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route path="/login"    element={<LoginPage/>}/>
          <Route path="/register" element={<RegisterPage/>}/>

          <Route element={<MainLayout/>}>
            <Route path="/bureau" element={<Dashboard/>} />
            {/* other authenticated routes can be nested here */}
          </Route>

          <Route path="*" element={<Navigate to="/login" replace/>}/>
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}
