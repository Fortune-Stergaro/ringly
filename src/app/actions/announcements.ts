'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { fail } from '@/lib/flash';
import { localToUtcISO } from '@/lib/time';
import { processDueJobs } from '@/server/scheduling/processor';

export async function postAnnouncement(fd: FormData) {
  const gid = String(fd.get('groupId'));
  const back = `/app/groups/${gid}?tab=announcements`;
  const { supabase, user } = await requireUser();
  const title = String(fd.get('title') ?? '').trim();
  const body = String(fd.get('body') ?? '').trim();
  const mode = String(fd.get('mode') ?? 'only');
  if (!title) fail(back, 'Title is required');

  const { data: group } = await supabase.from('groups').select('name, timezone').eq('id', gid).single();
  if (!group) fail(back, 'Group not found');

  let laterAt: string | null = null;
  if (mode !== 'only') {
    const when = String(fd.get('when') ?? '');
    if (!when) fail(back, 'Choose when the reminder or alarm should go off');
    const [d, t] = when.split('T');
    try {
      laterAt = localToUtcISO(d, t, group.timezone);
    } catch {
      fail(back, 'Invalid date or time');
    }
    if (new Date(laterAt as string).getTime() < Date.now() + 60_000) fail(back, 'Pick a time in the future');
  }

  const { data: ann, error } = await supabase
    .from('announcements')
    .insert({ group_id: gid, created_by: user.id, title, body, kind: 'normal' })
    .select('id')
    .single();
  if (error || !ann) fail(back, error?.message ?? 'Could not post');

  const admin = createAdminClient();
  const url = `/app/groups/${gid}?tab=announcements`;
  const jobs = [
    {
      kind: 'announcement' as const,
      group_id: gid,
      announcement_id: ann!.id,
      run_at: new Date().toISOString(),
      payload: { title: `${group!.name} · ${title}`, body: body.slice(0, 140), url, priority: 'normal' },
    },
  ];
  if (laterAt) {
    jobs.push({
      kind: 'announcement' as const,
      group_id: gid,
      announcement_id: ann!.id,
      run_at: laterAt,
      payload: {
        title: `${mode === 'alarm' ? '⏰ ' : '🔔 '}${group!.name} · ${title}`,
        body: body.slice(0, 140),
        url,
        priority: mode === 'alarm' ? 'important' : 'normal',
      },
    });
  }
  await admin.from('notification_jobs').insert(jobs);
  await processDueJobs({ maxMs: 8000 }).catch(() => undefined);
  revalidatePath(`/app/groups/${gid}`);
  redirect(back);
}

export async function sendUrgent(fd: FormData) {
  const gid = String(fd.get('groupId'));
  const back = `/app/groups/${gid}?tab=announcements`;
  const { supabase, user } = await requireUser();
  const title = String(fd.get('title') ?? '').trim();
  const body = String(fd.get('body') ?? '').trim();
  if (!title) fail(back, 'Title is required');

  const { data: group } = await supabase.from('groups').select('name').eq('id', gid).single();
  const { data: sender } = await supabase.from('profiles').select('display_name').eq('id', user.id).single();
  // RLS + rate-limit trigger enforce permission and the 2-per-hour cap.
  const { data: ann, error } = await supabase
    .from('announcements')
    .insert({ group_id: gid, created_by: user.id, title, body, kind: 'urgent' })
    .select('id')
    .single();
  if (error || !ann) fail(back, error?.message ?? 'Not allowed to send urgent alerts');

  const admin = createAdminClient();
  await admin.from('notification_jobs').insert({
    kind: 'urgent',
    group_id: gid,
    announcement_id: ann!.id,
    run_at: new Date().toISOString(),
    payload: {
      title: `🚨 URGENT · ${group?.name ?? 'Group'}`,
      body: `${title}${body ? ' — ' + body.slice(0, 120) : ''} (from ${sender?.display_name ?? 'an admin'})`,
      url: `/alert/${ann!.id}`,
      priority: 'urgent',
    },
  });
  await processDueJobs({ maxMs: 15_000 }).catch(() => undefined);
  revalidatePath(`/app/groups/${gid}`);
  redirect(back);
}
