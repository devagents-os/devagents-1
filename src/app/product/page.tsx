"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { ArrowLeft } from "lucide-react";

const SECTIONS = [
  {
    label: "Outcomes",
    title: "What it delivers.",
    items: [
      {
        heading: "Production-Ready Code",
        text: "From intent to deployment. Your agent writes, tests, and ships code that passes review on the first push.",
      },
      {
        heading: "Zero-Delay Architecture",
        text: "System design happens in real time. Schemas, APIs, infrastructure — resolved before you finish your sentence.",
      },
      {
        heading: "Continuous Iteration",
        text: "It doesn't stop at v1. It refactors, optimizes, and evolves your codebase as understanding deepens.",
      },
    ],
  },
  {
    label: "Experience",
    title: "How it feels.",
    items: [
      {
        heading: "Spatial Awareness",
        text: "Navigate your projects in 3D space. Each agent workspace is a living environment — not a chat window.",
      },
      {
        heading: "Ambient Intelligence",
        text: "The system anticipates needs before you articulate them. Context flows silently between every interaction.",
      },
      {
        heading: "Invisible Complexity",
        text: "Thousands of decisions happen per second. You see only the result — clean, composed, inevitable.",
      },
    ],
  },
  {
    label: "Capability",
    title: "What it understands.",
    items: [
      {
        heading: "Full-Stack Cognition",
        text: "Frontend, backend, infrastructure, data modeling, security. One agent. Complete comprehension.",
      },
      {
        heading: "Temporal Reasoning",
        text: "It remembers every decision, every conversation, every pattern. Context compounds over time.",
      },
      {
        heading: "Adaptive Methodology",
        text: "It shifts between approaches — depth-first analysis, breadth-first exploration — based on what the problem demands.",
      },
    ],
  },
  {
    label: "Future",
    title: "Where it goes.",
    items: [
      {
        heading: "Organizational Memory",
        text: "Your company's collective engineering knowledge, accessible to every agent, every project, every decision.",
      },
      {
        heading: "Self-Improving Systems",
        text: "Agents that learn from outcomes, refine their approach, and become more effective with every deployment.",
      },
      {
        heading: "Autonomous Teams",
        text: "Multiple agents coordinating across disciplines. Architecture, engineering, quality — operating in concert.",
      },
    ],
  },
];

function ProductNav() {
  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-6 left-1/2 -translate-x-1/2 z-50"
    >
      <div className="glass-nav rounded-full px-2 py-1.5 flex items-center gap-1 shadow-lg shadow-black/[0.03]">
        <Link
          href="/"
          className="px-3 py-2 text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors rounded-full hover:bg-black/[0.03] flex items-center gap-1.5"
        >
          <ArrowLeft size={14} />
          Back
        </Link>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <span className="px-4 py-2 text-[15px] font-semibold tracking-tight text-gray-900">
          Product
        </span>
      </div>
    </motion.nav>
  );
}

function ProductSection({
  section,
  index,
}: {
  section: (typeof SECTIONS)[0];
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [40, -40]);

  return (
    <motion.div ref={ref} style={{ y }} className="py-24 md:py-32">
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="text-[13px] font-medium text-indigo-500 tracking-widest uppercase mb-4"
      >
        {section.label}
      </motion.p>
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-gray-900 leading-[1.05] mb-16"
      >
        {section.title}
      </motion.h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {section.items.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="group"
          >
            <div className="w-8 h-px bg-gray-200 mb-6 group-hover:bg-indigo-400 group-hover:w-12 transition-all duration-500" />
            <h3 className="text-xl font-medium text-gray-900 mb-3">
              {item.heading}
            </h3>
            <p className="text-[15px] text-gray-400 leading-relaxed">
              {item.text}
            </p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

export default function ProductPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 font-[var(--font-sans)]">
      <ProductNav />

      <div className="max-w-6xl mx-auto px-6 pt-32">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-16"
        >
          <h1 className="text-5xl md:text-7xl font-semibold tracking-tight text-gray-900 leading-[0.95]">
            Built for what
            <br />
            <span className="text-gradient">comes next.</span>
          </h1>
          <p className="mt-6 text-lg text-gray-400 max-w-lg mx-auto font-light">
            DevAgents is not a tool you learn.
            It&apos;s a system that learns you.
          </p>
        </motion.div>

        {SECTIONS.map((section, i) => (
          <ProductSection key={i} section={section} index={i} />
        ))}

        {/* Final CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center py-32"
        >
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-6">
            Ready to see it work.
          </h2>
          <Link
            href="/workspace"
            className="inline-flex items-center gap-2 px-8 py-3.5 text-[14px] font-medium text-white bg-gray-900 rounded-full hover:bg-gray-800 transition-colors"
          >
            Open Agent Workspace
            <ArrowLeft size={16} className="rotate-180" />
          </Link>
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-12 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-[13px] text-gray-300">DevAgents</span>
          <Link href="/" className="text-[13px] text-gray-400 hover:text-gray-600 transition-colors">
            Home
          </Link>
        </div>
      </footer>
    </div>
  );
}
