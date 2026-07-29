// src/features/auth/RegisterPage.tsx
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, ArrowRight, Check } from "lucide-react";
import Input from "@/components/ui/Input";
import logoSvgRaw from "@/assets/images/logo.svg?raw";
import Button from "@/components/ui/Button";
import StatCard from "@/components/ui/StatCard";
import AiMonitorIllustration from "@/components/illustrations/AiMonitorIllustration";
import { register } from "./registerApi";

function useLogoHtml(raw: string) {
  return raw
    .replace(/<path[^>]*fill="#FDFDFD"[^>]*\/>/, "")
    .replace(/width="\d+" height="\d+"/, 'width="100%" height="100%" viewBox="0 0 1536 1024" preserveAspectRatio="xMidYMid meet"');
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters",    pass: password.length >= 8 },
    { label: "Uppercase letter", pass: /[A-Z]/.test(password) },
    { label: "Number",           pass: /[0-9]/.test(password) },
  ];
  if (!password) return null;
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 5 }}>
      {checks.map(c => (
        <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <div style={{
            width: 12, height: 12, borderRadius: "50%",
            background: c.pass ? "#4C8C6B" : "#DCEAF2",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, transition: "background 0.2s",
          }}>
            {c.pass && <Check size={7} color="#fff" strokeWidth={3}/>}
          </div>
          <span style={{ fontSize: 10, color: c.pass ? "#4C8C6B" : "#A4BFCC" }}>{c.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function RegisterPage() {
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [showPw,    setShowPw]    = useState(false);
  const [showConf,  setShowConf]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const logoHtml       = useLogoHtml(logoSvgRaw);
  const passwordsMatch = confirm.length === 0 || password === confirm;
  const canSubmit      = !!firstName && !!lastName && !!email && !!password && password === confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setError(null);
    setLoading(true);
    try {
      await register({ firstName, lastName, email, password });
      navigate("/bureau");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }} className="h-screen w-screen flex overflow-hidden">

      {/* ══════ LEFT — register form ══════ */}
      <div
        className="w-full md:w-[42%] flex flex-col justify-center items-center overflow-y-auto relative"
        style={{ background: "linear-gradient(175deg, #EDF3F7 0%, #FDFDFD 38%)" }}
      >
        <div
          className="absolute top-0 inset-x-0 h-48 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 50% -10%, #D1E4EF 0%, transparent 68%)" }}
        />

        <div className="relative z-10 w-full" style={{ maxWidth: 396, padding: "22px 35px" }}>

          {/* Logo */}
          <div className="flex justify-center mb-4 relative">
            <div className="absolute pointer-events-none" style={{
              inset: "-18px",
              background: "radial-gradient(ellipse, #C2D4DF 0%, transparent 65%)",
              filter: "blur(18px)", borderRadius: "50%",
            }}/>
            <div
              style={{ height: 97, maxWidth: 286, width: "100%", position: "relative" }}
              dangerouslySetInnerHTML={{ __html: logoHtml }}
            />
          </div>

          <p className="text-center mb-5" style={{ fontSize: 13, color: "#7A96A8", letterSpacing: "0.01em" }}>
            Create your WorkPulse AI account
          </p>

          <form onSubmit={handleSubmit}>

            {/* First + Last name */}
            <div style={{ display: "flex", gap: 10, marginBottom: 11 }}>
              <div style={{ flex: 1 }}>
                <Input
                  id="firstName" label="First name"
                  value={firstName} onChange={setFirstName}
                  placeholder="Jane" autoComplete="given-name" required
                />
              </div>
              <div style={{ flex: 1 }}>
                <Input
                  id="lastName" label="Last name"
                  value={lastName} onChange={setLastName}
                  placeholder="Doe" autoComplete="family-name" required
                />
              </div>
            </div>

            {/* Work email */}
            <div style={{ marginBottom: 11 }}>
              <Input
                id="email" label="Work email" type="email"
                value={email} onChange={setEmail}
                placeholder="you@company.com" autoComplete="email" required
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 11 }}>
              <Input
                id="password" label="Password"
                type={showPw ? "text" : "password"}
                value={password} onChange={setPassword}
                placeholder="••••••••" autoComplete="new-password" required
                trailing={
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#8AAAB8", display: "flex" }}>
                    {showPw ? <EyeOff size={14}/> : <Eye size={14}/>}
                  </button>
                }
              />
              <PasswordStrength password={password}/>
            </div>

            {/* Confirm password */}
            <div style={{ marginBottom: 16 }}>
              <Input
                id="confirm" label="Confirm password"
                type={showConf ? "text" : "password"}
                value={confirm} onChange={setConfirm}
                placeholder="••••••••" autoComplete="new-password" required
                trailing={
                  <button type="button" onClick={() => setShowConf(v => !v)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#8AAAB8", display: "flex" }}>
                    {showConf ? <EyeOff size={14}/> : <Eye size={14}/>}
                  </button>
                }
              />
              {!passwordsMatch && (
                <p style={{ fontSize: 10, color: "#C0505A", marginTop: 4 }}>Passwords do not match.</p>
              )}
            </div>

            {error && (
              <p style={{ fontSize: 12, color: "#C0505A", marginBottom: 11, textAlign: "center" }}>{error}</p>
            )}

            <Button type="submit" loading={loading} disabled={!canSubmit}>
              CREATE ACCOUNT <ArrowRight size={14}/>
            </Button>
          </form>

          {/* Terms */}
          <p style={{ fontSize: 10, textAlign: "center", color: "#A4BFCC", margin: "11px 0 13px" }}>
            By registering you agree to our{" "}
            <button type="button" style={{ fontWeight: 600, color: "#476A82", background: "none", border: "none", cursor: "pointer", fontSize: 10 }}>
              Terms of Service
            </button>
            {" "}and{" "}
            <button type="button" style={{ fontWeight: 600, color: "#476A82", background: "none", border: "none", cursor: "pointer", fontSize: 10 }}>
              Privacy Policy
            </button>.
          </p>

          <p style={{ fontSize: 11, textAlign: "center", color: "#A4BFCC" }}>
            Already have an account?{" "}
            <Link to="/login" style={{ fontWeight: 600, color: "#445D72", textDecoration: "none" }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* ══════ RIGHT — illustration (same as LoginPage) ══════ */}
      <div
        className="hidden md:flex flex-col relative overflow-hidden"
        style={{ width: "58%", background: "linear-gradient(145deg, #3C5D76 0%, #2B4358 52%, #324F64 100%)" }}
      >
        <AiMonitorIllustration/>

        <div className="relative z-10 text-center" style={{ paddingTop: 24, paddingLeft: 28, paddingRight: 28 }}>
          <div className="absolute pointer-events-none" style={{
            left: "50%", transform: "translateX(-50%)",
            width: 220, height: 70, top: 16,
            background: "radial-gradient(ellipse, rgba(255,255,255,0.08) 0%, transparent 70%)",
            borderRadius: "50%",
          }}/>
          <p style={{ fontSize: 9, color: "rgba(255,255,255,0.42)", fontWeight: 500, letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 4 }}>
            Join today
          </p>
          <h1 style={{
            fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.15, marginBottom: 6,
            background: "linear-gradient(135deg, #FDFDFD 30%, #C2D4DF 65%, #C8C4D8 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", position: "relative",
          }}>
            WorkPulse AI
          </h1>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.48)", fontWeight: 400, maxWidth: 260, margin: "0 auto 6px" }}>
            Monitor well-being, understand AI impact, and build healthier teams.
          </p>
          <p style={{ fontSize: 9, color: "rgba(255,255,255,0.26)", letterSpacing: "0.12em", fontWeight: 500 }}>
            Simulate&nbsp;•&nbsp;Analyze&nbsp;•&nbsp;Improve
          </p>
        </div>

        <div className="absolute z-10" style={{ left: "3%", top: "46%" }}>
          <StatCard icon="📊" label="Productivity" value="94%" sublabel="↑ +3% this month"/>
        </div>
        <div className="absolute z-10" style={{ right: "2%", top: "42%" }}>
          <StatCard icon="🧠" label="Stress Level" value="Elevated" sublabel="Score: 78 / 100"/>
        </div>
        <div className="absolute z-10" style={{ right: "2%", bottom: "12%" }}>
          <StatCard icon="🤖" label="AI Decision" value="Analysis in progress…"/>
        </div>

        <div className="relative z-10 mt-auto text-center" style={{ paddingBottom: 12, paddingLeft: 28, paddingRight: 28 }}>
          <p style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", letterSpacing: "0.04em" }}>
            WorkPulse AI — Professional Well-being Platform 2026
          </p>
        </div>
      </div>
    </div>
  );
}
