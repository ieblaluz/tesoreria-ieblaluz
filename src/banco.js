// Lectura de extractos bancarios: Norma 43 (el estándar de los bancos españoles), CSV y Excel.
// Devuelve { formato, cuenta, desde, hasta, saldoInicial, saldoFinal, movimientos: [...] }

export const normal = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const r2 = (n) => Math.round(n * 100) / 100

// Huella para no importar dos veces el mismo apunte
export const huellaDe = (m) => [m.fecha, r2(m.importe).toFixed(2), normal(m.concepto).slice(0, 60), m.referencia || ''].join('|')

// ---------- Norma 43 ----------
const fecha43 = (s) => {
  const a = Number(s.slice(0, 2)), m = s.slice(2, 4), d = s.slice(4, 6)
  return `${a < 70 ? 2000 + a : 1900 + a}-${m}-${d}`
}
const importe43 = (signo, s) => r2((signo === '1' ? -1 : 1) * Number(s) / 100)

export function leerNorma43(texto) {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim().length >= 2)
  const res = { formato: 'n43', movimientos: [] }
  let actual = null
  for (const l of lineas) {
    const clave = l.slice(0, 2)
    if (clave === '11') {
      res.cuenta = l.slice(6, 10) + '…' + l.slice(10, 20).slice(-4)
      res.desde = fecha43(l.slice(20, 26))
      res.hasta = fecha43(l.slice(26, 32))
      res.saldoInicial = importe43(l.slice(32, 33), l.slice(33, 47))
      res.titular = l.slice(51, 77).trim()
    } else if (clave === '22') {
      actual = {
        fecha: fecha43(l.slice(10, 16)),
        fechaValor: fecha43(l.slice(16, 22)),
        importe: importe43(l.slice(27, 28), l.slice(28, 42)),
        referencia: (l.slice(52, 64).trim() + ' ' + l.slice(64, 80).trim()).trim(),
        concepto: '',
      }
      res.movimientos.push(actual)
    } else if (clave === '23' && actual) {
      actual.concepto = (actual.concepto + ' ' + l.slice(4, 42).trim() + ' ' + l.slice(42, 80).trim()).replace(/\s+/g, ' ').trim()
    } else if (clave === '33') {
      res.saldoFinal = importe43(l.slice(58, 59), l.slice(59, 73))
    }
  }
  if (!res.movimientos.length) throw new Error('El archivo no parece un extracto en Norma 43 (no se encontraron movimientos).')
  for (const m of res.movimientos) if (!m.concepto) m.concepto = m.referencia || 'Movimiento'
  return res
}

