"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Mail,
  Loader2,
  CheckCircle2,
  Building2,
  Briefcase,
  Cpu,
  Sparkles,
  Send,
} from "lucide-react";

type Step = "email" | "verify" | "form" | "success";

const TEAM_SIZE_OPTIONS = [
  "Solo founder",
  "2-5 people",
  "6-20 people",
  "21-100 people",
  "100-500 people",
  "500+ people",
];

const INDUSTRY_OPTIONS = [
  "SaaS / Software",
  "Fintech",
  "Healthcare / Biotech",
  "E-commerce / Retail",
  "AI / Machine Learning",
  "Cybersecurity",
  "Education / EdTech",
  "Media / Entertainment",
  "Enterprise / B2B",
  "Other",
];

const INTEREST_OPTIONS = [
  "Autonomous software engineering",
  "Multi-agent team coordination",
  "Custom model training on our data",
  "Self-hosted / on-premise deployment",
  "Replacing or augmenting engineering team",
  "Building an AI-first startup",
  "Automated QA & security testing",
  "24/7 autonomous operations",
];

const BUDGET_OPTIONS = [
  "Under $1,000/mo",
  "$1,000 - $5,000/mo",
  "$5,000 - $20,000/mo",
  "$20,000 - $50,000/mo",
  "$50,000+/mo",
  "Not sure yet",
];

