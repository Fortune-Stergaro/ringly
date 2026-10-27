import Link from 'next/link';
import { BellRing, CalendarClock, CheckCheck, Users } from 'lucide-react';
import { BRAND } from '@/lib/brand';

export default function Landing() {
  const steps = [
    { icon: Users, title: 'Create a group', text: 'Class rep, club lead or team captain creates a group and shares one invite link.' },
    { icon: CalendarClock, title: 'Schedule once', text: 'Set the event, repeat rules and reminder times. Everyone in the group gets the same schedule.' },
    { icon: BellRing, title: 'Everyone is alerted', text: 'Push reminders and an in-app alarm go out at the times you chose. Members acknowledge with one tap.' },
  ];
  return (
    <main>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <span className="text-lg font-bold">{BRAND.name}</span>
        <nav className="flex gap-2">
          <Link href="/login" className="btn-ghost">Sign in</Link>
          <Link href="/signup" className="btn-primary">Get started</Link>
        </nav>
      </header>
      <section className="mx-auto max-w-5xl px-4 py-16 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{BRAND.tagline}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
          A shared schedule where an admin sets the alarm for the whole group, like a WhatsApp announcement that actually rings.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/signup" className="btn-primary !px-6 !py-3">Create your group</Link>
          <Link href="/login" className="btn-ghost !px-6 !py-3">Sign in</Link>
        </div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-12 sm:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="card">
            <s.icon aria-hidden className="mb-3 text-teal-700" />
            <h2 className="font-semibold">{i + 1}. {s.title}</h2>
            <p className="muted mt-1">{s.text}</p>
          </div>
        ))}
      </section>
      <section className="mx-auto max-w-3xl px-4 pb-16">
        <div className="card">
          <h2 className="flex items-center gap-2 font-semibold"><CheckCheck aria-hidden size={18} /> What we promise, and what we can’t</h2>
          <p className="muted mt-2">
            Ringly schedules on the server and sends web push at the right time. Your phone and browser control sound, silent mode, Do Not Disturb and
            battery saving, so we can’t force a loud alarm on every device. Admins see who acknowledged and which devices accepted the push, not whether
            someone attended.
          </p>
        </div>
      </section>
      <footer className="mx-auto max-w-5xl px-4 pb-8 text-sm text-slate-500">
        <Link href="/privacy" className="underline">Privacy</Link> · <Link href="/terms" className="underline">Terms</Link>
      </footer>
    </main>
  );
}
