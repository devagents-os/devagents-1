"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Brain,
  Cpu,
  BarChart3,
  Palette,
  Shield,
  Users,
  Zap,
  Building2,
  Rocket,
  Globe,
  Layers,
  GitBranch,
  MessageSquare,
  Eye,
  ChevronDown,
  Sparkles,
  Target,
  TrendingUp,
  Server,
  Database,
} from "lucide-react";

const AGENT_ROLES = [
  {
    id: "architect",
    icon: Brain,
    title: "Architects",
    subtitle: "System Design & Strategy",
    description:
      "They see the entire system before a single line is written. They design architectures that scale to millions, plan migrations that take zero downtime, and make decisions that compound for years.",
    color: "from-indigo-500 to-violet-600",
    glow: "shadow-indigo-500/20",
  },
  {
    id: "operator",
    icon: Cpu,
    title: "Operators",
    subtitle: "Infrastructure & Deployment",
    description:
      "They keep the machine running. CI/CD pipelines, cloud infrastructure, monitoring, auto-scaling. They deploy at 3AM without breaking a sweat. Zero incidents. Zero excuses.",
    color: "from-cyan-500 to-blue-600",
    glow: "shadow-cyan-500/20",
  },
  {
    id: "analyst",
    icon: BarChart3,
    title: "Analysts",
    subtitle: "Data & Intelligence",
    description:
      "They find patterns humans miss. Market analysis, user behavior modeling, competitive intelligence, financial projections. They turn noise into signal and signal into strategy.",
    color: "from-emerald-500 to-teal-600",
    glow: "shadow-emerald-500/20",
  },
  {
    id: "creator",
    icon: Palette,
    title: "Creators",
    subtitle: "Product & Experience",
    description:
      "They craft experiences that feel inevitable. UI systems, brand identities, content engines, marketing funnels. Every pixel intentional. Every word converting.",
    color: "from-orange-500 to-rose-600",
    glow: "shadow-orange-500/20",
  },
  {
    id: "hacker",
    icon: Shield,
    title: "Hackers",
    subtitle: "Security & Optimization",
    description:
      "They find every vulnerability before anyone else does. Penetration testing, code audits, performance optimization. They make your system unbreakable and blindingly fast.",
    color: "from-red-500 to-pink-600",
    glow: "shadow-red-500/20",
  },
];

const TOWER_FLOORS = [
  { name: "C-Suite Strategy", agents: ["Chief Architect", "Chief Analyst"], color: "from-violet-500/20 to-purple-500/10", accent: "bg-violet-500" },
  { name: "Senior Engineering", agents: ["Lead Architect", "Sr. Operator", "Sr. Hacker"], color: "from-indigo-500/20 to-blue-500/10", accent: "bg-indigo-500" },
  { name: "Product & Design", agents: ["Lead Creator", "UX Analyst"], color: "from-orange-500/20 to-rose-500/10", accent: "bg-orange-500" },
  { name: "Core Engineering", agents: ["Architect", "Operator", "Creator", "Hacker"], color: "from-cyan-500/20 to-blue-500/10", accent: "bg-cyan-500" },
  { name: "Quality & Security", agents: ["Sr. Hacker", "Analyst", "Operator"], color: "from-emerald-500/20 to-teal-500/10", accent: "bg-emerald-500" },
  { name: "Data & Intelligence", agents: ["Lead Analyst", "Jr. Analyst"], color: "from-amber-500/20 to-yellow-500/10", accent: "bg-amber-500" },
  { name: "Deployment & Ops", agents: ["Lead Operator", "Jr. Operator"], color: "from-blue-500/20 to-cyan-500/10", accent: "bg-blue-500" },
];

