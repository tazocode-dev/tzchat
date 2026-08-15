/* /public/firebase-messaging-sw.js */
self.addEventListener('push', function (event) {
  const data = event.data ? event.data.json() : {};
  const n = data.notification || {};
  const title = n.title || '알림';
  const body  = n.body  || '';
  const extra = data.data || {};

  console.log('[SW] push:', { title, body, extra });

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: extra,
      icon: '/icons/icon-192.png',   // 없으면 제거 가능
      badge: '/icons/badge-72.png'   // 없으면 제거 가능
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const roomId = event.notification?.data?.roomId || '';
  const targetUrl = roomId ? `/home/chat/${roomId}` : '/';

  console.log('[SW] click →', targetUrl);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
