import { NextResponse, type NextRequest } from 'next/server';
import { sameOrigin } from '@/lib/api';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'bad origin' }, { status: 403 });
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // RLS: only members of the occurrence's group may insert their own acknowledgement.
  const { error } = await supabase
    .from('acknowledgements')
    .upsert({ occurrence_id: id, user_id: user.id }, { onConflict: 'occurrence_id,user_id', ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: 'not allowed' }, { status: 403 });
  return NextResponse.json({ ok: true });
}
