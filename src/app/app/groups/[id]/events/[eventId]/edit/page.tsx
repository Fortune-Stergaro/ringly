import { notFound, redirect } from 'next/navigation';
import { DateTime } from 'luxon';
import { requireUser } from '@/server/auth';
import { EventForm, type EventInitial } from '@/components/EventForm';
import type { Recurrence } from '@/server/scheduling/recurrence';

export const metadata = { title: 'Edit event' };

export default async function EditEvent({ params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { id, eventId } = await params;
  const { supabase, user } = await requireUser();
  const { data: e } = await supabase.from('events').select('*').eq('id', eventId).eq('group_id', id).single();
  if (!e) notFound();
  const { data: me } = await supabase.from('group_members').select('role').eq('group_id', id).eq('user_id', user.id).single();
  if (!me || me.role === 'member' || e.status === 'cancelled') redirect(`/app/groups/${id}`);

  const start = DateTime.fromISO(e.starts_at, { zone: 'utc' }).setZone(e.timezone);
  const initial: EventInitial = {
    id: e.id,
    title: e.title,
    description: e.description ?? '',
    location: e.location ?? '',
    meetingUrl: e.meeting_url ?? '',
    category: e.category,
    priority: e.priority,
    date: start.toFormat('yyyy-MM-dd'),
    time: start.toFormat('HH:mm'),
    durationMinutes: e.duration_minutes,
    timezone: e.timezone,
    recurrence: (e.recurrence as Recurrence | null) ?? null,
    reminderOffsets: e.reminder_offsets,
    requireAck: e.require_ack,
    allowSnooze: e.allow_snooze,
  };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Edit event</h1>
      <p className="muted">Changes apply to the whole series. Members are told about reschedules and old reminders are cancelled automatically.</p>
      <EventForm groupId={id} initial={initial} />
    </div>
  );
}
