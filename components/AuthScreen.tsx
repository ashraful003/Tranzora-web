"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { isLoggedIn, login, registerAccount, resetPassword, StoreError, useDb, userByEmail } from "@/lib/db/store";
import type { Screen } from "@/lib/screens";
import { Icon, Logo } from "./ui";

const REMEMBER_KEY = "tranzora_remember_email";
const DEMO_OTP = "123456";

export default function AuthScreen({ screen, onLoginSuccess }: { screen: Screen; onLoginSuccess?: () => void }) {
  const router = useRouter();
  const sp = useSearchParams();
  useDb(); // make sure the demo users exist before the first sign-in
  const isLogin = screen.code === "1.1";
  const isRegister = screen.code === "1.2";
  const isForgot = screen.code === "1.3";
  const isOtp = screen.code === "1.4";

  const [email, setEmail] = useState(sp.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [company, setCompany] = useState("");
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpOk, setOtpOk] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [done, setDone] = useState("");
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isLogin) {
      try {
        setEmail(localStorage.getItem(REMEMBER_KEY) ?? "admin@tranzora.com");
      } catch {
        setEmail("admin@tranzora.com");
      }
      setPassword("");
    }
  }, [isLogin]);

  useEffect(() => {
    if (!isLogin && isLoggedIn() && (isRegister || isForgot)) setInfo("You are already signed in — continue to the dashboard or use another account.");
  }, [isLogin, isRegister, isForgot]);

  const goHome = () => {
    if (onLoginSuccess) onLoginSuccess();
    else router.push("/");
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isLogin) {
        login(email, password);
        try {
          if (remember) localStorage.setItem(REMEMBER_KEY, email);
          else localStorage.removeItem(REMEMBER_KEY);
        } catch {
          /* ignore */
        }
        goHome();
        return;
      }
      if (isRegister) {
        if (password.length < 6) throw new StoreError("Password must be at least 6 characters");
        registerAccount({ name: `${first.trim()} ${last.trim()}`.trim(), email: email.trim(), password, company: company.trim() || undefined });
        setDone("Account created — you are signed in.");
        return;
      }
      if (isForgot) {
        if (!userByEmail(email)) throw new StoreError("No account uses this email address");
        router.push(`/screens/004-otp-verification?email=${encodeURIComponent(email.trim())}`);
        return;
      }
      if (isOtp) {
        if (!otpOk) {
          if (otp.join("") !== DEMO_OTP) throw new StoreError("The code is incorrect. In this demo the code is 123456.");
          setOtpOk(true);
          if (!email) setDone("Code verified.");
          return;
        }
        if (newPass.length < 6) throw new StoreError("Password must be at least 6 characters");
        resetPassword(email, newPass);
        setDone("Password updated — log in with your new password.");
      }
    } catch (err) {
      setError(err instanceof StoreError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const setDigit = (i: number, val: string) => {
    const d = val.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[i] = d;
    setOtp(next);
    setError("");
    if (d && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const heading = isLogin ? "Welcome back!" : isRegister ? "Start your transport workspace." : isOtp ? "Verify your identity." : "Forgot your password?";

  return (
    <main className="auth-page">
      <section className="auth-brand">
        <Link href="/" className="brand brand-large">
          <Logo />
          <span>Tranzora TMS</span>
        </Link>
        <div className="auth-message">
          <span className="auth-pill">TRANSPORT MANAGEMENT, SIMPLIFIED</span>
          <h1>{heading}</h1>
          <p>Trips, fleet, drivers, fuel, maintenance, billing and accounts — in one workspace that runs right in your browser.</p>
          <div className="auth-illustration">
            <span className="building b1" />
            <span className="building b2" />
            <span className="building b3" />
            <span className="road-art" />
            <span className="bus-art">▰</span>
          </div>
          <div className="auth-features">
            <span>
              <i className="blue">
                <Icon name="report" />
              </i>
              19 modules
            </span>
            <span>
              <i className="green">
                <Icon name="check" />
              </i>
              Works offline
            </span>
            <span>
              <i className="violet">
                <Icon name="map" />
              </i>
              Live tracking
            </span>
          </div>
        </div>
        <p className="auth-copyright">© 2026 Tranzora Transport Management System.</p>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form-card">
          <div className="mobile-brand">
            <Logo />
            <b>Tranzora TMS</b>
          </div>
          <span className="eyebrow">ENTERPRISE TRANSPORT PORTAL</span>
          <h2>{isLogin ? "Log in to your account" : isOtp && otpOk && email ? "Choose a new password" : screen.title}</h2>
          <p>{isOtp && email ? `Enter the 6-digit code sent to ${email}.` : screen.description}</p>

          {done ? (
            <div className="success-card">
              <span>
                <Icon name="check" size={26} />
              </span>
              <h3>{done}</h3>
              {isRegister ? (
                <button type="button" onClick={goHome} className="primary button-link">
                  Continue to dashboard
                </button>
              ) : (
                <Link href="/" className="primary button-link">
                  Go to log in
                </Link>
              )}
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              {info && <p className="rx-info">{info}</p>}
              {isRegister && (
                <>
                  <div className="form-grid">
                    <label>
                      First name
                      <input required value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" />
                    </label>
                    <label>
                      Last name
                      <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" />
                    </label>
                  </div>
                  <label>
                    Company name
                    <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Al Amin Transport Ltd." />
                  </label>
                </>
              )}
              {!isOtp && (
                <label>
                  Email address
                  <input required type="email" value={email} onChange={(e) => (setEmail(e.target.value), setError(""))} placeholder="name@company.com" autoComplete="email" />
                </label>
              )}
              {(isLogin || isRegister) && (
                <label>
                  Password
                  <div className="password-input">
                    <input required minLength={6} type={show ? "text" : "password"} value={password} onChange={(e) => (setPassword(e.target.value), setError(""))} placeholder={isLogin ? "Enter your password" : "At least 6 characters"} autoComplete={isLogin ? "current-password" : "new-password"} />
                    <button type="button" onClick={() => setShow(!show)}>
                      {show ? "Hide" : "Show"}
                    </button>
                  </div>
                </label>
              )}
              {isOtp && !otpOk && (
                <>
                  <div className="otp-inputs">
                    {otp.map((d, n) => (
                      <input
                        key={n}
                        ref={(el) => {
                          otpRefs.current[n] = el;
                        }}
                        aria-label={`Digit ${n + 1}`}
                        inputMode="numeric"
                        maxLength={1}
                        value={d}
                        onChange={(e) => setDigit(n, e.target.value)}
                        onKeyDown={(e) => e.key === "Backspace" && !otp[n] && n > 0 && otpRefs.current[n - 1]?.focus()}
                        onPaste={(e) => {
                          const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6).split("");
                          if (digits.length) {
                            e.preventDefault();
                            setOtp([...digits, ...Array(6 - digits.length).fill("")]);
                          }
                        }}
                      />
                    ))}
                  </div>
                  <p className="rx-hint">Demo code: 123456</p>
                </>
              )}
              {isOtp && otpOk && email && (
                <label>
                  New password
                  <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} minLength={6} autoFocus autoComplete="new-password" />
                </label>
              )}
              {isLogin && (
                <div className="remember">
                  <label>
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me
                  </label>
                  <Link href="/screens/003-forgot-password">Forgot password?</Link>
                </div>
              )}
              {error && <p className="rx-error rx-error-block">{error}</p>}
              <button className="primary auth-submit" disabled={busy}>
                {isLogin ? "Log in" : isRegister ? "Create account" : isOtp ? (otpOk && email ? "Save new password" : "Verify code") : "Send reset code"}
              </button>
              {isLogin && <p className="rx-hint rx-center">Demo login: admin@tranzora.com / tranzora123</p>}
              {isOtp && !otpOk && (
                <button type="button" className="rx-link rx-center" onClick={() => setInfo(`A new code was sent${email ? ` to ${email}` : ""}. (Demo code: 123456)`)}>
                  Resend code
                </button>
              )}
              <p className="auth-switch">
                {isLogin ? "Don't have an account?" : "Already have an account?"} <Link href={isLogin ? "/screens/002-register" : "/"}>{isLogin ? "Sign up" : "Log in"}</Link>
              </p>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
