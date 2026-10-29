// Service worker: permite abrir y usar la app sin conexión.
// · Páginas: red primero; sin red, la última versión guardada.
// · Archivos de la app, fuentes, logos e iconos: se sirven desde la caché y se actualizan en segundo plano.
// Los datos de Supabase los gestiona la propia app (src/offline.js).
const VERSION = 'tesoreria-v3'
const BASE = ['/', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(BASE)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))))
  self.clients.claim()
})

const guardar = async (req, res) => {
  if (res && (res.ok || res.type === 'opaque')) {
    const c = await caches.open(VERSION)
    await c.put(req, res.clone())
  }
  return res
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Navegación (abrir la app o recargar): red primero, si falla la copia guardada
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => guardar('/', r)).catch(() => caches.match('/')))
    return
  }

  // Manifiesto dinámico: red primero
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/manifest')) {
    e.respondWith(fetch(req).then((r) => guardar(req, r)).catch(() => caches.match(req)))
    return
  }

  const esPropio = url.origin === self.location.origin && !url.pathname.startsWith('/api/')
  const esFuente = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
  const esImagenPublica = url.pathname.includes('/storage/v1/object/public/')
  if (esPropio || esFuente || esImagenPublica) {
    // Caché primero y actualización en segundo plano
    e.respondWith(caches.match(req).then((guardada) => {
      const red = fetch(req).then((r) => guardar(req, r)).catch(() => guardada)
      return guardada || red
    }))
  }
})
