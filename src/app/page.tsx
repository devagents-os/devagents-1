"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { ArrowRight, ChevronRight, Check, User, LogOut } from "lucide-react";
import { ROOMS, RoomConfig } from "@/lib/rooms";
import { useAuth } from "@/lib/authContext";

const Room3D = dynamic(() => import("@/components/Room3D"), { ssr: false });

const ROLES = [
  { id: "architect", label: "Architect" },
  { id: "operator", label: "Operator" },
  { id: "creator", label: "Creator" },
  { id: "analyst", label: "Analyst" },
  { id: "hacker", label: "Hacker" },
] as const;

const CAPABILITIES = [
  {
    title: "Recursive Reasoning",
    description:
      "It doesn't guess. It builds chains of logic, tests each link, and arrives at solutions with quiet certainty.",
  },
  {
    title: "Sovereign Autonomy",
    description:
      "Give it a goal. Walk away. It plans, executes, adapts, and delivers — without asking for permission.",
  },
  {
    title: "Collaborative Intelligence",
    description:
      "It reads your intent. It anticipates your direction. It works alongside you like a second mind.",
  },
  {
    title: "Execution at Scale",
    description:
      "From a single function to an entire codebase. It operates at every resolution without losing focus.",
  },
];

function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrame: number;
    const particles: { x: number; y: number; vx: number; vy: number; size: number; opacity: number }[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.15 + 0.05,
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(99, 102, 241, ${p.opacity})`;
        ctx.fill();
      });
      animFrame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
}

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const { user, signOut } = useAuth();
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ${
        scrolled ? "top-3" : "top-6"
      }`}
    >
      <div
        className={`glass-nav rounded-full px-2 py-1.5 flex items-center gap-1 shadow-lg shadow-black/[0.03] transition-all duration-500 ${
          scrolled ? "scale-[0.97]" : ""
        }`}
      >
        <Link
          href="/"
          className="px-4 py-2 text-[15px] font-semibold tracking-tight text-gray-900"
        >
          DevAgents
        </Link>

        <div className="w-px h-4 bg-gray-200 mx-1" />

          <Link
            href="/enterprise"
            className="px-3.5 py-2 text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors rounded-full hover:bg-black/[0.03]"
          >
            Enterprise
          </Link>
        <Link
          href="/product"
          className="px-3.5 py-2 text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors rounded-full hover:bg-black/[0.03]"
        >
          Product
        </Link>
        <Link
          href="#pricing"
          className="px-3.5 py-2 text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors rounded-full hover:bg-black/[0.03]"
        >
          Pricing
        </Link>
        <Link
          href="/docs"
          className="px-3.5 py-2 text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors rounded-full hover:bg-black/[0.03]"
        >
          Docs
        </Link>

        <div className="w-px h-4 bg-gray-200 mx-1" />

        {user ? (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium text-gray-700 rounded-full hover:bg-black/[0.03] transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="max-w-[100px] truncate">{user.fullName || user.email.split("@")[0]}</span>
            </button>
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-48 bg-white/90 backdrop-blur-xl rounded-xl border border-gray-200/50 shadow-xl shadow-black/[0.06] overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  </div>
                  <Link
                    href="/workspace"
                    onClick={() => setShowMenu(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Workspace
                  </Link>
                  <button
                    onClick={() => { signOut(); setShowMenu(false); }}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50/50 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <Link
            href="/auth"
            className="px-5 py-2 text-[13px] font-medium text-white bg-gray-900 rounded-full hover:bg-gray-800 transition-colors"
          >
            Try Agent
          </Link>
        )}
      </div>
    </motion.nav>
  );
}

