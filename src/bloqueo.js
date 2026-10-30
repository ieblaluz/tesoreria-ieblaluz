// Bloqueo de seguridad: al cerrar el navegador o tras un tiempo sin uso, la app pide la clave.
// La clave se comprueba con Supabase si hay internet; sin conexión, con una "huella" cifrada
// guardada en el dispositivo al iniciar sesión (nunca se guarda la clave en sí).

const HUELLA = 'tesoreria-huella'
const ABIERTA = 'tesoreria-abierta' // vive en sessionStorage: desaparece al cerrar el navegador

const aHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
async function derivar(clave, sal) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(sal), iterations: 150000 }, base, 256)
  return aHex(bits)
}

export async function guardarHuella(usuarioId, clave) {
  try {
    const sal = aHex(crypto.getRandomValues(new Uint8Array(16)))
    localStorage.setItem(HUELLA, JSON.stringify({ u: usuarioId, sal, h: await derivar(clave, sal) }))
  } catch { /* si el navegador no lo permite, el desbloqueo sin conexión no estará disponible */ }
}
export async function comprobarHuella(usuarioId, clave) {
  try {
    const d = JSON.parse(localStorage.getItem(HUELLA) || 'null')
    if (!d || d.u !== usuarioId) return null // no hay huella: hace falta internet
    return (await derivar(clave, d.sal)) === d.h
  } catch { return null }
}
export function borrarHuella() { try { localStorage.removeItem(HUELLA) } catch { /* nada */ } }

export const marcarAbierta = () => { try { sessionStorage.setItem(ABIERTA, String(Date.now())) } catch { /* nada */ } }
export const marcarCerrada = () => { try { sessionStorage.removeItem(ABIERTA) } catch { /* nada */ } }
export const estaAbierta = () => { try { return !!sessionStorage.getItem(ABIERTA) } catch { return false } }
