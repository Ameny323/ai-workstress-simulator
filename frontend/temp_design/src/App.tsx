import { AppProvider } from "./contexts/AppContext";
import Sidebar from "./components/layout/Sidebar";
import Navbar from "./components/layout/Navbar";
import Dashboard from "./features/dashboard/Dashboard";

function Layout() {
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", backgroundColor: "#F5F7FA" }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Navbar />
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            backgroundColor: "#F5F7FA",
            backgroundImage:
              "radial-gradient(circle at center, rgba(157,200,255,0.28) 1px, transparent 1.2px)",
            backgroundSize: "22px 22px",
          }}
        >
          <Dashboard />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  );
}
