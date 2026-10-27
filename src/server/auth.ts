import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/types';

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!data) redirect('/login');
  const profile = data as Profile;
  if (profile.suspended_at) redirect('/suspended');
  return { supabase, user, profile };
}
