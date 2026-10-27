export type Role = 'owner' | 'admin' | 'member';

export interface Profile {
  id: string;
  display_name: string;
  timezone: string;
  is_platform_admin: boolean;
  suspended_at: string | null;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  timezone: string;
  invite_code: string;
  invite_code_enabled: boolean;
}

export interface Job {
  id: string;
  kind: 'reminder' | 'announcement' | 'urgent' | 'event_change' | 'snooze' | 'test';
  group_id: string;
  occurrence_id: string | null;
  announcement_id: string | null;
  target_user_id: string | null;
  offset_minutes: number | null;
  run_at: string;
  status: string;
  attempts: number;
  payload: Record<string, unknown>;
}

export interface PushPayload {
  kind: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  groupId: string;
  occurrenceId?: string;
  requireAck: boolean;
  allowSnooze: boolean;
  alarm: boolean;
  priority: 'normal' | 'important' | 'urgent';
  sentAt: string;
}
