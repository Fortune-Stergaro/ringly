'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { DateTime } from 'luxon';
import { requireUser } from '@/server/auth';
import { fail } from '@/lib/flash';
import { eventInputSchema } from '@/lib/validation';
import { localToUtcISO } from '@/lib/time';
import { expandOccurrences } from '@/server/scheduling/recurrence';
import { processDueJobs } from '@/server/scheduling/processor';

export type SaveEventResult = { ok: true; eventId: string; occurrenceId: string | null } | { ok: false; error: string };

export async function saveEvent(raw: unknown): Promise<SaveEventResult> {
  const parsed = eventInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const i = parsed.data;
  const { supabase } = await requireUser();

  let startsAt: string;
  try {
    startsAt = localToUtcISO(i.date, i.time, i.timezone);
  } catch {
    return { ok: false, error: 'Invalid date or time' };
  }
  if (!i.id && !i.recurrence && DateTime.fromISO(startsAt) < DateTime.utc()) {
    return { ok: false, error: 'The start time is in the past' };
  }

  const occurrences = expandOccurrences(startsAt, i.timezone, i.recurrence);
  const offsets = [...new Set(i.reminderOffsets)].sort((a, b) => b - a);

  const { data, error } = await supabase.rpc('upsert_event', {
    p: {
      id: i.id ?? null,
      group_id: i.groupId,
      title: i.title,
      description: i.description,
      location: i.location,
      meeting_url: i.meetingUrl,
      category: i.category,
      priority: i.priority,
      starts_at: startsAt,
      duration_minutes: i.durationMinutes ?? null,
      timezone: i.timezone,
      recurrence: i.recurrence,
      occurrences,
      reminder_offsets: offsets,
      require_ack: i.requireAck,
      allow_snooze: i.allowSnooze,
      notify: i.notify,
    },
  });
  if (error) return { ok: false, error: error.message };
  const eventId = data as string;

  // Push the "new/updated event" notification right away instead of waiting for the next cron tick.
  await processDueJobs({ maxMs: 8000 }).catch(() => undefined);

  const { data: occ } = await supabase
    .from('event_occurrences')
    .select('id')
    .eq('event_id', eventId)
    .eq('status', 'scheduled')
    .gte('occurrence_start', new Date().toISOString())
    .order('occurrence_start')
    .limit(1);

  revalidatePath(`/app/groups/${i.groupId}`);
  revalidatePath('/app');
  return { ok: true, eventId, occurrenceId: occ?.[0]?.id ?? null };
}

export async function cancelEvent(fd: FormData) {
  const eventId = String(fd.get('eventId'));
  const occurrenceId = String(fd.get('occurrenceId') || '') || null;
  const groupId = String(fd.get('groupId'));
  const scope = String(fd.get('scope'));
  const { supabase } = await requireUser();
  const back = occurrenceId ? `/app/events/${occurrenceId}` : `/app/groups/${groupId}`;
  const { error } = await supabase.rpc('cancel_event', {
    p_event: eventId,
    p_occurrence: scope === 'occurrence' ? occurrenceId : null,
    p_notify: true,
  });
  if (error) fail(back, error.message);
  await processDueJobs({ maxMs: 8000 }).catch(() => undefined);
  revalidatePath(`/app/groups/${groupId}`);
  revalidatePath('/app');
  redirect(`/app/groups/${groupId}`);
}
