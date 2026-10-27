import Link from 'next/link';
import { requireUser } from '@/server/auth';
import { createGroup, joinByCode } from '@/app/actions/groups';
import { Banner } from '@/components/Banner';

export const metadata = { title: 'Groups' };

export default async function Groups({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser();
  const { data } = await supabase.from('group_members').select('role, groups(id, name, description)').eq('user_id', profile.id);
  const rows = (data ?? []) as unknown as { role: string; groups: { id: string; name: string; description: string | null } }[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Your groups</h1>
      <Banner error={sp.error} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.length === 0 && <li className="muted">You’re not in any group yet.</li>}
        {rows.map((r) => (
          <li key={r.groups.id}>
            <Link href={`/app/groups/${r.groups.id}`} className="card block hover:border-teal-600">
              <p className="font-semibold">{r.groups.name}</p>
              {r.groups.description && <p className="muted line-clamp-2">{r.groups.description}</p>}
              <span className="badge mt-2 bg-slate-100 text-slate-700">{r.role}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="grid gap-4 md:grid-cols-2">
        <form action={joinByCode} className="card space-y-3">
          <h2 className="font-semibold">Join with a code</h2>
          <input name="code" required maxLength={8} className="input uppercase tracking-widest" placeholder="ABCD2345" aria-label="Invite code" />
          <button className="btn-primary">Join</button>
        </form>
        <form action={createGroup} className="card space-y-3">
          <h2 className="font-semibold">Create a group</h2>
          <input name="name" required minLength={2} maxLength={80} className="input" placeholder="CPE 2024" aria-label="Group name" />
          <input name="description" className="input" placeholder="Description (optional)" aria-label="Description" />
          <input name="timezone" className="input" defaultValue={profile.timezone} aria-label="Time zone" />
          <button className="btn-primary">Create group</button>
        </form>
      </div>
    </div>
  );
}
