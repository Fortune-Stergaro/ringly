import Link from 'next/link';
import { signIn } from '@/app/actions/auth';
import { Banner } from '@/components/Banner';
import { GoogleButton } from '@/components/GoogleButton';
import { BRAND } from '@/lib/brand';
import { safeNext } from '@/lib/flash';

export const metadata = { title: 'Sign in' };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; next?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-lg font-bold">{BRAND.name}</Link>
      <h1 className="mb-4 text-2xl font-bold">Sign in</h1>
      <Banner error={sp.error} message={sp.message} />
      <form action={signIn} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" className="input" /></div>
        <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" required autoComplete="current-password" className="input" /></div>
        <button className="btn-primary w-full">Sign in</button>
      </form>
      <div className="my-4 text-center text-sm text-slate-500">or</div>
      <GoogleButton next={next} />
      <p className="muted mt-6">No account? <Link className="underline" href={`/signup?next=${encodeURIComponent(next)}`}>Create one</Link></p>
    </main>
  );
}
