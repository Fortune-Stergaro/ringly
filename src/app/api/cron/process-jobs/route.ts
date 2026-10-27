import { NextResponse, type NextRequest } from 'next/server';
import { cronAuthorized } from '@/lib/api';
import { processDueJobs } from '@/server/scheduling/processor';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function handle(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const totals = await processDueJobs({ maxMs: 45_000 });
    return NextResponse.json({ ok: true, ...totals });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
export const POST = handle;
export const GET = handle;
