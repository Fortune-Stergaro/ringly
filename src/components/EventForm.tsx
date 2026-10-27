'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DateTime } from 'luxon';
import { saveEvent } from '@/app/actions/events';
import { CATEGORIES, OFFSET_CHOICES, REMINDER_PRESETS } from '@/lib/constants';
import { offsetLabel } from '@/lib/time';
import { describeRecurrence, type Recurrence } from '@/server/scheduling/recurrence';

export interface EventInitial {
  id?: string;
  title: string;
  description: string;
  location: string;
  meetingUrl: string;
  category: (typeof CATEGORIES)[number];
  priority: 'normal' | 'important';
  date: string;
  time: string;
  durationMinutes: number | null;
  timezone: string;
  recurrence: Recurrence | null;
  reminderOffsets: number[];
  requireAck: boolean;
  allowSnooze: boolean;
}

const DAYS = [
  [1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun'],
] as const;

function presetOf(offsets: number[]): 'standard' | 'important' | 'early' | 'custom' {
  const key = [...offsets].sort((a, b) => b - a).join(',');
  for (const [k, v] of Object.entries(REMINDER_PRESETS)) if ([...v.offsets].sort((a, b) => b - a).join(',') === key) return k as 'standard' | 'important' | 'early';
  return 'custom';
}

export function EventForm({ groupId, initial }: { groupId: string; initial: EventInitial }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [f, setF] = useState(initial);
  const [preset, setPreset] = useState(presetOf(initial.reminderOffsets));
  const [repeat, setRepeat] = useState<'none' | 'daily' | 'weekly' | 'monthly'>(initial.recurrence?.freq ?? 'none');
  const [weekdays, setWeekdays] = useState<number[]>(initial.recurrence?.byWeekday ?? []);
  const [interval, setIntervalN] = useState(initial.recurrence?.interval ?? 1);
  const [ends, setEnds] = useState<'never' | 'on' | 'after'>(initial.recurrence?.until ? 'on' : initial.recurrence?.count ? 'after' : 'never');
  const [until, setUntil] = useState(initial.recurrence?.until ?? '');
  const [count, setCount] = useState(initial.recurrence?.count ?? 10);
  const [notify, setNotify] = useState(true);

  const set = <K extends keyof EventInitial>(k: K, v: EventInitial[K]) => setF((s) => ({ ...s, [k]: v }));

  const recurrence: Recurrence | null = useMemo(() => {
    if (repeat === 'none') return null;
    const r: Recurrence = { freq: repeat, interval };
    if (repeat === 'weekly') r.byWeekday = weekdays.length ? weekdays : undefined;
    if (ends === 'on' && until) r.until = until;
    if (ends === 'after') r.count = count;
    return r;
  }, [repeat, interval, weekdays, ends, until, count]);

  const review = useMemo(() => {
    const start = DateTime.fromISO(`${f.date}T${f.time}`, { zone: f.timezone });
    if (!start.isValid) return null;
    const times = [...f.reminderOffsets].sort((a, b) => b - a).map((o) => ({ o, at: start.minus({ minutes: o }) }));
    return { start, times, past: start < DateTime.now() };
  }, [f.date, f.time, f.timezone, f.reminderOffsets]);

  function pickPreset(p: keyof typeof REMINDER_PRESETS | 'custom') {
    setPreset(p);
    if (p !== 'custom') set('reminderOffsets', [...REMINDER_PRESETS[p].offsets]);
  }
  function toggleOffset(o: number) {
    setPreset('custom');
    set('reminderOffsets', f.reminderOffsets.includes(o) ? f.reminderOffsets.filter((x) => x !== o) : [...f.reminderOffsets, o]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    start(async () => {
      const res = await saveEvent({
        id: f.id,
        groupId,
        title: f.title,
        description: f.description,
        location: f.location,
        meetingUrl: f.meetingUrl,
        category: f.category,
        priority: f.priority,
        date: f.date,
        time: f.time,
        durationMinutes: f.durationMinutes,
        timezone: f.timezone,
        recurrence,
        reminderOffsets: f.reminderOffsets,
        requireAck: f.requireAck,
        allowSnooze: f.allowSnooze,
        notify,
      });
      if (!res.ok) return setError(res.error);
      router.push(res.occurrenceId ? `/app/events/${res.occurrenceId}` : `/app/groups/${groupId}`);
      router.refresh();
    });
  }

  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <div className="card space-y-4">
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" className="input" required maxLength={120} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Mathematics lecture" />
          </div>
          <div>
            <label className="label" htmlFor="desc">Description / instructions</label>
            <textarea id="desc" className="input" rows={3} maxLength={2000} value={f.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="cat">Category</label>
              <select id="cat" className="input" value={f.category} onChange={(e) => set('category', e.target.value as EventInitial['category'])}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="prio">Priority</label>
              <select id="prio" className="input" value={f.priority} onChange={(e) => set('priority', e.target.value as 'normal' | 'important')}>
                <option value="normal">Normal</option>
                <option value="important">Important (sticky notifications)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold">When & where</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="date">Date</label>
              <input id="date" type="date" className="input" required value={f.date} onChange={(e) => set('date', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="time">Start time</label>
              <input id="time" type="time" className="input" required value={f.time} onChange={(e) => set('time', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="dur">Duration (min)</label>
              <input id="dur" type="number" min={1} max={1440} className="input" value={f.durationMinutes ?? ''} onChange={(e) => set('durationMinutes', e.target.value ? Number(e.target.value) : null)} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="tz">Time zone</label>
            <input id="tz" className="input" list="zones" value={f.timezone} onChange={(e) => set('timezone', e.target.value)} />
            <datalist id="zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="loc">Location</label>
              <input id="loc" className="input" maxLength={200} value={f.location} onChange={(e) => set('location', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="url">Meeting link</label>
              <input id="url" className="input" type="url" value={f.meetingUrl} onChange={(e) => set('meetingUrl', e.target.value)} placeholder="https://" />
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold">Repeat</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="rep">Repeats</label>
              <select id="rep" className="input" value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)}>
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly (same date)</option>
              </select>
            </div>
            {repeat !== 'none' && (
              <div>
                <label className="label" htmlFor="int">Every N {repeat === 'daily' ? 'days' : repeat === 'weekly' ? 'weeks' : 'months'}</label>
                <input id="int" type="number" min={1} max={12} className="input" value={interval} onChange={(e) => setIntervalN(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
              </div>
            )}
          </div>
          {repeat === 'weekly' && (
            <fieldset>
              <legend className="label">On days</legend>
              <div className="flex flex-wrap gap-2">
                {DAYS.map(([n, label]) => (
                  <button type="button" key={n} aria-pressed={weekdays.includes(n)} onClick={() => setWeekdays((w) => (w.includes(n) ? w.filter((x) => x !== n) : [...w, n]))}
                    className={`rounded-full border px-3 py-1 text-sm ${weekdays.includes(n) ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 dark:border-slate-700'}`}>{label}</button>
                ))}
              </div>
              <p className="muted mt-1">No days selected = the same weekday as the start date.</p>
            </fieldset>
          )}
          {repeat !== 'none' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="ends">Ends</label>
                <select id="ends" className="input" value={ends} onChange={(e) => setEnds(e.target.value as typeof ends)}>
                  <option value="never">Never (rolling 90 days scheduled)</option>
                  <option value="on">On date</option>
                  <option value="after">After N times</option>
                </select>
              </div>
              {ends === 'on' && <div><label className="label" htmlFor="until">Last date</label><input id="until" type="date" className="input" value={until} onChange={(e) => setUntil(e.target.value)} /></div>}
              {ends === 'after' && <div><label className="label" htmlFor="cnt">Occurrences</label><input id="cnt" type="number" min={1} max={500} className="input" value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} /></div>}
            </div>
          )}
          <p className="muted">{describeRecurrence(recurrence)}</p>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold">Reminders</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Reminder presets">
            {(Object.keys(REMINDER_PRESETS) as (keyof typeof REMINDER_PRESETS)[]).map((k) => (
              <button type="button" key={k} aria-pressed={preset === k} onClick={() => pickPreset(k)}
                className={`rounded-full border px-3 py-1 text-sm ${preset === k ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 dark:border-slate-700'}`}>{REMINDER_PRESETS[k].label}</button>
            ))}
            <button type="button" aria-pressed={preset === 'custom'} onClick={() => pickPreset('custom')}
              className={`rounded-full border px-3 py-1 text-sm ${preset === 'custom' ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 dark:border-slate-700'}`}>Custom</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {OFFSET_CHOICES.map((o) => (
              <label key={o} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1 text-sm dark:border-slate-700">
                <input type="checkbox" checked={f.reminderOffsets.includes(o)} onChange={() => toggleOffset(o)} /> {offsetLabel(o)}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.requireAck} onChange={(e) => set('requireAck', e.target.checked)} /> Ask members to acknowledge</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.allowSnooze} onChange={(e) => set('allowSnooze', e.target.checked)} /> Allow snooze (5 min, up to 3 times)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Notify members now about this {f.id ? 'change' : 'new event'}</label>
        </div>
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="card space-y-3">
          <h2 className="font-semibold">Review</h2>
          {review ? (
            <>
              <p className="text-sm">Starts <b>{review.start.toFormat('ccc d LLL yyyy, h:mm a')}</b> ({f.timezone})</p>
              {review.past && <p className="text-sm text-amber-700">This start time is in the past.</p>}
              <p className="text-sm font-medium">Members will be alerted at:</p>
              <ul className="text-sm">
                {review.times.map(({ o, at }) => <li key={o}>{at.toFormat('ccc d LLL, h:mm a')} <span className="muted">· {o === 0 ? 'event time' : offsetLabel(o)}</span></li>)}
              </ul>
              <p className="muted">{describeRecurrence(recurrence)}</p>
            </>
          ) : <p className="muted">Pick a date and time to preview.</p>}
          {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>}
          <button className="btn-primary w-full" disabled={pending || f.reminderOffsets.length === 0}>{pending ? 'Publishing…' : f.id ? 'Save changes' : 'Publish event'}</button>
          <p className="muted">Members only get alerts if they joined the group and enabled notifications on their device.</p>
        </div>
      </aside>
    </form>
  );
}
