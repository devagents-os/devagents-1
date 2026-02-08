"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Coins, X, TrendingUp, Clock, Zap } from "lucide-react";
import { PLAN_TIERS } from "@/lib/tokenConfig";

interface TokenSummary {
  planTier: string;
  tierLabel: string;
  tokensAllocated: number;
  tokensRemaining: number;
  tokensUsed: number;
  lastResetAt: string;
}

interface UsageLogEntry {
  id: string;
  action_type: string;
  tokens_consumed: number;
  created_at: string;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function getNextResetDate(lastReset: string): string {
  const d = new Date(lastReset);
  d.setMonth(d.getMonth() + 1);
  d.setDate(1);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function tierColor(tier: string) {
  switch (tier) {
    case "free":
      return "text-slate-400";
    case "basic":
      return "text-blue-400";
    case "pro":
      return "text-cyan-400";
    case "ultra":
      return "text-purple-400";
    default:
      return "text-slate-400";
  }
}

function tierBadgeBg(tier: string) {
  switch (tier) {
    case "free":
      return "bg-slate-500/20 border-slate-500/30";
    case "basic":
      return "bg-blue-500/20 border-blue-500/30";
    case "pro":
      return "bg-cyan-500/20 border-cyan-500/30";
    case "ultra":
      return "bg-purple-500/20 border-purple-500/30";
    default:
      return "bg-slate-500/20 border-slate-500/30";
  }
}

export default function TokenUsagePanel({
  isOpen,
  onClose,
  onToggle,
}: {
  isOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
}) {
  const [summary, setSummary] = useState<TokenSummary | null>(null);
  const [log, setLog] = useState<UsageLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const getAuthToken = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("devagents_session");
      if (!raw) return null;
      const session = JSON.parse(raw);
      return session.access_token || null;
    } catch {
      return null;
    }
  }, []);

  const fetchSummary = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch("/api/tokens?action=summary", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch {
      // silently fail
    }
  }, [getAuthToken]);

  const fetchLog = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch("/api/tokens?action=log&limit=15", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLog(data.log || []);
      }
    } catch {
      // silently fail
    }
  }, [getAuthToken]);

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 30000);
    return () => clearInterval(interval);
  }, [fetchSummary]);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      Promise.all([fetchSummary(), fetchLog()]).finally(() => setLoading(false));
    }
  }, [isOpen, fetchSummary, fetchLog]);

  const usagePercent = summary
    ? Math.round((summary.tokensUsed / summary.tokensAllocated) * 100)
    : 0;

  const barColor =
    usagePercent > 90
      ? "bg-red-500"
      : usagePercent > 70
      ? "bg-amber-500"
      : "bg-cyan-500";

  // Compact badge for the toolbar
  const compactBadge = (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 px-3 py-2 rounded-lg backdrop-blur-md border bg-white/40 border-slate-200 text-slate-600 hover:bg-white/60 transition-all"
      title="Token Usage"
    >
      <Coins size={16} className="text-amber-500" />
      {summary && (
        <span className="text-xs font-medium">
          {formatNumber(summary.tokensRemaining)}
        </span>
      )}
      {summary && usagePercent > 90 && (
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      )}
    </button>
  );

  return (
    <>
      {compactBadge}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed top-4 right-4 w-80 z-50 bg-[#1a1a2e]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Coins size={18} className="text-amber-400" />
                <span className="text-white/90 text-sm font-semibold">
                  Token Usage
                </span>
              </div>
              <div className="flex items-center gap-2">
                {summary && (
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${tierBadgeBg(
                      summary.planTier
                    )} ${tierColor(summary.planTier)}`}
                  >
                    {summary.tierLabel}
                  </span>
                )}
                <button
                  onClick={onClose}
                  className="p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70 transition-all"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {loading && !summary ? (
              <div className="p-8 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
              </div>
            ) : summary ? (
              <div className="p-4 space-y-4">
                {/* Usage bar */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white/50 text-xs">Credits Used</span>
                    <span className="text-white/80 text-xs font-medium">
                      {formatNumber(summary.tokensUsed)} /{" "}
                      {formatNumber(summary.tokensAllocated)}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${usagePercent}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className={`h-full ${barColor} rounded-full`}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-white/30 text-[10px]">
                      {usagePercent}% used
                    </span>
                    <span className="text-white/30 text-[10px]">
                      {formatNumber(summary.tokensRemaining)} remaining
                    </span>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white/5 rounded-xl p-2.5 text-center">
                    <Zap size={14} className="text-amber-400 mx-auto mb-1" />
                    <div className="text-white/90 text-sm font-semibold">
                      {formatNumber(summary.tokensRemaining)}
                    </div>
                    <div className="text-white/30 text-[10px]">Remaining</div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-2.5 text-center">
                    <TrendingUp
                      size={14}
                      className="text-cyan-400 mx-auto mb-1"
                    />
                    <div className="text-white/90 text-sm font-semibold">
                      {formatNumber(summary.tokensUsed)}
                    </div>
                    <div className="text-white/30 text-[10px]">Used</div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-2.5 text-center">
                    <Clock size={14} className="text-purple-400 mx-auto mb-1" />
                    <div className="text-white/90 text-[11px] font-semibold">
                      {getNextResetDate(summary.lastResetAt)}
                    </div>
                    <div className="text-white/30 text-[10px]">Resets</div>
                  </div>
                </div>

                {/* Insufficient credits warning */}
                {summary.tokensRemaining <= 0 && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-center">
                    <p className="text-red-400 text-xs font-medium">
                      No credits remaining. Agent actions are blocked.
                    </p>
                    <p className="text-red-400/60 text-[10px] mt-1">
                      Upgrade your plan or wait for monthly reset.
                    </p>
                  </div>
                )}

                {/* Recent usage log */}
                {log.length > 0 && (
                  <div>
                    <div className="text-white/40 text-[10px] uppercase tracking-wider mb-2">
                      Recent Activity
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                      {log.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/60 shrink-0" />
                            <span className="text-white/60 text-[11px] truncate">
                              {entry.action_type}
                            </span>
                          </div>
                          <span className="text-amber-400/70 text-[11px] font-medium shrink-0 ml-2">
                            -{entry.tokens_consumed}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upgrade CTA for free users */}
                {summary.planTier === "free" && (
                  <div className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-white/10 rounded-xl p-3 text-center">
                    <p className="text-white/70 text-xs">
                      Upgrade for more credits
                    </p>
                    <a
                      href="/#pricing"
                      className="inline-block mt-1.5 px-4 py-1.5 text-[11px] font-medium text-white bg-cyan-500/30 hover:bg-cyan-500/40 rounded-full transition-colors"
                    >
                      View Plans
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center">
                <p className="text-white/40 text-sm">
                  Sign in to view token usage
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
