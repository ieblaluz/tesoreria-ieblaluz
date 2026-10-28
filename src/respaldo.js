// Copia de seguridad completa de los datos de la tesorería (JSON restaurable y Excel legible)
import { supabase, traerTodo } from './supabase'

export const TABLAS = [
  ['configuracion', 'Configuración'], ['roles', 'Roles'], ['permisos', 'Permisos'], ['perfiles', 'Usuarios'],
  ['hermanos', 'Hermanos'], ['pagadores', 'Pagadores'], ['grupos_ingreso', 'Grupos de ingreso'], ['contadores', 'Contadores'],
  ['autorizadores', 'Autorizadores'], ['proveedores', 'Proveedores'], ['cuentas', 'Cuentas'], ['subcuentas', 'Subcuentas'],
  ['presupuestos', 'Presupuestos'], ['ingresos', 'Ingresos'], ['gastos', 'Gastos'],
  ['movimientos_caja', 'Caja y banco'], ['tablon_semanal', 'Tablón'],
]
const ORDEN = { permisos: 'rol_id' }

export async function leerTodo(alAvanzar) {
  const datos = {}
  for (const [tabla, nombre] of TABLAS) {
    alAvanzar?.(`Leyendo ${nombre.toLowerCase()}…`)
    datos[tabla] = await traerTodo(() => supabase.from(tabla).select('*').order(ORDEN[tabla] || 'id'))
  }
  return datos
}

const marca = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}
function descargar(blob, nombre) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = nombre
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export function descargarJSON(datos) {
  const contenido = { app: 'tesoreria-ieblaluz', version: 1, fecha: new Date().toISOString(), tablas: datos }
  descargar(new Blob([JSON.stringify(contenido, null, 1)], { type: 'application/json' }), `Respaldo Tesoreria - ${marca()}.json`)
}

export async function descargarExcel(datos) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  for (const [tabla, nombre] of TABLAS) {
    const filas = datos[tabla] || []
    const ws = wb.addWorksheet(nombre.slice(0, 31))
    const columnas = [...new Set(filas.flatMap((f) => Object.keys(f)))]
    ws.columns = columnas.map((c) => ({ header: c, key: c, width: Math.min(40, Math.max(10, c.length + 4)) }))
    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    for (const f of filas) ws.addRow(Object.fromEntries(columnas.map((c) => [c, f[c] !== null && typeof f[c] === 'object' ? JSON.stringify(f[c]) : f[c]])))
  }
  const buf = await wb.xlsx.writeBuffer()
  descargar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Respaldo Tesoreria - ${marca()}.xlsx`)
}
