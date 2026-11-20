/* Zeno no celular: guarda a "casca" do app para abrir rápido. Dados e login nunca ficam em cache aqui. */
const CACHE = 'zeno-casca-v19';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'sb.js', 'cerebro.js', 'mascot.js', 'mascot.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // API do Supabase vai direto para a rede
  // rede primeiro (sempre a versão mais nova); se estiver sem internet, usa a cópia guardada
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request).then((m) => m || caches.match('index.html'))));
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'Zeno', body: e.data ? e.data.text() : '' }; }
  // o iOS exige que todo push mostre uma notificação (senão cancela a assinatura), então sempre mostramos
  e.waitUntil(self.registration.showNotification(d.title || 'Zeno', { body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag || 'zeno', data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => 'focus' in x);
    return c ? c.focus() : self.clients.openWindow('./');
  }));
});