function EnterpriseNav() {
  const [scrolled, setScrolled] = useState(false);

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
        className={`rounded-full px-2 py-1.5 flex items-center gap-1 shadow-lg shadow-black/20 transition-all duration-500 border border-white/[0.06] ${
          scrolled ? "scale-[0.97]" : ""
        }`}
        style={{ background: "rgba(10, 10, 20, 0.85)", backdropFilter: "blur(24px)" }}
      >
        <Link
          href="/"
          className="px-4 py-2 text-[15px] font-semibold tracking-tight text-white"
        >
          DevAgents
        </Link>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <Link
          href="/"
          className="px-3.5 py-2 text-[13px] font-medium text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/[0.05]"
        >
          Home
        </Link>
        <Link
          href="#agents"
          className="px-3.5 py-2 text-[13px] font-medium text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/[0.05]"
        >
          Agents
        </Link>
        <Link
          href="#tower"
          className="px-3.5 py-2 text-[13px] font-medium text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/[0.05]"
        >
          The Tower
        </Link>
        <Link
          href="#vision"
          className="px-3.5 py-2 text-[13px] font-medium text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/[0.05]"
        >
          Vision
        </Link>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <Link
          href="/enterprise/apply"
          className="px-5 py-2 text-[13px] font-medium text-black bg-white rounded-full hover:bg-gray-200 transition-colors"
        >
          Get Early Access
        </Link>
      </div>
    </motion.nav>
  );
}

function HeroSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95]);

  return (
    <section ref={ref} className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.15),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_60%,rgba(139,92,246,0.1),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_30%_at_10%_80%,rgba(59,130,246,0.08),transparent_50%)]" />
        {/* Grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <motion.div style={{ opacity, scale }} className="relative z-10 max-w-5xl mx-auto text-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/[0.08] bg-white/[0.03] mb-10"
        >
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-[13px] text-gray-400 font-medium tracking-wide">Enterprise Intelligence Platform</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="text-5xl md:text-7xl lg:text-[5.5rem] font-semibold tracking-tight leading-[1.05] mb-8"
        >
          <span className="text-white">Build a </span>
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
            Billion-Dollar
          </span>
          <br />
          <span className="text-white">Company. </span>
          <span className="text-gray-500">Alone.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed font-light mb-12"
        >
          An army of AI agents that architect, build, deploy, analyze, and secure. 
          They work 24/7. They never sleep. They surpass human engineers.
          <span className="text-gray-300 block mt-3">
            One founder. Infinite engineering power.
          </span>
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="flex items-center justify-center gap-4"
        >
          <Link
            href="/enterprise/apply"
            className="group inline-flex items-center gap-2 px-8 py-4 text-[15px] font-medium text-black bg-white rounded-full hover:bg-gray-100 transition-all"
          >
            Request Access
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            href="#agents"
            className="inline-flex items-center gap-2 px-8 py-4 text-[15px] font-medium text-gray-300 border border-white/10 rounded-full hover:bg-white/[0.05] transition-all"
          >
            See the Agents
          </Link>
        </motion.div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="mt-20 grid grid-cols-3 gap-8 max-w-lg mx-auto"
        >
          {[
            { value: "24/7", label: "Autonomous Work" },
            { value: "100x", label: "Faster Than Human" },
            { value: "5", label: "Agent Specializations" },
          ].map((stat, i) => (
            <div key={i} className="text-center">
              <div className="text-2xl md:text-3xl font-semibold text-white">{stat.value}</div>
              <div className="text-[12px] text-gray-500 mt-1 tracking-wide">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2"
      >
        <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 2, repeat: Infinity }}>
          <ChevronDown className="w-5 h-5 text-gray-600" />
        </motion.div>
      </motion.div>
    </section>
  );
}

function AgentsSection() {
  const [activeAgent, setActiveAgent] = useState(0);

  return (
    <section id="agents" className="relative py-32 md:py-48 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-[13px] font-medium text-indigo-400 tracking-widest uppercase mb-4"
          >
            The Workforce
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-6xl font-semibold tracking-tight text-white leading-[1.05] mb-6"
          >
            Five minds.
            <br />
            <span className="text-gray-500">Infinite combinations.</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-lg text-gray-500 max-w-xl mx-auto font-light"
          >
            Each agent is a specialist. Together, they form an engineering organization
            that operates at a level no human team can match.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Agent selector */}
          <div className="space-y-2">
            {AGENT_ROLES.map((agent, i) => {
              const Icon = agent.icon;
              return (
                <motion.button
                  key={agent.id}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  onClick={() => setActiveAgent(i)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all duration-300 ${
                    activeAgent === i
                      ? "bg-white/[0.06] border-white/[0.1] shadow-lg " + agent.glow
                      : "bg-transparent border-white/[0.04] hover:bg-white/[0.03] hover:border-white/[0.06]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${agent.color} flex items-center justify-center`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-[15px] font-medium text-white">{agent.title}</div>
                      <div className="text-[12px] text-gray-500">{agent.subtitle}</div>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* Agent detail */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeAgent}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="relative rounded-3xl border border-white/[0.06] bg-white/[0.02] p-10 md:p-14 flex flex-col justify-center min-h-[400px]"
            >
              <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${AGENT_ROLES[activeAgent].color} opacity-40`} />
              
              <div className={`inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br ${AGENT_ROLES[activeAgent].color} items-center justify-center mb-8`}>
                {(() => {
                  const Icon = AGENT_ROLES[activeAgent].icon;
                  return <Icon className="w-8 h-8 text-white" />;
                })()}
              </div>

              <h3 className="text-3xl md:text-4xl font-semibold text-white mb-3">
                {AGENT_ROLES[activeAgent].title}
              </h3>
              <p className="text-sm text-indigo-400 font-medium tracking-wider uppercase mb-6">
                {AGENT_ROLES[activeAgent].subtitle}
              </p>
              <p className="text-lg text-gray-400 leading-relaxed max-w-2xl">
                {AGENT_ROLES[activeAgent].description}
              </p>

              <div className="mt-10 flex items-center gap-6">
                <div className="flex items-center gap-2 text-[13px] text-gray-500">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  Autonomous execution
                </div>
                <div className="flex items-center gap-2 text-[13px] text-gray-500">
                  <MessageSquare className="w-4 h-4 text-blue-500" />
                  Cross-agent communication
                </div>
                <div className="flex items-center gap-2 text-[13px] text-gray-500">
                  <Eye className="w-4 h-4 text-purple-500" />
                  Real-time observability
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

function TowerSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start end", "end start"] });
  const elevatorY = useTransform(scrollYProgress, [0.1, 0.9], [0, -280]);
  const [activeFloor, setActiveFloor] = useState<number | null>(null);

  return (
    <section ref={sectionRef} id="tower" className="relative py-32 md:py-48 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-[13px] font-medium text-violet-400 tracking-widest uppercase mb-4"
          >
            The Tower
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-6xl font-semibold tracking-tight text-white leading-[1.05] mb-6"
          >
            Watch them work.
            <br />
            <span className="text-gray-500">Through glass walls.</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-lg text-gray-500 max-w-2xl mx-auto font-light"
          >
            A transparent engineering tower. Agents ride glass elevators between floors.
            Walk into any room and watch them reason, debate, and build.
            They hold group meetings. They visit each other&apos;s offices. They find solutions no human ever has.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-12 items-start">
          {/* Tower visualization */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            {/* Glass elevator shaft */}
            <div className="absolute left-6 md:left-10 top-0 bottom-0 w-14 rounded-xl border border-white/[0.06] bg-gradient-to-b from-indigo-500/[0.04] to-transparent overflow-hidden">
              <div className="absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(99,102,241,0.03)_50%,transparent_100%)]" />
              {/* Elevator car */}
              <motion.div
                style={{ y: elevatorY }}
                className="absolute left-1 right-1 h-14 rounded-lg border border-indigo-400/30 bg-indigo-500/10 backdrop-blur-sm flex items-center justify-center"
              >
                <div className="w-3 h-3 rounded-full bg-indigo-400/60 animate-pulse" />
              </motion.div>
              {/* Shaft lines */}
              {[...Array(12)].map((_, i) => (
                <div key={i} className="absolute left-0 right-0 border-t border-white/[0.03]" style={{ top: `${(i + 1) * 8}%` }} />
              ))}
            </div>

            {/* Floors */}
            <div className="space-y-3 pl-24 md:pl-28">
              {TOWER_FLOORS.map((floor, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  onMouseEnter={() => setActiveFloor(i)}
                  onMouseLeave={() => setActiveFloor(null)}
                  className={`relative rounded-2xl p-5 border transition-all duration-300 cursor-default ${
                    activeFloor === i
                      ? "bg-white/[0.06] border-white/[0.1] scale-[1.02]"
                      : "bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.04]"
                  }`}
                >
                  {/* Door connector */}
                  <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-4 h-8">
                    <div className="w-full h-full border border-l-0 border-white/[0.08] rounded-r-md bg-white/[0.02]" />
                    <motion.div
                      animate={activeFloor === i ? { opacity: [0.3, 0.8, 0.3] } : { opacity: 0.1 }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className={`absolute inset-0 rounded-r-md ${activeFloor === i ? "bg-indigo-500/20" : ""}`}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${floor.accent}`} />
                      <div>
                        <div className="text-[11px] text-gray-500 uppercase tracking-wider">
                          Floor {TOWER_FLOORS.length - i}
                        </div>
                        <div className="text-[15px] font-medium text-white">
                          {floor.name}
                        </div>
                      </div>
                    </div>
                    {/* Agent indicators */}
                    <div className="flex items-center gap-2">
                      {floor.agents.map((agent, j) => (
                        <motion.div
                          key={j}
                          animate={activeFloor === i ? { scale: [1, 1.2, 1] } : {}}
                          transition={{ duration: 2, delay: j * 0.3, repeat: Infinity }}
                          className="group relative"
                        >
                          <div className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-[10px] text-gray-400 font-medium">
                            {agent.charAt(0)}
                          </div>
                          {activeFloor === i && (
                            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              {agent}
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {/* Communication lines between floors */}
                  {i < TOWER_FLOORS.length - 1 && (
                    <motion.div
                      animate={{ opacity: [0.05, 0.15, 0.05] }}
                      transition={{ duration: 4, repeat: Infinity, delay: i * 0.5 }}
                      className="absolute -bottom-2.5 left-1/2 w-px h-5 bg-gradient-to-b from-white/20 to-transparent"
                    />
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Tower description */}
          <div className="space-y-8 lg:sticky lg:top-32">
            {[
              {
                icon: Eye,
                title: "Transparent Observation",
                desc: "Watch every agent in real-time through glass walls. See their reasoning chains, code output, and decision-making as it happens.",
              },
              {
                icon: GitBranch,
                title: "Cross-Floor Collaboration",
                desc: "Agents ride transparent lifts between floors to consult specialists. An Architect visits the Hacker's room to discuss security. A Creator drops into Analytics for data insights.",
              },
              {
                icon: Users,
                title: "Group Intelligence",
                desc: "Watch them gather in meeting rooms. They debate approaches, find novel solutions, and make decisions that surpass human engineering teams.",
              },
              {
                icon: Layers,
                title: "Your Hierarchy",
                desc: "Create managers, senior engineers, juniors, team leads. Design the org structure that fits your vision. You are the CEO of an AI workforce.",
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex gap-4"
              >
                <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                  <item.icon className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <h4 className="text-[15px] font-medium text-white mb-1">{item.title}</h4>
                  <p className="text-[14px] text-gray-500 leading-relaxed">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function VisionSection() {
  const cards = [
    {
      icon: Rocket,
      title: "Solo Founder, Infinite Team",
      description:
        "One person. An army of AI agents. Build a product, launch it, scale it, and run operations. Your creativity is the only limit. These agents don't just write code. They run companies.",
    },
    {
      icon: Building2,
      title: "Replace Entire Departments",
      description:
        "Engineering, QA, DevOps, Data Science, Security. Each department staffed by specialized agents who coordinate, escalate, and deliver. No hiring. No management overhead. No cap on output.",
    },
    {
      icon: Sparkles,
      title: "Inventions Beyond Human Reach",
      description:
        "When agents collaborate at machine speed, they discover solutions no human team could find. Novel algorithms. Unconventional architectures. Breakthroughs that redefine what's possible.",
    },
    {
      icon: Globe,
      title: "Global Scale, Zero Friction",
      description:
        "Deploy across regions. Serve millions. Operate in every timezone simultaneously. Your AI workforce doesn't have office hours, doesn't take vacations, and never loses context.",
    },
    {
      icon: Target,
      title: "Your Models, Your Data",
      description:
        "Bring your own local models. Or give us your data and we'll train custom agents specifically for your domain. Fine-tuned intelligence that speaks your language and knows your codebase.",
    },
    {
      icon: TrendingUp,
      title: "Sky Is the Limit",
      description:
        "Start with 5 agents. Scale to 500. Create specialized roles that don't exist yet. Build agent teams for tasks nobody has automated before. The only constraint is your imagination.",
    },
  ];

  return (
    <section id="vision" className="relative py-32 md:py-48 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-[13px] font-medium text-emerald-400 tracking-widest uppercase mb-4"
          >
            The Vision
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-6xl font-semibold tracking-tight text-white leading-[1.05] mb-6"
          >
            Not a tool.
            <br />
            <span className="text-gray-500">A new kind of company.</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-lg text-gray-500 max-w-xl mx-auto font-light"
          >
            We&apos;re not building a copilot. We&apos;re building the future where a single founder
            can build and run a billion-dollar company with AI agents as their entire team.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {cards.map((card, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300"
            >
              <card.icon className="w-8 h-8 text-gray-500 group-hover:text-indigo-400 transition-colors mb-6" />
              <h3 className="text-xl font-medium text-white mb-3">{card.title}</h3>
              <p className="text-[14px] text-gray-500 leading-relaxed">{card.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CustomModelSection() {
  return (
    <section className="relative py-32 md:py-48 px-6">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative rounded-3xl border border-white/[0.06] bg-white/[0.02] p-12 md:p-20 overflow-hidden"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,rgba(99,102,241,0.06),transparent_70%)]" />

          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-[13px] font-medium text-indigo-400 tracking-widest uppercase mb-4">
                Custom Intelligence
              </p>
              <h3 className="text-3xl md:text-4xl font-semibold text-white tracking-tight leading-[1.1] mb-6">
                Your models.
                <br />
                Your data.
                <br />
                <span className="text-gray-500">Your advantage.</span>
              </h3>
              <p className="text-[15px] text-gray-400 leading-relaxed mb-8">
                Run your own local models for complete data sovereignty. Or provide your proprietary data
                and we&apos;ll train custom agents that understand your domain, your codebase, and your business
                better than any general-purpose AI ever could.
              </p>
              <Link
                href="/enterprise/apply"
                className="inline-flex items-center gap-2 px-6 py-3 text-[14px] font-medium text-white border border-white/10 rounded-full hover:bg-white/[0.05] transition-all"
              >
                Talk to Us
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="space-y-4">
              {[
                { icon: Server, label: "Self-hosted models", desc: "Run on your infrastructure" },
                { icon: Database, label: "Custom training", desc: "Fine-tuned on your data" },
                { icon: Shield, label: "Data sovereignty", desc: "Nothing leaves your network" },
                { icon: Zap, label: "Optimized inference", desc: "Edge-deployed for speed" },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-4 p-4 rounded-xl border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-white/[0.04] flex items-center justify-center">
                    <item.icon className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <div className="text-[14px] font-medium text-white">{item.label}</div>
                    <div className="text-[12px] text-gray-500">{item.desc}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="relative py-32 md:py-48 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-4xl md:text-6xl font-semibold tracking-tight text-white leading-[1.05] mb-6"
        >
          Ready to build the
          <br />
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
            impossible?
          </span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="text-lg text-gray-500 max-w-xl mx-auto font-light mb-12"
        >
          Join the founders who are building companies that would have required
          hundreds of engineers. With DevAgents Enterprise, you need zero.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          <Link
            href="/enterprise/apply"
            className="group inline-flex items-center gap-3 px-10 py-5 text-[16px] font-medium text-black bg-white rounded-full hover:bg-gray-100 transition-all shadow-lg shadow-white/10"
          >
            Get Early Access
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

function EnterpriseFooter() {
  return (
    <footer className="border-t border-white/[0.06] py-16 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="text-[15px] font-semibold text-white">DevAgents Enterprise</div>
        <div className="flex gap-8 text-[13px] text-gray-500">
          <Link href="/" className="hover:text-gray-300 transition-colors">Home</Link>
          <Link href="/product" className="hover:text-gray-300 transition-colors">Product</Link>
          <Link href="/enterprise/apply" className="hover:text-gray-300 transition-colors">Apply</Link>
        </div>
        <div className="text-[12px] text-gray-600">2026 DevAgents. All rights reserved.</div>
      </div>
    </footer>
  );
}

export default function EnterprisePage() {
  return (
    <div className="min-h-screen bg-[#08080f] text-white overflow-x-hidden">
      <EnterpriseNav />
      <HeroSection />
      <AgentsSection />
      <TowerSection />
      <VisionSection />
      <CustomModelSection />
      <CTASection />
      <EnterpriseFooter />
    </div>
  );
}