// ---------- Tablas (CSV y Excel) ----------
const PISTAS = {
  fecha: ['fecha operacion', 'f. operacion', 'fecha contable', 'fecha valor', 'fecha'],
  concepto: ['concepto', 'descripcion', 'detalle', 'movimiento', 'observaciones'],
  importe: ['importe', 'cantidad', 'monto', 'euros', 'import'],
  debe: ['debe', 'cargo', 'salida', 'pago'],
  haber: ['haber', 'abono', 'entrada', 'ingreso'],
  saldo: ['saldo'],
  referencia: ['referencia', 'ref.', 'documento', 'concepto ampliado'],
}
const buscaColumna = (cabeceras, tipo) => {
  const h = cabeceras.map(normal)
  for (const p of PISTAS[tipo]) { const i = h.findIndex((x) => x.includes(p)); if (i >= 0) return i }
  return -1
}
export const leerFecha = (v) => {
  if (v instanceof Date) return v.toLocaleDateString('sv-SE')
  const t = String(v ?? '').trim()
  let m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (m) { const a = m[3].length === 2 ? '20' + m[3] : m[3]; return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? m[0] : null
}
export const leerImporte = (v) => {
  if (typeof v === 'number') return r2(v)
  let t = String(v ?? '').replace(/[\s€]/g, '')
  if (!t) return null
  const negativo = /^\(.*\)$/.test(t) || t.startsWith('-')
  t = t.replace(/[()\-+]/g, '')
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  else if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(t)
  return Number.isFinite(n) ? r2(negativo ? -n : n) : null
}

// filas: array de arrays (la primera con cabeceras). mapa opcional: { fecha, concepto, importe, debe, haber, saldo, referencia }
export function leerTabla(filas, mapa) {
  // La cabecera es la primera fila con al menos dos celdas de texto
  let iCab = filas.findIndex((f) => f.filter((c) => typeof c === 'string' && c.trim().length > 2).length >= 2)
  if (iCab < 0) iCab = 0
  const cab = filas[iCab].map((c) => String(c ?? ''))
  const col = mapa || {
    fecha: buscaColumna(cab, 'fecha'), concepto: buscaColumna(cab, 'concepto'), importe: buscaColumna(cab, 'importe'),
    debe: buscaColumna(cab, 'debe'), haber: buscaColumna(cab, 'haber'), saldo: buscaColumna(cab, 'saldo'),
    referencia: buscaColumna(cab, 'referencia'),
  }
  if (col.fecha < 0 || (col.importe < 0 && col.debe < 0 && col.haber < 0)) {
    const e = new Error('No se reconocen las columnas del archivo.'); e.cabeceras = cab; e.filas = filas.slice(iCab); throw e
  }
  const movimientos = []
  for (const f of filas.slice(iCab + 1)) {
    const fecha = leerFecha(f[col.fecha])
    if (!fecha) continue
    let importe = col.importe >= 0 ? leerImporte(f[col.importe]) : null
    if (importe == null) {
      const d = col.debe >= 0 ? leerImporte(f[col.debe]) : null
      const h = col.haber >= 0 ? leerImporte(f[col.haber]) : null
      if (d) importe = -Math.abs(d); else if (h) importe = Math.abs(h)
    }
    if (importe == null || importe === 0) continue
    movimientos.push({
      fecha, fechaValor: null, importe,
      concepto: col.concepto >= 0 ? String(f[col.concepto] ?? '').trim() : 'Movimiento',
      referencia: col.referencia >= 0 ? String(f[col.referencia] ?? '').trim() : '',
      saldo: col.saldo >= 0 ? leerImporte(f[col.saldo]) : null,
    })
  }
  if (!movimientos.length) { const e = new Error('No se encontraron movimientos en el archivo.'); e.cabeceras = cab; e.filas = filas.slice(iCab); throw e }
  const fechas = movimientos.map((m) => m.fecha).sort()
  const ultimo = movimientos[movimientos.length - 1]
  return { formato: 'tabla', cabeceras: cab, columnas: col, desde: fechas[0], hasta: fechas[fechas.length - 1],
    saldoFinal: ultimo.saldo ?? null, movimientos }
}

function filasDeCSV(texto) {
  const sep = (texto.split('\n')[0].match(/;/g) || []).length >= (texto.split('\n')[0].match(/,/g) || []).length ? ';' : ','
  const filas = []
  let campo = '', fila = [], comillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (comillas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++ } else comillas = false } else campo += c
    } else if (c === '"') comillas = true
    else if (c === sep) { fila.push(campo); campo = '' }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = '' }
    else if (c !== '\r') campo += c
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila) }
  return filas.filter((f) => f.some((c) => String(c).trim()))
}

// Lee el archivo subido y devuelve el extracto (o lanza un error con cabeceras/filas para mapear a mano)
export async function leerArchivo(archivo, mapa) {
  const nombre = archivo.name.toLowerCase()
  if (nombre.endsWith('.xlsx') || nombre.endsWith('.xls')) {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await archivo.arrayBuffer())
    const ws = wb.worksheets[0]
    const filas = []
    ws.eachRow((fila) => filas.push((fila.values || []).slice(1).map((v) => (v && v.result !== undefined ? v.result : v) ?? '')))
    return { ...leerTabla(filas, mapa), formato: 'xlsx' }
  }
  const texto = await archivo.text()
  const esN43 = /^(11|03)\d/.test(texto.trim()) && texto.split(/\r?\n/).some((l) => /^22/.test(l))
  if (esN43 && !mapa) return leerNorma43(texto)
  return { ...leerTabla(filasDeCSV(texto), mapa), formato: 'csv' }
}
