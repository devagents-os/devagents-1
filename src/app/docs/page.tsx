"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";

const SIDEBAR = [
  {
    category: "Getting Started",
    items: [
      { id: "introduction", label: "Introduction" },
      { id: "quickstart", label: "Quickstart" },
      { id: "workspaces", label: "Agent Workspaces" },
    ],
  },
  {
    category: "Core Concepts",
    items: [
      { id: "agents", label: "Agent Personas" },
      { id: "reasoning", label: "Reasoning Loop" },
      { id: "autonomy", label: "Autonomous Mode" },
      { id: "memory", label: "Semantic Memory" },
    ],
  },
  {
    category: "Guides",
    items: [
      { id: "first-task", label: "Your First Task" },
      { id: "multi-agent", label: "Multi-Agent Workflows" },
      { id: "integrations", label: "Integrations" },
    ],
  },
  {
    category: "API Reference",
    items: [
      { id: "api-overview", label: "Overview" },
      { id: "api-agent", label: "Agent API" },
      { id: "api-memory", label: "Memory API" },
    ],
  },
];

const DOCS_CONTENT: Record<string, { title: string; content: string[] }> = {
  introduction: {
    title: "Introduction",
    content: [
      "DevAgents is an autonomous AI software engineering system. It reasons about code, plans execution, and delivers production-ready results — inside immersive 3D workspaces that make complexity visible.",
      "Unlike traditional coding assistants, DevAgents operates through a continuous reasoning loop: Observe, Reflect, Plan, Execute. This architecture enables sustained focus on complex, multi-step engineering challenges.",
      "Each agent workspace represents a distinct engineering persona — Architect, Operator, Creator, Analyst, and Hacker — each calibrated for different types of technical work.",
    ],
  },
  quickstart: {
    title: "Quickstart",
    content: [
      "1. Navigate to the Agent Workspace from the landing page or via /workspace.",
      "2. Select an agent persona using the room selector on the left sidebar. Each persona is optimized for different engineering disciplines.",
      "3. Type a task in the input field at the bottom. The agent will plan, reason, and execute — you can watch its thought process in real time.",
      "4. Enable Autonomous Mode to let the agent work independently, exploring and analyzing your project on its own initiative.",
      "5. Use the computer interface to see the agent interact with browser, terminal, and editor — just like a human developer would.",
    ],
  },
  workspaces: {
    title: "Agent Workspaces",
    content: [
      "Workspaces are spatial environments where agents operate. Each workspace contains a desk, computer, and specialized tools relevant to the agent's persona.",
      "The Architect's workspace is minimal and bright — designed for system-level thinking. The Operator's space is cyberpunk-themed with server racks and status dashboards. The Creator has an art easel and plants. The Analyst works surrounded by data visualizations. The Hacker operates in a dark alcove with matrix panels and network nodes.",
      "Switching between workspaces changes the agent's behavior, communication style, and approach to problem-solving.",
    ],
  },
  agents: {
    title: "Agent Personas",
    content: [
      "The Architect: Calm, precise, system-level thinker. Best for designing architectures, planning APIs, and establishing technical foundations.",
      "The Operator: Fast, aggressive, always-on. Optimized for deployment, DevOps, monitoring, and incident response.",
      "The Creator: Curious, playful, imaginative. Excels at frontend development, UI/UX design, and creative problem solving.",
      "The Analyst: Logical, observant, data-driven. Focused on performance optimization, data modeling, and technical analysis.",
      "The Hacker: Obsessive, nocturnal, experimental. Specialized in security, deep debugging, and unconventional approaches.",
    ],
  },
  reasoning: {
    title: "Reasoning Loop",
    content: [
      "Every agent operates through a four-phase cognitive loop that runs continuously during task execution:",
      "Observe: The agent perceives its current state — position in the workspace, available tools, project context, and the task at hand.",
      "Reflect: It processes observations against its accumulated knowledge, identifying patterns, constraints, and opportunities.",
      "Plan: It constructs a sequence of concrete actions, evaluating tradeoffs and selecting the most effective approach.",
      "Execute: It carries out each action, monitoring results and feeding outcomes back into the observation phase.",
      "This loop ensures that every action is deliberate, every decision is grounded in context, and the agent can adapt dynamically as conditions change.",
    ],
  },
  autonomy: {
    title: "Autonomous Mode",
    content: [
      "When enabled, the agent operates independently — exploring your project, studying files, analyzing architecture, and making improvements without direct instructions.",
      "The agent's autonomous behavior is influenced by its current mood and persona. A curious agent might explore unfamiliar code paths. A focused agent might optimize recently-modified files.",
      "You can interrupt autonomous mode at any time by typing a task. The agent will seamlessly transition from self-directed work to your explicit instruction.",
    ],
  },
  memory: {
    title: "Semantic Memory",
    content: [
      "DevAgents maintains a persistent knowledge graph that accumulates understanding over time. Every file analyzed, every pattern recognized, and every decision made contributes to a growing semantic memory.",
      "This memory is organized into concepts, patterns, and relationships — allowing the agent to recall relevant context instantly when encountering similar challenges.",
      "Memory persists across sessions. The more you work with DevAgents, the more it understands your codebase, your preferences, and your engineering patterns.",
    ],
  },
  "first-task": {
    title: "Your First Task",
    content: [
      "Open the workspace and select the Architect persona. In the task input, type: \"Analyze this project and suggest architectural improvements.\"",
      "Watch as the agent walks to the computer, opens it, and begins analyzing your project structure. It will study files, map dependencies, and present findings through its thought stream.",
      "The agent will interact with the computer interface — opening files in the editor, running commands in the terminal, and browsing documentation — just as a human engineer would.",
    ],
  },
  "multi-agent": {
    title: "Multi-Agent Workflows",
    content: [
      "Multi-Agent Ecosystem allows multiple specialized agents to coordinate on complex engineering projects. Each agent operates on its own floor within the system architecture.",
      "Agents share context through structured communication channels — represented spatially as doors connecting adjacent workspaces and glass elevators moving between floors.",
      "A typical workflow might route architectural decisions through the Architect, implementation through the Creator, testing through the Analyst, and deployment through the Operator — each contributing their specialized intelligence to the final result.",
    ],
  },
  integrations: {
    title: "Integrations",
    content: [
      "GitHub: Connect your repositories for continuous analysis, automated CI monitoring, and pull request management. The agent can detect failing pipelines and propose fixes.",
      "Project Files: The agent can read, analyze, and understand any file in your project directory. It builds a semantic map of your codebase over time.",
      "Browser: Agents can search documentation, research libraries, and browse the web — all within their workspace computer interface.",
    ],
  },
  "api-overview": {
    title: "API Overview",
    content: [
      "The DevAgents API provides programmatic access to agent capabilities. All endpoints accept JSON payloads and return structured responses.",
      "Base URL: /api",
      "Authentication is handled through user sessions. API keys are available for Pro and Ultra plans.",
      "Rate limits: Free tier — 100 requests/hour. Pro — 1,000 requests/hour. Ultra — unlimited.",
    ],
  },
  "api-agent": {
    title: "Agent API",
    content: [
      "POST /api/agent — Primary endpoint for agent interactions.",
      "Actions: reflective (planning), immediate (single action), autonomous (self-directed), computer_step (computer interaction), learn (knowledge ingestion).",
      "Request body includes the action type, task description, current agent state, and room configuration. The response contains the agent's thought, next action, and completion status.",
    ],
  },
  "api-memory": {
    title: "Memory API",
    content: [
      "POST /api/agent with action: 'learn' — Store insights in the agent's knowledge graph.",
      "Insights include type (concept, pattern, preference), content, importance score, related entities, and relationships.",
      "The memory system automatically indexes, relates, and retrieves relevant knowledge during task execution.",
    ],
  },
};

