import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
)

// Dominio interno para usuarios sin correo real (nunca recibe correos)
export const DOMINIO_INTERNO = 'tesoreria.example.com'

let moneda = 'EUR'
export const setMoneda = (m) => { moneda = m || 'EUR' }

export const dinero = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda, useGrouping: 'always' }).format(Number(n) || 0)

// Fecha local en formato AAAA-MM-DD
export const hoy = () => new Date().toLocaleDateString('sv-SE')
export const primerDiaMes = () => hoy().slice(0, 8) + '01'
export const fmtFecha = (d) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '')

export const aNumero = (v) => {
  const n = parseFloat(String(v ?? '').trim().replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

// Trae todas las filas aunque pasen de 1000 (límite por consulta de Supabase)
export async function traerTodo(crearConsulta) {
  let todas = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await crearConsulta().range(desde, desde + 999)
    if (error) throw error
    todas = todas.concat(data)
    if (data.length < 1000) break
  }
  return todas
}

export function mensajeError(e) {
  if (!e) return ''
  const m = e.message || String(e)
  if (e.code === '23505') {
    if (m.includes('nro_sobre')) return 'Ese número de sobre ya está registrado.'
    if (m.includes('cuentas_nro')) return 'Ese número de cuenta ya existe.'
    if (m.includes('subcuentas_nro')) return 'Ese número de subcuenta ya existe.'
    if (m.includes('presupuesto_unico')) return 'Esa subcuenta ya tiene presupuesto para ese año.'
    if (m.includes('dni')) return 'Ya hay un hermano con ese DNI/NIE.'
    if (m.includes('cif')) return 'Ya hay un proveedor con ese CIF/NIE.'
    return 'Ya existe un registro con ese valor. Revisa los campos únicos.'
  }
  if (e.code === '23503') return 'No se puede eliminar porque tiene movimientos asociados. Desactívalo en su lugar.'
  if (e.code === '42501' || m.includes('row-level security')) return 'No tienes permiso para esta acción.'
  if (m.includes('Invalid login credentials')) return 'Usuario o clave incorrectos.'
  return m
}
