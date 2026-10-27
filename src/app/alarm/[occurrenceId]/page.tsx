import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth';
import { RingingScreen } from '@/components/RingingScreen';
import { fmtEvent } from '@/lib/time';

export const metadata = { title: 'Alarm' };

export default async function AlarmPage({ params }: { params: Promise<{ occurrenceId: string }> }) {
  const { occurrenceId } = await params;
  const { supabase, profile, user } = await requireUser();
  const { data } = await supabase
    .from('event_occurrences')
    .select('id, occurrence_start, status, events!inner(title, location, timezone, require_ack, allow_snooze, status, groups!inner(name))')
    .eq('id', occurrenceId)
    .single();
  if (!data) notFound();
  const o = data as unknown as {
    id: string; occurrence_start: string; status: string;
    events: { title: string; location: string | null; timezone: string; require_ack: boolean; allow_snooze: boolean; status: string; groups: { name: string } };
  };
  const { data: ack } = await supabase.from('acknowledgements').select('id').eq('occurrence_id', occurrenceId).eq('user_id', user.id).maybeSingle();
  const active = o.status === 'scheduled' && o.events.status === 'scheduled';

  return (
    <RingingScreen
      title={o.events.title}
      subtitle={`${o.events.groups.name} · ${fmtEvent(o.occurrence_start, o.events.timezone, profile.timezone)}`}
      details={o.events.location ?? undefined}
      occurrenceId={o.id}
      canAck={active}
      alreadyAcked={!!ack}
      canSnooze={active && o.events.allow_snooze}
      viewHref={`/app/events/${o.id}`}
    />
  );
}