function HeroSection() {
  const [activeRole, setActiveRole] = useState<string>("architect");
  const roomConfig = ROOMS.find((r) => r.id === activeRole) || ROOMS[0];
  const dummyAgentState = {
    position: { x: 0, y: 0, z: 0.5 },
    rotation: 0,
    currentAction: "LOOK_AROUND",
    currentTask: null,
    thoughts: [],
    isProcessing: false,
    isTyping: false,
    isScrolling: false,
    mood: "curious",
  };

      return (
        <section className="relative min-h-screen flex items-center overflow-hidden">
          {/* Subtle gradient background */}
          <div className="absolute inset-0 bg-mesh pointer-events-none" />

        <div className="relative z-10 w-full max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 items-center px-6 md:px-12 lg:px-20">
          {/* Left: Text content */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col justify-center py-20 lg:py-0"
          >
              <h1
                className="leading-[1.05] tracking-[-0.02em]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                <span className="block text-5xl md:text-6xl lg:text-[5.5rem] font-light text-[#2d2b3a]">
                  DevAgents
                </span>
                <span className="block text-5xl md:text-6xl lg:text-[5.5rem] font-light text-gradient-hero">
                  Intelligence at Work
                </span>
              </h1>
              <p className="mt-8 text-[16px] md:text-[17px] leading-[1.7] text-[#9a95a3] max-w-[440px] font-light">
                The AI software engineer that reasons, builds, and ships.
                Quietly. Autonomously. At scale.
              </p>

              {/* Role Switcher */}
              <div className="mt-10">
                <div className="glass-card rounded-full p-1 flex gap-0.5 w-fit">
                  {ROLES.map((role) => (
                    <button
                      key={role.id}
                      onClick={() => setActiveRole(role.id)}
                      className={`relative px-5 py-2.5 text-[13px] font-medium rounded-full transition-all duration-300 ${
                        activeRole === role.id
                          ? "text-white"
                          : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {activeRole === role.id && (
                        <motion.div
                          layoutId="activeRole"
                          className="absolute inset-0 bg-gray-900 rounded-full"
                          transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                        />
                      )}
                      <span className="relative z-10">{role.label}</span>
                    </button>
                  ))}
              </div>
            </div>
          </motion.div>

          {/* Right: 3D Room - contained size like reference */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full h-[350px] md:h-[420px] lg:h-[480px] flex items-center justify-center"
          >
            <Room3D
              agentState={dummyAgentState}
              onAgentPositionChange={() => {}}
              wireframe={false}
              showAgentView={false}
              focusOnAgent={false}
              roomConfig={roomConfig}
              disableZoom
            />
          </motion.div>
        </div>

          {/* Scroll indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2"
          >
            <motion.div
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-5 h-8 rounded-full border-2 border-gray-300 flex items-start justify-center pt-1.5"
            >
              <div className="w-1 h-1.5 bg-gray-400 rounded-full" />
            </motion.div>
          </motion.div>
        </section>
  );
}

function CapabilitiesSection() {
  const [active, setActive] = useState(0);
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [60, -60]);

  return (
    <section
      ref={sectionRef}
      className="relative py-32 md:py-48 px-6 max-w-7xl mx-auto"
    >
      <motion.div
        style={{ y }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center"
      >
        {/* Left: Typography + storytelling */}
        <div>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-[13px] font-medium text-indigo-500 tracking-widest uppercase mb-4"
          >
            Capabilities
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-gray-900 leading-[1.05] mb-12"
          >
            The best AI
            <br />
            software engineer
            <br />
            <span className="text-gray-300">on earth.</span>
          </motion.h2>

          <div className="space-y-0">
            {CAPABILITIES.map((cap, i) => (
              <motion.button
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.15 * i }}
                onClick={() => setActive(i)}
                className={`w-full text-left py-5 border-t border-gray-100 transition-all duration-300 group ${
                  active === i ? "" : "opacity-50 hover:opacity-80"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`mt-1.5 w-2 h-2 rounded-full transition-colors duration-300 ${
                      active === i ? "bg-indigo-500" : "bg-gray-200"
                    }`}
                  />
                  <div>
                    <h3 className="text-xl md:text-2xl font-medium text-gray-900 mb-1">
                      {cap.title}
                    </h3>
                    <AnimatePresence>
                      {active === i && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                          className="text-[15px] text-gray-400 leading-relaxed max-w-md"
                        >
                          {cap.description}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Right: Premium visual */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative hidden lg:flex items-center justify-center"
        >
          <div className="relative w-full aspect-square max-w-lg">
            {/* Concentric rings */}
            {[1, 0.75, 0.5, 0.25].map((scale, i) => (
              <motion.div
                key={i}
                animate={{ rotate: i % 2 === 0 ? 360 : -360 }}
                transition={{
                  duration: 30 + i * 10,
                  repeat: Infinity,
                  ease: "linear",
                }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <div
                  className="rounded-full border border-gray-100"
                  style={{
                    width: `${scale * 100}%`,
                    height: `${scale * 100}%`,
                    opacity: 0.4 + i * 0.15,
                  }}
                />
              </motion.div>
            ))}
            {/* Center glow */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 blur-2xl opacity-60" />
              <div className="absolute w-4 h-4 rounded-full bg-indigo-500/60" />
            </div>
            {/* Floating data points */}
            {[0, 72, 144, 216, 288].map((deg, i) => (
              <motion.div
                key={i}
                animate={{ y: [-4, 4, -4] }}
                transition={{ duration: 3 + i, repeat: Infinity }}
                className="absolute"
                style={{
                  top: `${50 + 35 * Math.sin((deg * Math.PI) / 180)}%`,
                  left: `${50 + 35 * Math.cos((deg * Math.PI) / 180)}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div className="w-2 h-2 rounded-full bg-indigo-400/40" />
              </motion.div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

function MultiAgentSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const elevatorY = useTransform(scrollYProgress, [0.2, 0.8], [0, -120]);

  const floors = [
    { label: "Strategy", color: "from-indigo-500/10 to-indigo-500/5" },
    { label: "Architecture", color: "from-violet-500/10 to-violet-500/5" },
    { label: "Engineering", color: "from-blue-500/10 to-blue-500/5" },
    { label: "Quality", color: "from-cyan-500/10 to-cyan-500/5" },
    { label: "Deployment", color: "from-emerald-500/10 to-emerald-500/5" },
  ];

  return (
    <section
      ref={sectionRef}
      id="enterprise"
      className="relative py-32 md:py-48 px-6"
    >
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-[13px] font-medium text-violet-500 tracking-widest uppercase mb-4"
          >
            Multi-Agent Ecosystem
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-gray-900 leading-[1.05]"
          >
            An entire engineering
            <br />
            <span className="text-gray-300">organization. In one system.</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="mt-6 text-lg text-gray-400 max-w-xl mx-auto font-light"
          >
            Agents coordinate across floors. They share context through doors. They move through glass elevators. Architecture, not chaos.
          </motion.p>
        </div>

        {/* Tower Visualization */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative max-w-md mx-auto"
        >
          <div className="relative">
            {/* Glass elevator shaft */}
            <div className="absolute left-8 top-0 bottom-0 w-12 border border-gray-100 rounded-lg bg-gradient-to-b from-indigo-50/50 to-transparent" />
            <motion.div
              style={{ y: elevatorY }}
              className="absolute left-9 w-10 h-16 rounded-md bg-white border border-indigo-200 shadow-lg shadow-indigo-100/50 z-10 flex items-center justify-center"
            >
              <div className="w-3 h-3 rounded-full bg-indigo-500/60" />
            </motion.div>

            {/* Floors */}
            <div className="space-y-3 pl-24">
              {floors.map((floor, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className={`relative glass-card rounded-2xl p-5 bg-gradient-to-r ${floor.color}`}
                >
                  {/* Door indicator */}
                  <div className="absolute -left-6 top-1/2 -translate-y-1/2 w-3 h-6 rounded-r border border-l-0 border-gray-200 bg-white" />

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-0.5">
                        Floor {floors.length - i}
                      </div>
                      <div className="text-[15px] font-medium text-gray-800">
                        {floor.label}
                      </div>
                    </div>
                    {/* Agent dots */}
                    <div className="flex gap-1.5">
                      {[...Array(3 - Math.floor(i / 2))].map((_, j) => (
                        <motion.div
                          key={j}
                          animate={{ opacity: [0.4, 1, 0.4] }}
                          transition={{
                            duration: 2,
                            delay: j * 0.5,
                            repeat: Infinity,
                          }}
                          className="w-2 h-2 rounded-full bg-indigo-400"
                        />
                      ))}
                    </div>
                  </div>

                  {/* Communication flow line */}
                  {i < floors.length - 1 && (
                    <motion.div
                      animate={{ opacity: [0.1, 0.3, 0.1] }}
                      transition={{ duration: 3, repeat: Infinity }}
                      className="absolute -bottom-2 left-1/2 w-px h-4 bg-gradient-to-b from-gray-200 to-transparent"
                    />
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

const TOKEN_TIERS = [
  { tokens: "1M", price: 19 },
  { tokens: "2M", price: 29 },
  { tokens: "4M", price: 49 },
  { tokens: "8M", price: 79 },
  { tokens: "16M", price: 129 },
  { tokens: "32M", price: 199 },
];

function ModelLogo({ name, size = 28 }: { name: string; size?: number }) {
  const logos: Record<string, { bg: string; letter: string; color: string }> = {
    LLAMA: { bg: "bg-blue-100", letter: "L", color: "text-blue-600" },
    "GROQ Compound": { bg: "bg-orange-100", letter: "G", color: "text-orange-600" },
    Gemini: { bg: "bg-blue-100", letter: "G", color: "text-blue-500" },
    DeepSeek: { bg: "bg-indigo-100", letter: "D", color: "text-indigo-600" },
    Mistral: { bg: "bg-amber-100", letter: "M", color: "text-amber-600" },
    "Z.ai": { bg: "bg-gray-100", letter: "Z", color: "text-gray-800" },
    OpenAI: { bg: "bg-gray-900", letter: "O", color: "text-white" },
    Claude: { bg: "bg-orange-50", letter: "C", color: "text-orange-700" },
    Grok: { bg: "bg-gray-100", letter: "X", color: "text-gray-900" },
    Kimi: { bg: "bg-violet-100", letter: "K", color: "text-violet-600" },
  };
  const l = logos[name] || { bg: "bg-gray-100", letter: "?", color: "text-gray-500" };
  return (
    <div
      className={`${l.bg} rounded-full flex items-center justify-center ${l.color} font-semibold text-xs`}
      style={{ width: size, height: size }}
      title={name}
    >
      {l.letter}
    </div>
  );
}

function PricingSection() {
  const [selectedTier, setSelectedTier] = useState(0);

  return (
    <section id="pricing" className="relative py-32 md:py-48 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-20">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-[13px] font-medium text-gray-400 tracking-widest uppercase mb-4"
          >
            Pricing
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-semibold tracking-tight text-gray-900"
          >
            Simple. Honest. Scalable.
          </motion.h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {/* FREE */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0 }}
            className="glass-card rounded-3xl p-8 flex flex-col"
          >
            <div className="mb-8">
              <h3 className="text-lg font-medium text-gray-900 mb-1">Free</h3>
              <div className="text-4xl font-semibold text-gray-900">$0</div>
              <p className="text-sm text-gray-400 mt-2">For exploring what&apos;s possible</p>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {["3 core agent capabilities", "100K credits per month", "Community support"].map(
                (f, i) => (
                  <li key={i} className="flex items-start gap-3 text-[14px] text-gray-600">
                    <Check size={16} className="text-gray-300 mt-0.5 shrink-0" />
                    {f}
                  </li>
                )
              )}
            </ul>

            <div className="flex gap-2 mb-6">
              <ModelLogo name="LLAMA" />
              <ModelLogo name="GROQ Compound" />
            </div>

            <Link
              href="/workspace"
              className="w-full py-3 text-center text-[14px] font-medium text-gray-700 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors"
            >
              Get Started
            </Link>
          </motion.div>

          {/* PRO */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="relative glass-card rounded-3xl p-8 flex flex-col ring-2 ring-gray-900"
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gray-900 text-white text-[11px] font-medium tracking-wider uppercase rounded-full">
              Best Value
            </div>

            <div className="mb-8">
              <h3 className="text-lg font-medium text-gray-900 mb-1">Pro</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-semibold text-gray-900">
                  ${TOKEN_TIERS[selectedTier].price}
                </span>
                <span className="text-sm text-gray-400">/mo</span>
              </div>
              <p className="text-sm text-gray-400 mt-2">Beta pricing. Lock it in.</p>
            </div>

            {/* Token tier selector */}
            <div className="mb-6">
              <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-2">
                Token allocation
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {TOKEN_TIERS.map((tier, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedTier(i)}
                    className={`py-1.5 px-2 text-[12px] rounded-lg transition-all ${
                      selectedTier === i
                        ? "bg-gray-900 text-white font-medium"
                        : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {tier.tokens}
                  </button>
                ))}
              </div>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {[
                "Advanced reasoning",
                "Multi-Agent Ecosystem",
                "Immersive 3D Experience",
                "Priority intelligence upgrades",
              ].map((f, i) => (
                <li key={i} className="flex items-start gap-3 text-[14px] text-gray-600">
                  <Check size={16} className="text-indigo-500 mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            <div className="flex gap-2 mb-6">
              {["Gemini", "DeepSeek", "Mistral", "Z.ai"].map((m) => (
                <ModelLogo key={m} name={m} />
              ))}
            </div>

            <Link
              href="/workspace"
              className="w-full py-3 text-center text-[14px] font-medium text-white bg-gray-900 rounded-full hover:bg-gray-800 transition-colors"
            >
              Start Building
            </Link>
          </motion.div>

          {/* ULTRA */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="glass-card rounded-3xl p-8 flex flex-col relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-violet-50/50 to-indigo-50/30 pointer-events-none" />

            <div className="mb-8 relative">
              <h3 className="text-lg font-medium text-gray-900 mb-1">Ultra</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-semibold text-gray-900">$1,950</span>
                <span className="text-sm text-gray-400">/mo</span>
              </div>
              <p className="text-sm text-violet-400 mt-2">Coming Soon</p>
            </div>

            <ul className="space-y-3 mb-8 flex-1 relative">
              {[
                "Agents replacing junior engineers",
                "Autonomous project execution",
                "Self-coordinating agent teams",
                "Long-term organizational memory",
                "Strategic reasoning at company scale",
              ].map((f, i) => (
                <li key={i} className="flex items-start gap-3 text-[14px] text-gray-600">
                  <Check size={16} className="text-violet-400 mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            <div className="flex gap-2 mb-6 relative">
              {["OpenAI", "Claude", "Grok", "Kimi"].map((m) => (
                <ModelLogo key={m} name={m} />
              ))}
            </div>

            <button
              disabled
              className="relative w-full py-3 text-center text-[14px] font-medium text-violet-600 border border-violet-200 rounded-full bg-violet-50/50 cursor-not-allowed"
            >
              Join Waitlist
            </button>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-gray-100 py-16 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="text-[15px] font-semibold text-gray-900">DevAgents</div>
        <div className="flex gap-8 text-[13px] text-gray-400">
          <Link href="/product" className="hover:text-gray-600 transition-colors">
            Product
          </Link>
          <Link href="#pricing" className="hover:text-gray-600 transition-colors">
            Pricing
          </Link>
          <Link href="/docs" className="hover:text-gray-600 transition-colors">
            Docs
          </Link>
            <Link href="/enterprise" className="hover:text-gray-600 transition-colors">
              Enterprise
            </Link>
        </div>
        <div className="text-[12px] text-gray-300">
          2026 DevAgents. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-gray-900 font-[var(--font-sans)] overflow-x-hidden">
      <ParticleField />
      <Navbar />
      <HeroSection />
      <CapabilitiesSection />
      <MultiAgentSection />
      <PricingSection />
      <Footer />
    </div>
  );
}
