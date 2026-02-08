import { supabaseAdmin } from '@/lib/supabase';
import { getActionCost, PLAN_TIERS, PlanTier } from '@/lib/tokenConfig';

export interface TokenCheckResult {
  allowed: boolean;
  tokensRemaining: number;
  cost: number;
  planTier: PlanTier;
}

/**
 * Check if a user has enough tokens and deduct them.
 * Returns { allowed: false } if insufficient credits.
 */
export async function deductTokens(
  userId: string,
  actionType: string,
  metadata?: Record<string, unknown>
): Promise<TokenCheckResult> {
  const cost = getActionCost(actionType);

  // Get or create subscription
  let { data: sub } = await supabaseAdmin
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!sub) {
    // Auto-create free-tier subscription
    const tier = PLAN_TIERS.free;
    const { data: newSub } = await supabaseAdmin
      .from('user_subscriptions')
      .insert({
        user_id: userId,
        plan_tier: 'free',
        tokens_allocated: tier.tokensAllocated,
        tokens_remaining: tier.tokensAllocated,
      })
      .select()
      .single();
    sub = newSub;
  }

  if (!sub) {
    return { allowed: false, tokensRemaining: 0, cost, planTier: 'free' };
  }

  // Monthly reset check
  const lastReset = new Date(sub.last_reset_at);
  const now = new Date();
  if (
    now.getMonth() !== lastReset.getMonth() ||
    now.getFullYear() !== lastReset.getFullYear()
  ) {
    await supabaseAdmin
      .from('user_subscriptions')
      .update({
        tokens_remaining: sub.tokens_allocated,
        last_reset_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('user_id', userId);
    sub.tokens_remaining = sub.tokens_allocated;
  }

  const planTier = (sub.plan_tier || 'free') as PlanTier;

  if (sub.tokens_remaining < cost) {
    return { allowed: false, tokensRemaining: sub.tokens_remaining, cost, planTier };
  }

  // Deduct tokens
  const newRemaining = sub.tokens_remaining - cost;
  await supabaseAdmin
    .from('user_subscriptions')
    .update({
      tokens_remaining: newRemaining,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  // Log usage
  await supabaseAdmin.from('token_usage').insert({
    user_id: userId,
    action_type: actionType,
    tokens_consumed: cost,
    metadata: metadata ?? {},
  });

  return { allowed: true, tokensRemaining: newRemaining, cost, planTier };
}

/**
 * Get token usage summary for a user.
 */
export async function getTokenSummary(userId: string) {
  const { data: sub } = await supabaseAdmin
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!sub) {
    const tier = PLAN_TIERS.free;
    return {
      planTier: 'free' as PlanTier,
      tokensAllocated: tier.tokensAllocated,
      tokensRemaining: tier.tokensAllocated,
      tokensUsed: 0,
      lastResetAt: new Date().toISOString(),
    };
  }

  return {
    planTier: (sub.plan_tier || 'free') as PlanTier,
    tokensAllocated: sub.tokens_allocated,
    tokensRemaining: sub.tokens_remaining,
    tokensUsed: sub.tokens_allocated - sub.tokens_remaining,
    lastResetAt: sub.last_reset_at,
  };
}

/**
 * Get recent token usage log for a user.
 */
export async function getTokenUsageLog(userId: string, limit = 20) {
  const { data } = await supabaseAdmin
    .from('token_usage')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data ?? [];
}
