// Cola de envíos pendientes: lo registrado sin conexión en la caja del culto.
// Cada elemento lleva su propio id, así que reenviarlo nunca lo duplica.
import { supabase } from './supabase'
import { idb, cambiarEstado, esErrorDeRed, leerEstado } from './offline'

export async function encolar(tabla, datos) {
  const item = { clave: crypto.randomUUID(), tabla, datos, creado: Date.now(), error: null }
  await idb.put('cola', item.clave, item)
  await contar()
  return item
}
export async function verCola() {
  const todos = await idb.todos('cola').catch(() => [])
  return todos.sort((a, b) => a.creado - b.creado)
}
export async function actualizarEnCola(clave, datos) {
  const item = await idb.get('cola', clave)
  if (item) await idb.put('cola', clave, { ...item, datos: { ...item.datos, ...datos }, error: null })
}
export async function quitarDeCola(clave) { await idb.del('cola', clave); await contar() }

async function contar() {
  const cola = await verCola()
  cambiarEstado({ pendientes: cola.length, conError: cola.filter((x) => x.error).length })
  return cola
}

let enviando = false
export async function sincronizar() {
  if (enviando) return
  const cola = await contar()
  if (!cola.length) return
  enviando = true
  cambiarEstado({ enviando: true })
  try {
    await supabase.auth.getSession() // renueva la sesión si hace falta
    for (const item of cola) {
      const { error } = await supabase.from(item.tabla).insert(item.datos)
      if (!error || error.code === '23505') { await idb.del('cola', item.clave); continue } // 23505: ya estaba enviado
      if (esErrorDeRed(error)) break
      await idb.put('cola', item.clave, { ...item, error: error.message })
    }
  } finally {
    enviando = false
    await contar()
    cambiarEstado({ enviando: false })
  }
}

// Envía lo pendiente al volver la conexión, al abrir la app y cada 30 s si queda algo
export function iniciarSincronizacion() {
  window.addEventListener('online', () => sincronizar())
  sincronizar()
  setInterval(() => { if (leerEstado().pendientes && navigator.onLine) sincronizar() }, 30000)
}
