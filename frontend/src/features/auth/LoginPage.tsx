

import { useState } from "react";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";

import logoSvgRaw from "@/assets/images/logo.svg?raw";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import StatCard from "@/components/ui/StatCard";
import AiMonitorIllustration from "@/components/illustrations/AiMonitorIllustration";
import { login } from "./authApi";

function useLogo(raw: string) {
  return raw
    .replace(/<path[^>]*fill="#FDFDFD"[^>]*\/>/, "")
    .replace(
      /width="\d+" height="\d+"/,
      'width="100%" height="100%" viewBox="0 0 1536 1024" preserveAspectRatio="xMidYMid meet"'
    );
}

export default function LoginPage() {
  const navigate = useNavigate();
  
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const logoHtml = useLogo(logoSvgRaw);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login({ email, password });
      navigate("/bureau");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }} className="h-screen w-screen flex overflow-hidden">

      {/* ══════ LEFT — form ══════ */}
      <div
        className="w-full md:w-[42%] flex flex-col justify-center items-center overflow-y-auto relative"
        style={{ background: "linear-gradient(175deg, #EDF3F7 0%, #FDFDFD 38%)" }}
      >
        <div
          className="absolute top-0 inset-x-0 h-48 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 50% -10%, #D1E4EF 0%, transparent 68%)" }}
        />

        <div className="relative z-10 w-full" style={{ maxWidth: 360, padding: "20px 32px" }}>

          {/* Logo */}
          <div className="flex justify-center mb-4 relative">
            <div
              className="absolute pointer-events-none"
              style={{
                inset: "-16px",
                background: "radial-gradient(ellipse, #C2D4DF 0%, transparent 65%)",
                filter: "blur(16px)",
                borderRadius: "50%",
              }}
            />
            <div
              style={{ height: 88, maxWidth: 260, width: "100%", position: "relative" }}
              dangerouslySetInnerHTML={{ __html: logoHtml }}
            />
          </div>

          <p className="text-center mb-5" style={{ fontSize: 12, color: "#7A96A8", letterSpacing: "0.01em" }}>
            Sign in to your WorkPulse AI workspace
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 10 }}>
              <Input
                id="email"
                label="Email address"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@company.com"
                autoComplete="email"
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <label htmlFor="password" style={{ fontSize: 11, fontWeight: 500, color: "#445D72" }}>
                  Password
                </label>
                <button
                  type="button"
                  style={{ fontSize: 11, fontWeight: 500, color: "#476A82", background: "none", border: "none", cursor: "pointer" }}
                >
                  Forgot password?
                </button>
              </div>
              <Input
                id="password"
                label=""
                type={showPw ? "text" : "password"}
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                autoComplete="current-password"
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#8AAAB8", display: "flex" }}
                  >
                    {showPw ? <EyeOff size={13}/> : <Eye size={13}/>}
                  </button>
                }
              />
            </div>

            {error && (
              <p style={{ fontSize: 11, color: "#C0505A", marginBottom: 10, textAlign: "center" }}>{error}</p>
            )}

            <Button type="submit" loading={loading}>
              SIGN IN <ArrowRight size={13}/>
            </Button>
          </form>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0" }}>
            <div style={{ flex: 1, height: 1, background: "#DCEAF2" }}/>
            <span style={{ fontSize: 10, color: "#A4BFCC" }}>or continue with</span>
            <div style={{ flex: 1, height: 1, background: "#DCEAF2" }}/>
          </div>

          {/* Social */}
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 14 }}>
            {(["G", "MS", "GH"] as const).map(provider => (
              <button
                key={provider}
                type="button"
                style={{
                  width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 600, color: "#445D72", background: "#FDFDFD",
                  border: "1.5px solid #DCEAF2", borderRadius: 10, cursor: "pointer",
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "#EDF3F7"; e.currentTarget.style.borderColor = "#B8D0DC"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#FDFDFD"; e.currentTarget.style.borderColor = "#DCEAF2"; }}
              >
                {provider}
              </button>
            ))}
          </div>

         <p style={{ fontSize: 11, textAlign: "center", color: "#A4BFCC" }}>
            {"Don't have an account? "}
            <Link to="/register" style={{ fontWeight: 600, color: "#445D72", textDecoration: "none" }}>
              Create an account
            </Link>
          </p>
        </div>
      </div>

      {/* ══════ RIGHT — illustration ══════ */}
      <div
        className="hidden md:flex flex-col relative overflow-hidden"
        style={{ width: "58%", background: "linear-gradient(145deg, #3C5D76 0%, #2B4358 52%, #324F64 100%)" }}
      >
        <AiMonitorIllustration/>

        {/* Hero text */}
        <div className="relative z-10 text-center" style={{ paddingTop: 24, paddingLeft: 28, paddingRight: 28 }}>
          <div
            className="absolute pointer-events-none"
            style={{
              left: "50%", transform: "translateX(-50%)",
              width: 220, height: 70, top: 16,
              background: "radial-gradient(ellipse, rgba(255,255,255,0.08) 0%, transparent 70%)",
              borderRadius: "50%",
            }}
          />
          <p style={{
            fontSize: 9, color: "rgba(255,255,255,0.42)", fontWeight: 500,
            letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 4,
          }}>
            Welcome to
          </p>
          <h1 style={{
            fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.15, marginBottom: 6,
            background: "linear-gradient(135deg, #FDFDFD 30%, #C2D4DF 65%, #C8C4D8 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            position: "relative",
          }}>
            WorkPulse AI
          </h1>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.48)", fontWeight: 400, maxWidth: 260, margin: "0 auto 6px" }}>
            Understand the impact of AI on workplace well-being.
          </p>
          <p style={{ fontSize: 9, color: "rgba(255,255,255,0.26)", letterSpacing: "0.12em", fontWeight: 500 }}>
            Simulate&nbsp;•&nbsp;Analyze&nbsp;•&nbsp;Improve
          </p>
        </div>

        {/* Floating stat cards */}
        <div className="absolute z-10" style={{ left: "3%", top: "46%" }}>
          <StatCard icon="📊" label="Productivity" value="94%" sublabel="↑ +3% this month"/>
        </div>
        <div className="absolute z-10" style={{ right: "2%", top: "42%" }}>
          <StatCard icon="🧠" label="Stress Level" value="Elevated" sublabel="Score: 78 / 100"/>
        </div>
        <div className="absolute z-10" style={{ right: "2%", bottom: "12%" }}>
          <StatCard icon="🤖" label="AI Decision" value="Analysis in progress…"/>
        </div>

        {/* Footer */}
        <div className="relative z-10 mt-auto text-center" style={{ paddingBottom: 12, paddingLeft: 28, paddingRight: 28 }}>
          <p style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", letterSpacing: "0.04em" }}>
            WorkPulse AI — Professional Well-being Platform 2026
          </p>
        </div>
      </div>
    </div>
  );
}
