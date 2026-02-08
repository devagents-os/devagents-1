import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTokenSummary, getTokenUsageLog } from '@/lib/tokenService';
import { PLAN_TIERS } from '@/lib/tokenConfig';

function getUserFromToken(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

export async function GET(req: NextRequest) {
  try {
    const token = getUserFromToken(req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'summary';

    if (action === 'summary') {
      const summary = await getTokenSummary(user.id);
      const tierInfo = PLAN_TIERS[summary.planTier] || PLAN_TIERS.free;
      return NextResponse.json({ ...summary, tierLabel: tierInfo.label });
    }

    if (action === 'log') {
      const limit = parseInt(searchParams.get('limit') || '20', 10);
      const log = await getTokenUsageLog(user.id, limit);
      return NextResponse.json({ log });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Tokens API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
