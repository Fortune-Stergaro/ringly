'use client';

import { useCallback, useEffect, useState } from 'react';

export interface DeviceRow {
  id: string;
  endpoint: string;
  device_label: string | null;
  platform: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  is_active: boolean;
}

function b64ToUint8(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function deviceInfo() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const platform = isIOS ? 'ios' : isAndroid ? 'android' : 'desktop';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return { isIOS, standalone, platform, label: `${browser} on ${platform}` };
}

export function NotificationSetup({ devices }: { devices: DeviceRow[] }) {
  const [supported, setSupported] = useState(true);
  const [perm, setPerm] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [info, setInfo] = useState({ isIOS: false, standalone: false, platform: 'desktop', label: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [audioOk, setAudioOk] = useState(false);
  const [installEvt, setInstallEvt] = useState<Event & { prompt?: () => Promise<void> } | null>(null);

  const refresh = useCallback(async () => {
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setSupported(ok);
    setInfo(deviceInfo());
    if (!ok) return;
    setPerm(Notification.permission);
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    setSubscribed(Boolean(sub));
  }, []);

  useEffect(() => {
    refresh();
    try {
      setAudioOk(localStorage.getItem('ringly:audio') === '1');
    } catch {
      /* ignore */
    }
    const h = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as Event & { prompt?: () => Promise<void> });
    };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, [refresh]);

  async function enable() {
    setBusy(true);
    setMsg('');
    try {
      const result = await Notification.requestPermission();
      setPerm(result);
      if (result !== 'granted') {
        setMsg('Permission was not granted. Allow notifications for this site in your browser settings, then try again.');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error('Missing VAPID public key');
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key) }));
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), label: info.label, platform: info.platform }),
      });
      if (!res.ok) throw new Error('Server could not save this device');
      setSubscribed(true);
      setMsg('This device is registered. Send a test to check it.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const j = (await res.json()) as { total: number; sent: number; failed: number; expired: number };
      if (j.total === 0) setMsg('No registered device found. Enable notifications first.');
      else
        setMsg(
          `Push accepted by the push service for ${j.sent} of ${j.total} device(s)` +
            (j.failed || j.expired ? ` (${j.failed} failed, ${j.expired} expired)` : '') +
            '. If you don’t see it, check Do Not Disturb, battery saver and this site’s notification settings. A test does not guarantee future alarms will be audible.',
        );
    } finally {
      setBusy(false);
    }
  }

  async function unlockAudio() {
    try {
      const a = new Audio('/sounds/alarm.wav');
      a.volume = 0.4;
      await a.play();
      setTimeout(() => a.pause(), 700);
      localStorage.setItem('ringly:audio', '1');
      setAudioOk(true);
    } catch {
      setMsg('Your browser blocked audio. Tap the button again.');
    }
  }

  async function remove(endpoint: string) {
    await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint }) });
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub?.endpoint === endpoint) await sub.unsubscribe();
    window.location.reload();
  }

  const needsInstall = info.isIOS && !info.standalone;
  const status = !supported ? 'unsupported' : needsInstall ? 'install' : perm === 'denied' ? 'blocked' : subscribed ? 'ready' : 'off';
  const statusLabel = { unsupported: 'Not supported here', install: 'Add to Home Screen first', blocked: 'Permission blocked', ready: 'Ready', off: 'Not enabled' }[status];
  const statusColor = status === 'ready' ? 'bg-teal-100 text-teal-900' : 'bg-amber-100 text-amber-900';

  return (
    <section className="card space-y-4" aria-labelledby="notif-h">
      <div className="flex items-center justify-between gap-2">
        <h2 id="notif-h" className="text-lg font-semibold">Alerts on this device</h2>
        <span className={`badge ${statusColor}`}>{statusLabel}</span>
      </div>
      <p className="muted">
        Group alarms reach you as push notifications. Your phone and browser decide how they look and sound — silent mode, Do Not Disturb and battery
        saving can mute or delay them. Ringly never claims a phone rang; it only reports what it can verify.
      </p>

      {!supported && <p className="text-sm">This browser doesn’t support web push. Try Chrome on Android, or install the app on iPhone (iOS 16.4+).</p>}

      {needsInstall && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">iPhone/iPad: install first</p>
          <ol className="ml-5 list-decimal">
            <li>Open this site in Safari.</li>
            <li>Tap the Share button, then “Add to Home Screen”.</li>
            <li>Open Ringly from your Home Screen and return to this page.</li>
          </ol>
        </div>
      )}

      {installEvt?.prompt && !info.standalone && (
        <button className="btn-ghost" onClick={() => installEvt.prompt?.()}>Install the app</button>
      )}

      <div className="flex flex-wrap gap-2">
        {supported && !needsInstall && !subscribed && perm !== 'denied' && (
          <button className="btn-primary" disabled={busy} onClick={enable}>Enable notifications</button>
        )}
        {subscribed && <button className="btn-primary" disabled={busy} onClick={test}>Send test notification</button>}
        <button className="btn-ghost" onClick={unlockAudio}>{audioOk ? 'In-app sound enabled ✓' : 'Enable in-app alarm sound'}</button>
      </div>
      {perm === 'denied' && <p className="text-sm text-red-700">Notifications are blocked for this site. Re-enable them in your browser’s site settings.</p>}
      {msg && <p role="status" className="text-sm">{msg}</p>}

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Android tips</summary>
        <ul className="ml-5 mt-2 list-disc muted">
          <li>Allow notifications for Chrome (or the installed app) in Android settings.</li>
          <li>Turn off battery optimisation for Chrome so scheduled alerts aren’t delayed.</li>
          <li>Set the notification category to “Alerting/Make sound”.</li>
        </ul>
      </details>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Registered devices</h3>
        {devices.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-medium">{d.device_label ?? 'Device'}</p>
                  <p className="muted">
                    {d.is_active ? 'Active' : 'Inactive (expired)'} ·{' '}
                    {d.last_success_at ? `last push ${new Date(d.last_success_at).toLocaleString()}` : 'no successful push yet'}
                  </p>
                </div>
                <button className="btn-ghost !px-3 !py-1" onClick={() => remove(d.endpoint)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
