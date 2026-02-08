"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Eye, EyeOff, Mail, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";

export default function AuthPageClient() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const { signIn, signUp } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const verifiedParam = searchParams.get("verified");
    const errorParam = searchParams.get("error");
    if (verifiedParam === "true") {
      setVerified(true);
      setMode("login");
    }
    if (errorParam) {
      setError(errorParam);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    if (mode === "login") {
      const result = await signIn(email, password);
      setSubmitting(false);
      if (result.error) {
        setError(result.error);
      } else {
        router.push("/");
      }
    } else {
      const result = await signUp(email, password, fullName);
      setSubmitting(false);
      if (result.error) {
        setError(result.error);
      } else if (result.needsVerification) {
        setVerificationSent(true);
      } else {
        router.push("/");
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] relative overflow-hidden flex items-center justify-center">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-white via-[#f5f5ff] to-[#f0f0ff]" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-100/40 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-100/30 rounded-full blur-3xl" />

      {/* Back to home */}
      <Link
        href="/"
        className="absolute top-8 left-8 z-20 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      {/* Auth card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="bg-white/70 backdrop-blur-2xl border border-white/50 rounded-3xl shadow-[0_8px_60px_-12px_rgba(99,102,241,0.12)] p-10">
            {/* Logo */}
            <div className="text-center mb-8">
              <Link href="/" className="inline-block">
                <span className="text-xl font-semibold tracking-tight text-gray-900">
                  Dev<span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">Agents</span>
                </span>
              </Link>
            </div>

            {verificationSent ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-4"
              >
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                  <Mail className="w-8 h-8 text-indigo-500" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                  Check your email
                </h2>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                  We sent a verification link to<br />
                  <span className="font-medium text-gray-700">{email}</span>
                </p>
                <p className="text-xs text-gray-400 mb-6">
                  Click the link in the email to verify your account, then sign in.
                </p>
                <button
                  onClick={() => {
                    setVerificationSent(false);
                    setMode("login");
                    setPassword("");
                  }}
                  className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
                >
                  Back to Sign In
                </button>
              </motion.div>
            ) : (
              <>
                <p className="text-center text-sm text-gray-500 mb-8">
                  {mode === "login" ? "Welcome back" : "Create your account"}
                </p>

                {verified && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 px-4 py-2.5 rounded-xl mb-6"
                  >
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    Email verified. You can now sign in.
                  </motion.div>
                )}

                {/* Tab switcher */}
                <div className="flex bg-gray-100/80 rounded-xl p-1 mb-8">
                  {(["login", "signup"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => { setMode(m); setError(""); setVerified(false); }}
                      className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                        mode === m
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {m === "login" ? "Sign In" : "Sign Up"}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <AnimatePresence mode="wait">
                    {mode === "signup" && (
                      <motion.div
                        key="name"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">
                          Full Name
                        </label>
                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Your name"
                          className="w-full px-4 py-3 bg-gray-50/80 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full px-4 py-3 bg-gray-50/80 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min 6 characters"
                        required
                        minLength={6}
                        className="w-full px-4 py-3 pr-12 bg-gray-50/80 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm text-red-500 bg-red-50 px-4 py-2.5 rounded-xl"
                    >
                      {error}
                    </motion.p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white text-sm font-medium rounded-xl transition-all duration-200 mt-6"
                  >
                    {submitting ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        {mode === "login" ? "Sign In" : "Create Account"}
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            By continuing, you agree to our Terms of Service
          </p>
      </motion.div>
    </div>
  );
}
