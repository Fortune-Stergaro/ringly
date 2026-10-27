import Link from 'next/link';
import { signUp } from '@/app/actions/auth';
import { Banner } from '@/components/Banner';
import { GoogleButton } from '@/components/GoogleButton';
import { BRAND } from '@/lib/brand';
import { safeNext } from '@/lib/flash';

export const metadata = { title: 'Create account' };

export default async function Signup({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-lg font-bold">{BRAND.name}</Link>
      <h1 className="mb-4 text-2xl font-bold">Create your account</h1>
      <Banner error={sp.error} />
      <form action={signUp} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <div><label className="label" htmlFor="name">Your name</label><input id="name" name="name" required minLength={2} className="input" autoComplete="name" /></div>
        <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" className="input" /></div>
        <div><label className="label" htmlFor="password">Password (8+ characters)</label><input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="input" /></div>
        <button className="btn-primary w-full">Create account</button>
      </form>
      <div className="my-4 text-center text-sm text-slate-500">or</div>
      <GoogleButton next={next} />
      <p className="muted mt-6">Already have an account? <Link className="underline" href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></p>
    </main>
  );
}
