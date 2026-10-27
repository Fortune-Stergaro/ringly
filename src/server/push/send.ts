import 'server-only';
import webpush from 'web-push';

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export type PushOutcome = 'sent' | 'expired' | 'failed' | 'transient';
export interface PushResult {
  outcome: PushOutcome;
  status?: number;
  error?: string;
}

export async function sendPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: unknown,
  opts: { ttl: number; urgent: boolean },
): Promise<PushResult> {
  configure();
  try {
    const res = await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: opts.ttl, urgency: opts.urgent ? 'high' : 'normal' },
    );
    return { outcome: 'sent', status: res.statusCode };
  } catch (e) {
    const err = e as { statusCode?: number; body?: string; message?: string };
    const status = err.statusCode;
    const message = (err.body || err.message || 'push error').toString().slice(0, 300);
    if (status === 404 || status === 410) return { outcome: 'expired', status, error: message };
    if (status && status >= 400 && status < 500 && status !== 429 && status !== 408) {
      return { outcome: 'failed', status, error: message };
    }
    return { outcome: 'transient', status, error: message };
  }
}
