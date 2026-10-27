'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fail, safeNext } from '@/lib/flash';

export async function signIn(fd: FormData) {
  const next = safeNext(fd.get('next'));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(fd.get('email') ?? '').trim(),
    password: String(fd.get('password') ?? ''),
  });
  if (error) fail(`/login?next=${encodeURIComponent(next)}`, error.message);
  redirect(next);
}

export async function signUp(fd: FormData) {
  const next = safeNext(fd.get('next'));
  const email = String(fd.get('email') ?? '').trim();
  const password = String(fd.get('password') ?? '');
  const name = String(fd.get('name') ?? '').trim();
  if (password.length < 8) fail('/signup', 'Password must be at least 8 characters');
  if (name.length < 2) fail('/signup', 'Please enter your name');
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: name },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) fail('/signup', error.message);
  if (!data.session) redirect('/login?message=' + encodeURIComponent('Check your email to confirm your account, then sign in.'));
  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
