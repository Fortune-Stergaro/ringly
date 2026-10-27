import { notFound, redirect } from 'next/navigation';
import { DateTime } from 'luxon';
import { requireUser } from '@/server/auth';
import { EventForm } from '@/components/EventForm';
import { REMINDER_PRESETS } from '@/lib/constants';

export const metadata = { title: 'New event' };

export default async function NewEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: g } = await supabase.from('groups').select('id, name, timezone').eq('id', id).single();
  if (!g) notFound();
  const { data: me } = await supabase.from('group_members').select('role').eq('group_id', id).eq('user_id', user.id).single();
  if (!me || me.role === 'member') redirect(`/app/groups/${id}`);

  const tomorrow = DateTime.now().setZone(g.timezone).plus({ days: 1 });
  return (
    <div className="space-y-4">
      <div>
        <p className="muted">{g.name}</p>
        <h1 className="text-2xl font-bold">New event</h1>
      </div>
      <EventForm
        groupId={id}
        initial={{
          title: '', description: '', location: '', meetingUrl: '', category: 'meeting', priority: 'normal',
          date: tomorrow.toFormat('yyyy-MM-dd'), time: '09:00', durationMinutes: 60, timezone: g.timezone,
          recurrence: null, reminderOffsets: [...REMINDER_PRESETS.standard.offsets], requireAck: false, allowSnooze: true,
        }}
      />
    </div>
  );
}
