import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth';
import { RingingScreen } from '@/components/RingingScreen';

export const metadata = { title: 'Urgent alert' };

export default async function AlertPage({ params }: { params: Promise<{ announcementId: string }> }) {
  const { announcementId } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from('announcements')
    .select('id, title, body, group_id, groups!inner(name), profiles(display_name)')
    .eq('id', announcementId)
    .single();
  if (!data) notFound();
  const a = data as unknown as { id: string; title: string; body: string; group_id: string; groups: { name: string }; profiles: { display_name: string } | null };
  return (
    <RingingScreen
      urgent
      title={a.title}
      subtitle={`${a.groups.name} · from ${a.profiles?.display_name ?? 'an admin'}`}
      details={a.body || undefined}
      canAck={false}
      alreadyAcked={false}
      canSnooze={false}
      viewHref={`/app/groups/${a.group_id}?tab=announcements`}
    />
  );
}
