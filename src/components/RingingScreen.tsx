'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing } from 'lucide-react';

interface Props {
  title: string;
  subtitle: string;
  details?: string;
  occurrenceId?: string;
  canAck: boolean;
  alreadyAcked: boolean;
  canSnooze: boolean;
  viewHref: string;
  urgent?: boolean;
}

const MAX_RING_MS = 2 * 60 * 1000;

export function RingingScreen(p: Props) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [ringing, setRinging] = useState(true);
  const [acked, setAcked] = useState(p.alreadyAcked);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const audio = new Audio('/sounds/alarm.wav');
    audio.loop = true;
    audioRef.current = audio;
    audio.play().catch(() => setNeedsTap(true));
    if ('vibrate' in navigator) navigator.vibrate([500, 250, 500, 250, 500, 250, 800]);

    const lockRef: { current: { release: () => Promise<void> } | null } = { current: null };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => { lockRef.current = l; }).catch(() => undefined);

    const stop = setTimeout(() => setRinging(false), MAX_RING_MS);
    return () => {
      clearTimeout(stop);
      audio.pause();
      lockRef.current?.release().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!ringing) audioRef.current?.pause();
  }, [ringing]);

  async function post(path: 'ack' | 'snooze') {
    if (!p.occurrenceId) return;
    const res = await fetch(`/api/occurrences/${p.occurrenceId}/${path}`, { method: 'POST' });
    if (!res.ok) {
      setMsg(path === 'ack' ? 'Could not acknowledge.' : 'Snooze is not available.');
      return false;
    }
    return true;
  }

  return (
    <main className={`flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center text-white ${p.urgent ? 'bg-red-800' : 'bg-teal-900'}`}>
      <BellRing size={72} aria-hidden className={ringing ? 'motion-safe:animate-bounce' : ''} />
      <div aria-live="assertive">
        <p className="text-sm uppercase tracking-widest opacity-80">{p.urgent ? 'Urgent alert' : ringing ? 'Alarm' : 'Alarm (stopped)'}</p>
        <h1 className="mt-2 text-3xl font-bold">{p.title}</h1>
        <p className="mt-2 text-lg opacity-90">{p.subtitle}</p>
        {p.details && <p className="mt-2 opacity-80">{p.details}</p>}
      </div>

      {needsTap && ringing && (
        <button className="rounded-xl bg-white px-6 py-3 font-semibold text-slate-900" onClick={() => audioRef.current?.play().then(() => setNeedsTap(false)).catch(() => undefined)}>
          Tap to enable sound
        </button>
      )}

      <div className="flex w-full max-w-sm flex-col gap-3">
        {p.canAck && !acked && (
          <button
            className="rounded-xl bg-white px-6 py-4 text-lg font-semibold text-slate-900"
            onClick={async () => {
              if (await post('ack')) {
                setAcked(true);
                setRinging(false);
              }
            }}
          >
            Acknowledge
          </button>
        )}
        {acked && <p className="font-medium">✓ Acknowledged</p>}
        {p.canSnooze && ringing && (
          <button
            className="rounded-xl border border-white/60 px-6 py-3 font-medium"
            onClick={async () => {
              if (await post('snooze')) {
                setRinging(false);
                setMsg('Snoozed for 5 minutes.');
              }
            }}
          >
            Snooze 5 min
          </button>
        )}
        <button className="rounded-xl border border-white/60 px-6 py-3 font-medium" onClick={() => router.push(p.viewHref)}>
          {p.occurrenceId ? 'View details' : 'Open group'}
        </button>
        {!p.canAck && (
          <button className="rounded-xl px-6 py-2 text-sm underline" onClick={() => setRinging(false)}>
            Dismiss
          </button>
        )}
      </div>
      {msg && <p role="status">{msg}</p>}
    </main>
  );
}
