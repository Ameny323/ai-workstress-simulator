import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";

export default function MainLayout() {
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", backgroundColor: "#F5F7FA" }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Navbar />
        <main
          className="fade-in"
          style={{
            flex: 1,
            overflowY: "auto",
            backgroundColor: "#F5F7FA",
            backgroundImage:
              "radial-gradient(circle at center, rgba(157,200,255,0.28) 1px, transparent 1.2px)",
            backgroundSize: "22px 22px",
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
