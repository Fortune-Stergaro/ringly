'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth';
import { fail } from '@/lib/flash';
import { isValidZone } from '@/lib/time';
import { DEFAULT_TZ } from '@/lib/constants';

export async function createGroup(fd: FormData) {
  const { supabase } = await requireUser();
  const name = String(fd.get('name') ?? '').trim();
  const tz = String(fd.get('timezone') ?? DEFAULT_TZ);
  if (name.length < 2) fail('/app/groups', 'Group name is too short');
  if (!isValidZone(tz)) fail('/app/groups', 'Unknown time zone');
  const { data, error } = await supabase.rpc('create_group', {
    p_name: name,
    p_description: String(fd.get('description') ?? ''),
    p_timezone: tz,
  });
  if (error) fail('/app/groups', error.message);
  revalidatePath('/app/groups');
  redirect(`/app/groups/${data}`);
}

export async function joinByCode(fd: FormData) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc('join_group_by_code', { p_code: String(fd.get('code') ?? '') });
  if (error) fail('/app/groups', error.message);
  revalidatePath('/app', 'layout');
  redirect(`/app/groups/${data}`);
}

export async function joinByToken(fd: FormData) {
  const token = String(fd.get('token') ?? '');
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc('join_group_by_token', { p_token: token });
  if (error) fail(`/join/${token}`, error.message);
  revalidatePath('/app', 'layout');
  redirect(`/app/groups/${data}?welcome=1`);
}

export async function leaveGroup(fd: FormData) {
  const gid = String(fd.get('groupId'));
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from('group_members').delete().eq('group_id', gid).eq('user_id', user.id);
  if (error) fail(`/app/groups/${gid}`, error.message);
  revalidatePath('/app', 'layout');
  redirect('/app/groups');
}

export async function updateGroup(fd: FormData) {
  const gid = String(fd.get('groupId'));
  const back = `/app/groups/${gid}?tab=settings`;
  const { supabase } = await requireUser();
  const tz = String(fd.get('timezone') ?? DEFAULT_TZ);
  if (!isValidZone(tz)) fail(back, 'Unknown time zone');
  const { error } = await supabase
    .from('groups')
    .update({
      name: String(fd.get('name') ?? '').trim(),
      description: String(fd.get('description') ?? '').trim() || null,
      timezone: tz,
      invite_code_enabled: fd.get('invite_code_enabled') === 'on',
    })
    .eq('id', gid);
  if (error) fail(back, error.message);
  revalidatePath(`/app/groups/${gid}`);
  redirect(back);
}

export async function regenerateCode(fd: FormData) {
  const gid = String(fd.get('groupId'));
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('regenerate_invite_code', { p_group: gid });
  if (error) fail(`/app/groups/${gid}?tab=settings`, error.message);
  revalidatePath(`/app/groups/${gid}`);
  redirect(`/app/groups/${gid}?tab=settings`);
}

export async function createInvite(fd: FormData) {
  const gid = String(fd.get('groupId'));
  const back = `/app/groups/${gid}?tab=settings`;
  const { supabase, user } = await requireUser();
  const days = Number(fd.get('days') || 0);
  const max = Number(fd.get('max_uses') || 0);
  const { error } = await supabase.from('group_invites').insert({
    group_id: gid,
    created_by: user.id,
    expires_at: days > 0 ? new Date(Date.now() + days * 86400_000).toISOString() : null,
    max_uses: max > 0 ? max : null,
  });
  if (error) fail(back, error.message);
  revalidatePath(`/app/groups/${gid}`);
  redirect(back);
}

export async function revokeInvite(fd: FormData) {
  const gid = String(fd.get('groupId'));
  const { supabase } = await requireUser();
  await supabase.from('group_invites').update({ revoked_at: new Date().toISOString() }).eq('id', String(fd.get('inviteId')));
  revalidatePath(`/app/groups/${gid}`);
  redirect(`/app/groups/${gid}?tab=settings`);
}

export async function setMemberRole(fd: FormData) {
  const gid = String(fd.get('groupId'));
  const back = `/app/groups/${gid}?tab=members`;
  const { supabase } = await requireUser();
  const role = String(fd.get('role')) === 'admin' ? 'admin' : 'member';
  const { error } = await supabase.rpc('set_member_role', {
    p_group: gid,
    p_user: String(fd.get('userId')),
    p_role: role,
    p_urgent: fd.get('urgent') === 'on',
  });
  if (error) fail(back, error.message);
  revalidatePath(`/app/groups/${gid}`);
  redirect(back);
}

export async function removeMember(fd: FormData) {
  const gid = String(fd.get('groupId'));
  const back = `/app/groups/${gid}?tab=members`;
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('remove_member', { p_group: gid, p_user: String(fd.get('userId')) });
  if (error) fail(back, error.message);
  revalidatePath(`/app/groups/${gid}`);
  redirect(back);
}
