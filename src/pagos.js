// Calendario de pagos: genera las fechas de los pagos programados y reúne los gastos pendientes
import { supabase, hoy } from './supabase'

const PASO = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 }
export const RECURRENCIAS = [
  ['unica', 'Una sola vez'], ['mensual', 'Cada mes'], ['bimestral', 'Cada 2 meses'],
  ['trimestral', 'Cada 3 meses'], ['semestral', 'Cada 6 meses'], ['anual', 'Cada año'],
]
const iso = (d) => d.toLocaleDateString('sv-SE')
const sumarMeses = (base, n) => {
  const [y, m, d] = base.split('-').map(Number)
  const ultimo = new Date(y, m - 1 + n + 1, 0).getDate()
  return iso(new Date(y, m - 1 + n, Math.min(d, ultimo)))
}

// Fechas de un pago programado entre desde y hasta (AAAA-MM-DD)
export function fechasDe(p, desde, hasta) {
  const fin = p.fecha_fin && p.fecha_fin < hasta ? p.fecha_fin : hasta
  if (p.recurrencia === 'unica') return p.fecha_inicio >= desde && p.fecha_inicio <= fin ? [p.fecha_inicio] : []
  const paso = PASO[p.recurrencia]
  const out = []
  for (let i = 0; i < 1000; i++) {
    const f = sumarMeses(p.fecha_inicio, i * paso)
    if (f > fin) break
    if (f >= desde) out.push(f)
  }
  return out
}

// Todos los pagos entre dos fechas: programados (con su estado) + gastos pendientes de pago
export async function cargarPagos(desde, hasta) {
  const [{ data: prog }, { data: hechos }, { data: pend }] = await Promise.all([
    supabase.from('pagos_programados').select('*, proveedores(nombre,cif_nie,iban,banco)').eq('activo', true),
    supabase.from('pagos_realizados').select('programado_id,fecha').gte('fecha', desde).lte('fecha', hasta),
    supabase.from('v_gastos').select('id,fecha,fecha_vencimiento,concepto,monto,modalidad,proveedor,cif_nie,proveedor_iban,proveedor_banco,factura')
      .is('fecha_pago', null),
  ])
  const pagados = new Set((hechos || []).map((h) => `${h.programado_id}|${h.fecha}`))
  const hoyIso = hoy()
  const lista = []
  for (const p of prog || []) {
    for (const f of fechasDe(p, desde, hasta)) {
      const pagado = pagados.has(`${p.id}|${f}`)
      lista.push({
        clave: `p|${p.id}|${f}`, origen: 'programado', programado: p, fecha: f, pagado,
        concepto: p.concepto, monto: p.monto, modalidad: p.modalidad,
        proveedor: p.proveedores?.nombre, cif: p.proveedores?.cif_nie, iban: p.proveedores?.iban, banco: p.proveedores?.banco,
        notas: p.notas, diasAviso: p.dias_aviso,
      })
    }
  }
  for (const g of pend || []) {
    const f = g.fecha_vencimiento || g.fecha
    if (f < desde || f > hasta) continue
    lista.push({
      clave: `g|${g.id}`, origen: 'gasto', gasto: g, fecha: f, pagado: false,
      concepto: g.concepto, monto: g.monto, modalidad: g.modalidad, proveedor: g.proveedor, cif: g.cif_nie,
      iban: g.proveedor_iban, banco: g.proveedor_banco, notas: g.factura ? `Factura ${g.factura}` : '', diasAviso: 3,
    })
  }
  for (const x of lista) {
    x.estado = x.pagado ? 'pagado' : x.fecha < hoyIso ? 'vencido' : 'pendiente'
  }
  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

// Avisos para mostrar al abrir la app: vencidos (últimos 60 días) y próximos según los días de aviso
export async function pagosParaAvisar() {
  const h = hoy()
  const d = new Date(); d.setDate(d.getDate() - 60)
  const fin = new Date(); fin.setDate(fin.getDate() + 60)
  const todos = await cargarPagos(iso(d), iso(fin))
  return todos.filter((x) => !x.pagado && (x.fecha < h || diasHasta(x.fecha) <= (x.diasAviso ?? 3)))
}
export const diasHasta = (f) => Math.round((new Date(f + 'T12:00:00') - new Date(hoy() + 'T12:00:00')) / 86400000)

export async function marcarPagado(item, pagado) {
  const q = supabase.from('pagos_realizados')
  const { error } = pagado
    ? await q.insert({ programado_id: item.programado.id, fecha: item.fecha })
    : await q.delete().eq('programado_id', item.programado.id).eq('fecha', item.fecha)
  if (error && error.code !== '23505') throw error
}

// IBAN: formato en grupos de 4 y validación del dígito de control
export const formatoIban = (v) => String(v || '').replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim()
export function ibanValido(v) {
  const s = String(v || '').replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55)
  let resto = 0
  for (const ch of r) resto = (resto * 10 + Number(ch)) % 97
  return resto === 1
}
