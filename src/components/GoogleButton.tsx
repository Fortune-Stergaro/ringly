'use client';

import { createClient } from '@/lib/supabase/client';

export function GoogleButton({ next }: { next: string }) {
  return (
    <button
      type="button"
      className="btn-ghost w-full"
      onClick={() =>
        createClient().auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        })
      }
    >
      Continue with Google
    </button>
  );
}
