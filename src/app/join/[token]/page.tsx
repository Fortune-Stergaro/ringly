import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { joinByToken } from '@/app/actions/groups';
import { Banner } from '@/components/Banner';

export const metadata = { title: 'Join group' };

export default async function JoinPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const admin = createAdminClient();
  const { data } = await admin
    .from('group_invites')
    .select('expires_at, max_uses, use_count, revoked_at, groups!inner(name, description)')
    .eq('token', token)
    .maybeSingle();
  const inv = data as unknown as { expires_at: string | null; max_uses: number | null; use_count: number; revoked_at: string | null; groups: { name: string; description: string | null } } | null;
  const valid =
    inv && !inv.revoked_at && (!inv.expires_at || new Date(inv.expires_at) > new Date()) && (inv.max_uses == null || inv.use_count < inv.max_uses);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4 text-center">
      <Banner error={sp.error} />
      {!valid ? (
        <>
          <h1 className="text-2xl font-bold">Invite not valid</h1>
          <p className="muted">This invite link is invalid, expired or revoked. Ask the group admin for a new one.</p>
        </>
      ) : (
        <>
          <p className="muted">You’ve been invited to join</p>
          <h1 className="text-3xl font-bold">{inv!.groups.name}</h1>
          {inv!.groups.description && <p className="muted">{inv!.groups.description}</p>}
          {user ? (
            <form action={joinByToken}>
              <input type="hidden" name="token" value={token} />
              <button className="btn-primary w-full">Join group</button>
            </form>
          ) : (
            <Link className="btn-primary" href={`/login?next=${encodeURIComponent('/join/' + token)}`}>Sign in to join</Link>
          )}
        </>
      )}
    </main>
  );
}
