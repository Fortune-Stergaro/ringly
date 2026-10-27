import Link from 'next/link';
import { CalendarDays, Home, Settings, Shield, Users } from 'lucide-react';
import { requireUser } from '@/server/auth';
import { AlarmProvider, type UpcomingOcc } from '@/components/AlarmProvider';
import { SwRegister } from '@/components/SwRegister';
import { signOut } from '@/app/actions/auth';
import { BRAND } from '@/lib/brand';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireUser();

  const { data } = await supabase
    .from('event_occurrences')
    .select('id, occurrence_start, events!inner(status)')
    .eq('status', 'scheduled')
    .eq('events.status', 'scheduled')
    .gte('occurrence_start', new Date(Date.now() - 10 * 60_000).toISOString())
    .lte('occurrence_start', new Date(Date.now() + 24 * 3600_000).toISOString());
  const upcoming: UpcomingOcc[] = (data ?? []).map((o) => ({ id: o.id as string, startMs: new Date(o.occurrence_start as string).getTime() }));

  const links = [
    { href: '/app', label: 'Home', icon: Home },
    { href: '/app/groups', label: 'Groups', icon: Users },
    { href: '/app/settings', label: 'Settings', icon: Settings },
    ...(profile.is_platform_admin ? [{ href: '/app/admin', label: 'Admin', icon: Shield }] : []),
  ];

  return (
    <div className="min-h-dvh pb-20 md:pb-8">
      <SwRegister />
      <AlarmProvider upcoming={upcoming} />
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/app" className="flex items-center gap-2 font-bold"><CalendarDays aria-hidden size={20} className="text-teal-700" /> {BRAND.name}</Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {links.map((l) => <Link key={l.href} href={l.href} className="rounded-lg px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">{l.label}</Link>)}
            <form action={signOut}><button className="rounded-lg px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">Sign out</button></form>
          </nav>
          <span className="text-sm text-slate-600 md:hidden dark:text-slate-400">{profile.display_name}</span>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-slate-200 bg-white py-2 md:hidden dark:border-slate-800 dark:bg-slate-900" aria-label="Main">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="flex flex-col items-center gap-0.5 px-3 py-1 text-xs"><l.icon aria-hidden size={20} />{l.label}</Link>
        ))}
      </nav>
    </div>
  );
}
