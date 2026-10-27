import { signOut } from '@/app/actions/auth';

export default function Suspended() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Account suspended</h1>
      <p className="muted">Your account has been suspended. If you think this is a mistake, contact the platform administrator.</p>
      <form action={signOut}><button className="btn-ghost">Sign out</button></form>
    </main>
  );
}
