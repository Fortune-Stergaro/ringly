/* Ringly service worker: Web Push display + notification actions. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Notification', body: event.data ? event.data.text() : '' };
  }

  const loud = data.priority === 'important' || data.priority === 'urgent';
  const actions = [];
  if (data.requireAck && data.occurrenceId) actions.push({ action: 'ack', title: 'Acknowledge' });
  if (data.allowSnooze && data.alarm && data.occurrenceId) actions.push({ action: 'snooze', title: 'Snooze 5 min' });
  if (actions.length === 0) actions.push({ action: 'view', title: 'View' });

  const options = {
    body: data.body || '',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    requireInteraction: loud,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: loud ? [500, 200, 500, 200, 500, 200, 800] : [200, 100, 200],
    actions: actions.slice(0, 2),
    data: { url: data.url || '/app', occurrenceId: data.occurrenceId || null, alarm: Boolean(data.alarm) },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || 'Notification', options),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        list.forEach((c) => c.postMessage({ type: 'PUSH_RECEIVED', payload: data }));
      }),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};

  if ((event.action === 'ack' || event.action === 'snooze') && d.occurrenceId) {
    const path = event.action === 'ack' ? 'ack' : 'snooze';
    event.waitUntil(fetch(`/api/occurrences/${d.occurrenceId}/${path}`, { method: 'POST', credentials: 'include' }).catch(() => {}));
    return;
  }

  const target = d.alarm && d.occurrenceId ? `/alarm/${d.occurrenceId}` : d.url || '/app';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
      for (const c of list) {
        if ('focus' in c) {
          await c.focus();
          if ('navigate' in c) {
            try {
              await c.navigate(target);
            } catch (e) {
              /* ignore */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const sub = await self.registration.pushManager.subscribe(
        (event.oldSubscription && event.oldSubscription.options) || { userVisibleOnly: true },
      );
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subscription: sub.toJSON(), label: 'Re-subscribed device' }),
      });
    })().catch(() => {}),
  );
});