function DocsNav() {
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
          Home
        </Link>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <span className="px-4 py-2 text-[15px] font-semibold tracking-tight text-gray-900">
          Documentation
        </span>
      </div>
    </motion.nav>
  );
}

export default function DocsPage() {
  const [activeDoc, setActiveDoc] = useState("introduction");
  const doc = DOCS_CONTENT[activeDoc] || DOCS_CONTENT.introduction;

  return (
    <div className="min-h-screen bg-white text-gray-900 font-[var(--font-sans)]">
      <DocsNav />

      <div className="max-w-6xl mx-auto px-6 pt-28 flex gap-12">
        {/* Sidebar */}
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="hidden md:block w-56 shrink-0 sticky top-28 h-[calc(100vh-8rem)] overflow-y-auto no-scrollbar"
        >
          {SIDEBAR.map((group, gi) => (
            <div key={gi} className="mb-6">
              <div className="text-[11px] font-medium text-gray-300 uppercase tracking-wider mb-2 px-3">
                {group.category}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveDoc(item.id)}
                  className={`w-full text-left px-3 py-1.5 text-[13px] rounded-lg transition-all mb-0.5 ${
                    activeDoc === item.id
                      ? "text-gray-900 bg-gray-100 font-medium"
                      : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </motion.aside>

        {/* Content */}
        <motion.main
          key={activeDoc}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex-1 max-w-2xl pb-32"
        >
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-gray-900 mb-8">
            {doc.title}
          </h1>
          <div className="space-y-5">
            {doc.content.map((paragraph, i) => (
              <p
                key={i}
                className="text-[15px] text-gray-500 leading-[1.75]"
              >
                {paragraph}
              </p>
            ))}
          </div>

          {/* Next/prev navigation */}
          <div className="mt-16 pt-8 border-t border-gray-100">
            {(() => {
              const allItems = SIDEBAR.flatMap((g) => g.items);
              const currentIdx = allItems.findIndex(
                (item) => item.id === activeDoc
              );
              const next = allItems[currentIdx + 1];
              const prev = allItems[currentIdx - 1];

              return (
                <div className="flex justify-between">
                  {prev ? (
                    <button
                      onClick={() => setActiveDoc(prev.id)}
                      className="text-[13px] text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Previous: {prev.label}
                    </button>
                  ) : (
                    <div />
                  )}
                  {next && (
                    <button
                      onClick={() => setActiveDoc(next.id)}
                      className="text-[13px] text-gray-600 hover:text-gray-900 transition-colors flex items-center gap-1"
                    >
                      {next.label}
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        </motion.main>
      </div>
    </div>
  );
}
