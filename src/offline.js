// Funcionamiento sin conexión:
// · Las consultas de datos (lecturas) se guardan en el dispositivo; sin internet se devuelve la última copia.
// · Las acciones que modifican datos necesitan internet, salvo la caja del culto, que usa una cola (cola.js).
// · Un pequeño "estado" global informa de la conexión y de lo pendiente de enviar.

// ---------- IndexedDB mínimo ----------
const DB = 'tesoreria-offline'
let dbPromesa = null
function abrir() {
  if (!dbPromesa) {
    dbPromesa = new Promise((ok, mal) => {
      const r = indexedDB.open(DB, 1)
      r.onupgradeneeded = () => { r.result.createObjectStore('cache'); r.result.createObjectStore('cola') }
      r.onsuccess = () => ok(r.result)
      r.onerror = () => mal(r.error)
    })
  }
  return dbPromesa
}
async function op(almacen, modo, accion) {
  const db = await abrir()
  return new Promise((ok, mal) => {
    const tx = db.transaction(almacen, modo)
    const r = accion(tx.objectStore(almacen))
    tx.oncomplete = () => ok(r?.result)
    tx.onerror = () => mal(tx.error)
  })
}
export const idb = {
  get: (a, k) => op(a, 'readonly', (s) => s.get(k)),
  put: (a, k, v) => op(a, 'readwrite', (s) => s.put(v, k)),
  del: (a, k) => op(a, 'readwrite', (s) => s.delete(k)),
  todos: (a) => op(a, 'readonly', (s) => s.getAll()),
}

// ---------- Estado de conexión ----------
const estado = { online: typeof navigator === 'undefined' ? true : navigator.onLine, pendientes: 0, conError: 0, enviando: false }
const oyentes = new Set()
export const leerEstado = () => ({ ...estado })
export function suscribir(fn) { oyentes.add(fn); return () => oyentes.delete(fn) }
export function cambiarEstado(cambios) {
  let distinto = false
  for (const k in cambios) if (estado[k] !== cambios[k]) { estado[k] = cambios[k]; distinto = true }
  if (distinto) oyentes.forEach((fn) => fn({ ...estado }))
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => cambiarEstado({ online: true }))
  window.addEventListener('offline', () => cambiarEstado({ online: false }))
}

export const MENSAJE_SIN_CONEXION = 'Sin conexión: esta acción necesita internet. Inténtalo cuando vuelva la conexión.'
export const esErrorDeRed = (e) => !!e && (e.name === 'SinConexion' || /Sin conexión|Failed to fetch|NetworkError|Load failed|FetchError|TypeError: Failed/i.test(e.message || String(e)))

// ---------- fetch con copia local para Supabase ----------
// Funciones (RPC) que solo leen datos y se pueden servir desde la copia guardada
const RPC_LECTURA = new Set(['resumen_periodo', 'reporte_culto', 'pin_configurado'])

function usuarioDe(init) {
  try {
    const h = init?.headers
    const auth = h instanceof Headers ? h.get('Authorization') : (h?.Authorization || h?.authorization)
    const token = (auth || '').replace(/^Bearer\s+/i, '')
    const datos = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return datos.sub || 'anon'
  } catch { return 'anon' }
}

export async function fetchConCopia(entrada, init = {}) {
  const url = typeof entrada === 'string' ? entrada : entrada.url
  const metodo = (init.method || (typeof entrada === 'string' ? 'GET' : entrada.method) || 'GET').toUpperCase()
  const rpc = url.match(/\/rest\/v1\/rpc\/([a-z_]+)/)?.[1]
  const lectura = url.includes('/rest/v1/') && (metodo === 'GET' || (metodo === 'POST' && rpc && RPC_LECTURA.has(rpc)))

  if (!lectura) {
    try {
      const r = await fetch(entrada, init)
      cambiarEstado({ online: true })
      return r
    } catch (e) {
      if (url.includes('/rest/v1/')) {
        cambiarEstado({ online: false })
        const err = new Error(MENSAJE_SIN_CONEXION); err.name = 'SinConexion'; throw err
      }
      throw e
    }
  }

  const clave = `${usuarioDe(init)}|${metodo} ${url}${rpc ? '|' + (init.body || '') : ''}`
  try {
    const r = await fetch(entrada, init)
    cambiarEstado({ online: true })
    if (r.ok) {
      r.clone().text().then((cuerpo) => idb.put('cache', clave, {
        cuerpo, estado: r.status, tipo: r.headers.get('content-type'), rango: r.headers.get('content-range'), fecha: Date.now(),
      })).catch(() => {})
    }
    return r
  } catch (e) {
    cambiarEstado({ online: false })
    const copia = await idb.get('cache', clave).catch(() => null)
    if (copia) {
      const cab = { 'content-type': copia.tipo || 'application/json' }
      if (copia.rango) cab['content-range'] = copia.rango
      return new Response(copia.cuerpo, { status: copia.estado, headers: cab })
    }
    const err = new Error('Sin conexión y sin datos guardados para esta consulta.'); err.name = 'SinConexion'; throw err
  }
}
