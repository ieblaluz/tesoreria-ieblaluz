// Exportación a Excel (.xlsx) con formato: títulos, cabeceras, subtotales agrupables y formato de moneda.
// Un "modelo" es el mismo objeto que usan los reportes en pantalla:
// { titulo, archivo, meta: [[clave, valor]], tablas: [{ subtitulo, columnas: [{ t, tipo, ancho }], filas: [{ celdas, tipo, nivel }] }] }

const FMT_DINERO = '#,##0.00 "€";-#,##0.00 "€";"–"'
const FMT_ENTERO = '#,##0;-#,##0;"–"'
const AZUL = 'FF7F8FA9'
const GRIS_SUB = 'FFE8ECF2'
const GRIS_TOT = 'FFD5DCE6'

export async function exportarExcel(modelo, config) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = config?.nombre_app || 'Tesorería'
  const ws = wb.addWorksheet((modelo.hoja || 'Reporte').slice(0, 31))
  ws.properties.outlineProperties = { summaryBelow: false, summaryRight: false }

  const ncol = Math.max(...modelo.tablas.map((t) => t.columnas.length))
  let r = 1
  if (config?.nombre_iglesia) { ws.getCell(r, 1).value = config.nombre_iglesia; ws.getCell(r, 1).font = { color: { argb: 'FF667085' } }; r++ }
  ws.getCell(r, 1).value = modelo.titulo
  ws.getCell(r, 1).font = { bold: true, size: 14 }
  r++
  for (const [k, v] of modelo.meta || []) {
    ws.getCell(r, 1).value = `${k}: ${v}`
    ws.getCell(r, 1).font = { color: { argb: 'FF475467' } }
    r++
  }
  r++

  let filaCongelar = null
  for (const tabla of modelo.tablas) {
    if (tabla.subtitulo) {
      ws.getCell(r, 1).value = tabla.subtitulo
      ws.getCell(r, 1).font = { bold: true, size: 12 }
      r++
    }
    const cab = ws.getRow(r)
    if (!tabla.sinCabecera) tabla.columnas.forEach((c, i) => {
      const celda = cab.getCell(i + 1)
      celda.value = c.t
      celda.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
      celda.alignment = { horizontal: c.tipo === 'dinero' || c.tipo === 'entero' ? 'right' : 'left', vertical: 'middle', wrapText: true }
    })
    if (tabla.columnas.some((c) => String(c.t).includes('\n'))) cab.height = 32
    if (modelo.tablas.length === 1) filaCongelar = r
    if (!tabla.sinCabecera) r++

    for (const f of tabla.filas) {
      const fila = ws.getRow(r)
      tabla.columnas.forEach((c, i) => {
        const celda = fila.getCell(i + 1)
        const v = f.celdas[i]
        if ((c.tipo === 'dinero' || c.tipo === 'entero') && v !== '' && v != null && !Number.isNaN(Number(v))) {
          celda.value = Number(v)
          celda.numFmt = c.tipo === 'dinero' ? FMT_DINERO : FMT_ENTERO
          celda.alignment = { horizontal: 'right' }
        } else {
          celda.value = v ?? ''
          if (i === 0 && f.nivel) celda.alignment = { indent: f.nivel * 2 }
        }
        if (f.tipo === 'subtotal' || f.tipo === 'grupo') {
          celda.font = { bold: true }
          celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS_SUB } }
        }
        if (f.tipo === 'total') {
          celda.font = { bold: true }
          celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS_TOT } }
          celda.border = { top: { style: 'thin' }, bottom: { style: 'double' } }
        }
      })
      if (f.nivel) fila.outlineLevel = Math.min(f.nivel, 7)
      r++
    }
    r++
  }

  for (let i = 1; i <= ncol; i++) {
    const anchos = modelo.tablas.map((t) => t.columnas[i - 1]).filter(Boolean)
    const c = anchos[0] || {}
    ws.getColumn(i).width = c.ancho || (c.tipo === 'dinero' ? 14 : c.tipo === 'entero' ? 9 : 28)
  }
  if (filaCongelar) ws.views = [{ state: 'frozen', ySplit: filaCongelar }]

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${modelo.archivo || modelo.titulo}.xlsx`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
