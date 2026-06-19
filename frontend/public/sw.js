/**
 * Kill-switch service worker.
 *
 * The previous SW used cache-first for the app shell, which left Safari users
 * stranded on a cached index.html pointing at hashed asset files the server
 * no longer ships (blank screen). We've removed SW registration from
 * index.html, but any browser that previously registered the old SW still
 * has it active — this version installs, immediately drops every cache,
 * unregisters itself, then reloads all controlled pages so they reach the
 * network fresh.
 *
 * Safe to keep this file in place permanently: future first-time visitors
 * never register it (no registration in HTML), and re-visitors run this
 * shutdown sequence at most once.
 */

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      client.navigate(client.url);
    }
  })());
});
