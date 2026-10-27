'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export interface UpcomingOcc {
  id: string;
  startMs: number;
}

const GRACE_MS = 10 * 60 * 1000;
const seenKey = (id: string) => `ringly:rang:${id}`;

/**
 * Foreground alarm: while the app is open, ring at event time even if a push is late,
 * and ring immediately when the service worker reports a high-priority push.
 * Push remains the primary path when the app is closed.
 */
export function AlarmProvider({ upcoming }: { upcoming: UpcomingOcc[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    const ring = (id: string, href: string) => {
      try {
        if (localStorage.getItem(seenKey(id))) return;
        localStorage.setItem(seenKey(id), String(Date.now()));
      } catch {
        /* storage unavailable */
      }
      if (pathRef.current !== href) router.push(href);
    };

    const timers: ReturnType<typeof setTimeout>[] = [];
    const check = () => {
      const now = Date.now();
      for (const o of upcoming) {
        const delta = o.startMs - now;
        if (delta <= 0 && delta > -GRACE_MS && document.visibilityState === 'visible') ring(o.id, `/alarm/${o.id}`);
        else if (delta > 0 && delta < 24 * 3600_000) timers.push(setTimeout(() => ring(o.id, `/alarm/${o.id}`), delta));
      }
    };
    check();
    const onVis = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVis);

    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; payload?: { alarm?: boolean; priority?: string; occurrenceId?: string; url?: string; tag?: string } };
      if (d?.type !== 'PUSH_RECEIVED' || !d.payload) return;
      const pl = d.payload;
      if (pl.alarm && pl.occurrenceId) ring(pl.occurrenceId, `/alarm/${pl.occurrenceId}`);
      else if (pl.priority === 'urgent' && pl.url) ring(pl.tag ?? pl.url, pl.url);
    };
    navigator.serviceWorker?.addEventListener('message', onMsg);

    return () => {
      timers.forEach(clearTimeout);
      document.removeEventListener('visibilitychange', onVis);
      navigator.serviceWorker?.removeEventListener('message', onMsg);
    };
  }, [upcoming, router]);

  return null;
}
