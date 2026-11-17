// Service worker: cache-first de todos os assets. Ao alterar qualquer arquivo do app,
// incremente VERSAO para que o iPhone baixe a nova versão na próxima abertura com internet.
const VERSAO = 'rdo-rov-v1.3.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './vendor/jspdf.umd.min.js',
  './fonts/Carlito-Regular.ttf',
  './fonts/Carlito-Bold.ttf',
  './fonts/OpenSans-Regular.ttf',
  './fonts/OpenSans-SemiBold.ttf',
  './fonts/OpenSans-Bold.ttf',
  './fonts/Poppins-SemiBold.ttf',
  './fonts/Poppins-Bold.ttf',
  './assets/logo-arcoirismar.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/util.js',
  './js/db.js',
  './js/ui.js',
  './js/config.js',
  './js/rdo.js',
  './js/rov.js',
  './js/pdf.js',
  './js/destino.js',
  './js/backup.js',
  './js/demo.js',
  './js/views/hoje.js',
  './js/views/rdoEditor.js',
  './js/views/historico.js',
  './js/views/vizinhos.js',
  './js/views/ajustes.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) { const cp = res.clone(); caches.open(VERSAO).then((c) => c.put(req, cp)); }
        return res;
      }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    })
  );
});
