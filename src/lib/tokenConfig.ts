// Token usage configuration: costs per action and limits per plan tier

export const PLAN_TIERS = {
  free: {
    label: 'Free',
    tokensAllocated: 100_000,
    priceMonthly: 0,
  },
  basic: {
    label: 'Basic',
    tokensAllocated: 1_000_000,
    priceMonthly: 19,
  },
  pro: {
    label: 'Pro',
    tokensAllocated: 4_000_000,
    priceMonthly: 49,
  },
  ultra: {
    label: 'Ultra',
    tokensAllocated: 32_000_000,
    priceMonthly: 199,
  },
} as const;

export type PlanTier = keyof typeof PLAN_TIERS;

// Token cost per agent action type
export const ACTION_COSTS: Record<string, number> = {
  // Agent reasoning actions
  immediate: 500,
  reflective: 800,
  autonomous: 600,
  think: 700,

  // Computer actions
  computer: 400,
  computer_step: 300,

  // Learning / memory
  learn: 200,
  learn_from_task: 300,

  // Code execution
  execute_code: 1000,
  run_tests: 1200,

  // Verification / hallucination prevention
  verify_code: 400,
  verify_plan: 400,
  verify_claim: 300,
  grounding_check: 200,

  // Thinking API actions
  'thinking:plan': 500,
  'thinking:think': 700,
  'thinking:verify': 300,

  // Other API routes
  skills: 100,
  memory: 150,
  context: 200,
  embeddings: 300,
  code_analysis: 500,
  documentation: 400,
  debugging: 600,
  testing: 800,
  terminal: 200,
  browser: 200,
  files: 100,
  edit: 150,
  github: 200,
  docker: 300,
  workspace: 100,
};

export function getActionCost(actionType: string): number {
  return ACTION_COSTS[actionType] ?? 100;
}
