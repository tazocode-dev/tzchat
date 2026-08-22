self.addEventListener('push', function (event) {
  const data = event.data ? event.data.json() : {};
  const n = data.notification || {};
  const title = n.title || '알림';
  const body  = n.body  || '';
  const extra = data.data || {};

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: extra,
      icon: '/icons/icon-192.png'
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const rawRoomId = event.notification?.data?.roomId;
  const roomId = typeof rawRoomId === 'string' && /^[a-f\d]{24}$/i.test(rawRoomId)
    ? rawRoomId
    : '';
  const targetUrl = roomId ? `/home/chat/${roomId}` : '/';

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
