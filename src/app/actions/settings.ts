'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { fail } from '@/lib/flash';
import { isValidZone } from '@/lib/time';

export async function updateProfile(fd: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(fd.get('display_name') ?? '').trim();
  const tz = String(fd.get('timezone') ?? '');
  if (name.length < 2) fail('/app/settings', 'Name is too short');
  if (!isValidZone(tz)) fail('/app/settings', 'Unknown time zone');
  const { error } = await supabase.from('profiles').update({ display_name: name, timezone: tz }).eq('id', user.id);
  if (error) fail('/app/settings', error.message);
  revalidatePath('/app', 'layout');
  redirect('/app/settings?saved=1');
}

export async function toggleMute(fd: FormData) {
  const { supabase, user } = await requireUser();
  const gid = String(fd.get('groupId'));
  const muted = fd.get('muted') === 'true';
  await supabase.from('group_members').update({ muted }).eq('group_id', gid).eq('user_id', user.id);
  revalidatePath('/app/settings');
  redirect('/app/settings');
}

export async function setSuspended(fd: FormData) {
  const { user, profile } = await requireUser();
  if (!profile.is_platform_admin) fail('/app', 'Forbidden');
  const target = String(fd.get('userId'));
  const suspend = fd.get('suspend') === 'true';
  if (target === user.id) fail('/app/admin', 'You cannot suspend yourself');
  const admin = createAdminClient();
  await admin.from('profiles').update({ suspended_at: suspend ? new Date().toISOString() : null }).eq('id', target);
  await admin.from('audit_log').insert({ actor_id: user.id, action: suspend ? 'suspend_user' : 'unsuspend_user', entity: 'profile', entity_id: target });
  revalidatePath('/app/admin');
  redirect('/app/admin');
}