export default function EnterpriseApplyPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Form fields
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [industry, setIndustry] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [useCase, setUseCase] = useState("");
  const [website, setWebsite] = useState("");

  const handleSendOtp = async () => {
    if (!email || !email.includes("@")) {
      setError("Enter a valid email address");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/enterprise/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send verification code");
        return;
      }
      setStep("verify");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const code = otp.join("");
    if (code.length < 6) {
      setError("Enter the full 6-digit code");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/enterprise/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid code. Please try again.");
        return;
      }
      setStep("form");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      newOtp[i] = pasted[i] || "";
    }
    setOtp(newOtp);
    const focusIdx = Math.min(pasted.length, 5);
    otpRefs.current[focusIdx]?.focus();
  };

  const toggleInterest = (interest: string) => {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    );
  };

  const handleSubmitForm = async () => {
    if (!fullName.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!company.trim()) {
      setError("Please enter your company name");
      return;
    }
    if (!role.trim()) {
      setError("Please enter your role");
      return;
    }
    if (!teamSize) {
      setError("Please select your team size");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/enterprise/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          fullName,
          company,
          role,
          teamSize,
          industry,
          interests,
          budget,
          useCase,
          website,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to submit. Please try again.");
        return;
      }
      setStep("success");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08080f] text-white relative">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(99,102,241,0.1),transparent_60%)]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      {/* Nav */}
      <div className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6">
        <Link
          href="/enterprise"
          className="inline-flex items-center gap-2 text-[13px] text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Enterprise
        </Link>
        <Link href="/" className="text-[15px] font-semibold text-white">
          DevAgents
        </Link>
      </div>

      {/* Main content */}
      <div className="relative z-10 max-w-2xl mx-auto px-6 py-12 md:py-20">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-12">
          {["email", "verify", "form", "success"].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                  step === s
                    ? "bg-indigo-500 scale-125"
                    : ["email", "verify", "form", "success"].indexOf(step) > i
                    ? "bg-indigo-500/50"
                    : "bg-white/10"
                }`}
              />
              {i < 3 && (
                <div
                  className={`w-8 h-px transition-colors duration-300 ${
                    ["email", "verify", "form", "success"].indexOf(step) > i
                      ? "bg-indigo-500/40"
                      : "bg-white/[0.06]"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* STEP 1: Email */}
          {step === "email" && (
            <motion.div
              key="email"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-8">
                <Mail className="w-8 h-8 text-indigo-400" />
              </div>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-3">
                Get Early Access
              </h1>
              <p className="text-gray-500 text-[15px] mb-10 max-w-md mx-auto">
                Enter your work email and we&apos;ll send a verification code.
                Then tell us about your vision.
              </p>

              <div className="max-w-sm mx-auto">
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                    placeholder="you@company.com"
                    className="w-full px-5 py-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-gray-600 text-[15px] focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                  />
                </div>
                {error && (
                  <p className="text-red-400 text-[13px] mt-3 text-left">{error}</p>
                )}
                <button
                  onClick={handleSendOtp}
                  disabled={loading}
                  className="w-full mt-4 py-4 rounded-xl bg-white text-black font-medium text-[15px] hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Send Verification Code
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 2: OTP Verification */}
          {step === "verify" && (
            <motion.div
              key="verify"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-8">
                <CheckCircle2 className="w-8 h-8 text-violet-400" />
              </div>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-3">
                Check your inbox
              </h1>
              <p className="text-gray-500 text-[15px] mb-10">
                We sent a 6-digit code to{" "}
                <span className="text-gray-300">{email}</span>
              </p>

              <div className="flex items-center justify-center gap-3 mb-6">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    onPaste={i === 0 ? handleOtpPaste : undefined}
                    className="w-12 h-14 text-center text-xl font-semibold rounded-xl bg-white/[0.04] border border-white/[0.08] text-white focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                  />
                ))}
              </div>

              {error && (
                <p className="text-red-400 text-[13px] mb-4">{error}</p>
              )}

              <div className="max-w-sm mx-auto space-y-3">
                <button
                  onClick={handleVerifyOtp}
                  disabled={loading}
                  className="w-full py-4 rounded-xl bg-white text-black font-medium text-[15px] hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Verify & Continue
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setStep("email");
                    setOtp(["", "", "", "", "", ""]);
                    setError("");
                  }}
                  className="text-[13px] text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Use a different email
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Lead Generation Form */}
          {step === "form" && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              <div className="text-center mb-10">
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-3">
                  Tell us your vision
                </h1>
                <p className="text-gray-500 text-[15px]">
                  Help us understand what you&apos;re building so we can tailor your experience.
                </p>
              </div>

              <div className="space-y-8">
                {/* Section: You */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[12px] text-indigo-400 uppercase tracking-widest font-medium">
                    <Briefcase className="w-3.5 h-3.5" />
                    About You
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => { setFullName(e.target.value); setError(""); }}
                      placeholder="Full name *"
                      className="px-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-gray-600 text-[14px] focus:outline-none focus:border-indigo-500/50 transition-all"
                    />
                    <input
                      type="text"
                      value={role}
                      onChange={(e) => { setRole(e.target.value); setError(""); }}
                      placeholder="Your role (e.g. CTO, Founder) *"
                      className="px-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-gray-600 text-[14px] focus:outline-none focus:border-indigo-500/50 transition-all"
                    />
                  </div>
                </div>

                {/* Section: Company */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[12px] text-violet-400 uppercase tracking-widest font-medium">
                    <Building2 className="w-3.5 h-3.5" />
                    Your Company
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={company}
                      onChange={(e) => { setCompany(e.target.value); setError(""); }}
                      placeholder="Company name *"
                      className="px-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-gray-600 text-[14px] focus:outline-none focus:border-indigo-500/50 transition-all"
                    />
                    <input
                      type="text"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="Website (optional)"
                      className="px-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-gray-600 text-[14px] focus:outline-none focus:border-indigo-500/50 transition-all"
                    />
                  </div>

                  {/* Team size */}
                  <div>
                    <label className="block text-[13px] text-gray-400 mb-2">Team size *</label>
                    <div className="grid grid-cols-3 gap-2">
                      {TEAM_SIZE_OPTIONS.map((size) => (
                        <button
                          key={size}
                          onClick={() => { setTeamSize(size); setError(""); }}
                          className={`py-2.5 px-3 rounded-xl text-[13px] font-medium border transition-all ${
                            teamSize === size
                              ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300"
                              : "bg-white/[0.02] border-white/[0.06] text-gray-500 hover:bg-white/[0.04] hover:text-gray-300"
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Industry */}
                  <div>
                    <label className="block text-[13px] text-gray-400 mb-2">Industry</label>
                    <div className="flex flex-wrap gap-2">
                      {INDUSTRY_OPTIONS.map((ind) => (
                        <button
                          key={ind}
                          onClick={() => setIndustry(ind)}
                          className={`py-2 px-3.5 rounded-full text-[12px] font-medium border transition-all ${
                            industry === ind
                              ? "bg-violet-500/15 border-violet-500/30 text-violet-300"
                              : "bg-white/[0.02] border-white/[0.06] text-gray-500 hover:bg-white/[0.04] hover:text-gray-300"
                          }`}
                        >
                          {ind}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Section: Interests */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[12px] text-emerald-400 uppercase tracking-widest font-medium">
                    <Sparkles className="w-3.5 h-3.5" />
                    What Excites You
                  </div>
                  <p className="text-[13px] text-gray-500">Select all that apply</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {INTEREST_OPTIONS.map((interest) => (
                      <button
                        key={interest}
                        onClick={() => toggleInterest(interest)}
                        className={`text-left py-3 px-4 rounded-xl text-[13px] font-medium border transition-all ${
                          interests.includes(interest)
                            ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                            : "bg-white/[0.02] border-white/[0.06] text-gray-500 hover:bg-white/[0.04] hover:text-gray-300"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] transition-all ${
                              interests.includes(interest)
                                ? "bg-emerald-500/30 border-emerald-500/50 text-emerald-300"
                                : "border-white/[0.1]"
                            }`}
                          >
                            {interests.includes(interest) && "✓"}
                          </span>
                          {interest}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Section: Budget & Use case */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[12px] text-amber-400 uppercase tracking-widest font-medium">
                    <Cpu className="w-3.5 h-3.5" />
                    Scale & Vision
                  </div>

                  {/* Budget */}
                  <div>
                    <label className="block text-[13px] text-gray-400 mb-2">
                      Expected monthly budget
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {BUDGET_OPTIONS.map((b) => (
                        <button
                          key={b}
                          onClick={() => setBudget(b)}
                          className={`py-2.5 px-3 rounded-xl text-[12px] font-medium border transition-all ${
                            budget === b
                              ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                              : "bg-white/[0.02] border-white/[0.06] text-gray-500 hover:bg-white/[0.04] hover:text-gray-300"
                          }`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Use case */}
                  <div>
                    <label className="block text-[13px] text-gray-400 mb-2">
                      Describe what you want to build with DevAgents
                    </label>
                    <textarea
                      value={useCase}
                      onChange={(e) => setUseCase(e.target.value)}
                      placeholder="Tell us about your dream... What would you build if you had an infinite AI engineering team?"
                      rows={4}
                      className="w-full px-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-gray-600 text-[14px] focus:outline-none focus:border-indigo-500/50 transition-all resize-none"
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-red-400 text-[13px]">{error}</p>
                )}

                <button
                  onClick={handleSubmitForm}
                  disabled={loading}
                  className="w-full py-4 rounded-xl bg-white text-black font-medium text-[15px] hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Submit Application
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 4: Success */}
          {step === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="text-center py-20"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", bounce: 0.4 }}
                className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-8"
              >
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </motion.div>

              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-4">
                Application Received
              </h1>
              <p className="text-gray-400 text-[15px] max-w-md mx-auto mb-4">
                We&apos;re reviewing your application. Our team will reach out to{" "}
                <span className="text-gray-300">{email}</span> with next steps.
              </p>
              <p className="text-gray-600 text-[13px] mb-10">
                Priority access is granted based on use case alignment and vision.
              </p>

              <Link
                href="/enterprise"
                className="inline-flex items-center gap-2 px-6 py-3 text-[14px] font-medium text-gray-300 border border-white/10 rounded-full hover:bg-white/[0.05] transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Enterprise
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
