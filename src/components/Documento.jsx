import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from './ui'
import { dinero } from '../supabase'

// Plantilla común para todos los reportes imprimibles del sistema.

export function Documento({ config, titulo, meta = [], children }) {
  const emitido = new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
  return (
    <article className="doc">
      <header className="doc-cab">
        <div className="doc-entidad">
          {config?.logo_reporte_url && (
            <img className="doc-logo" src={config.logo_reporte_url} alt=""
              style={{ height: `${config.logo_reporte_alto || 60}px` }} />
          )}
          {(config?.reporte_mostrar_nombre ?? true) && (
            <div>
              <div className="doc-iglesia">{config?.nombre_iglesia}</div>
              <div className="doc-area">{config?.nombre_app || 'Tesorería'}</div>
            </div>
          )}
        </div>
        <dl className="doc-meta">
          {meta.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </header>
      <h1 className="doc-titulo">{titulo}</h1>
      {children}
      <footer className="doc-pie">Emitido el {emitido}</footer>
    </article>
  )
}

export function Firmas({ firmantes }) {
  return (
    <section className="doc-firmas">
      {firmantes.map((f, i) => (
        <div key={i} className="doc-firma">
          <span className="doc-firma-linea" />
          <span className="doc-firma-nombre">{f.nombre || '\u00A0'}</span>
          <span className="doc-firma-rol">{f.rol}</span>
        </div>
      ))}
    </section>
  )
}

// Nombre de archivo para todos los reportes: "Reporte - <nombre> - AAAAMMDD"
const compacta = (f) => f.slice(0, 10).replaceAll('-', '')
export const nombreReporte = (nombre, fecha, fechaFin) =>
  `Reporte - ${nombre}${fecha ? ' - ' + compacta(fecha) : ''}${fechaFin ? '_' + compacta(fechaFin) : ''}`

// Vista previa + copia oculta que es lo único que se imprime.
// archivo: nombre propuesto al "Guardar como PDF" (el navegador usa el título de la página)
// horizontal: imprime en A4 apaisado · onExcel: muestra el botón "Descargar Excel"
export function VistaDocumento({ titulo, archivo, onCerrar, listo, horizontal, onExcel, children }) {
  const [exportando, setExportando] = useState(false)
  useEffect(() => {
    if (!archivo) return
    const anterior = document.title
    document.title = archivo
    return () => { document.title = anterior }
  }, [archivo])

  async function excel() {
    setExportando(true)
    try { await onExcel() } finally { setExportando(false) }
  }

  return (
    <>
      <Modal titulo={titulo} onCerrar={onCerrar} ancho={horizontal ? '1220px' : '920px'}>
        <div className="vista-barra">
          <span className="tenue">Vista previa · A4{horizontal ? ' horizontal' : ''}</span>
          <span className="espacio" />
          <button className="btn btn-suave" onClick={onCerrar}>Cerrar</button>
          {onExcel && <button className="btn btn-suave" disabled={!listo || exportando} onClick={excel}>{exportando ? 'Generando…' : 'Descargar Excel'}</button>}
          <button className="btn btn-primario" disabled={!listo} onClick={() => window.print()}>Imprimir</button>
        </div>
        <div className="vista-fondo">
          <div className={'vista-hoja' + (horizontal ? ' horizontal' : '')}>{children}</div>
        </div>
      </Modal>
      {listo && createPortal(
        <div className="zona-impresion">
          {horizontal && <style>{'@page { size: A4 landscape; margin: 12mm 12mm; }'}</style>}
          {children}
        </div>, document.body)}
    </>
  )
}

// Dibuja las tablas de un modelo de reporte (el mismo que se exporta a Excel)
export function TablasModelo({ modelo }) {
  return modelo.tablas.map((t, k) => (
    <section key={k} className={'doc-seccion' + (modelo.compacto ? ' doc-compacto' : '') + (t.estrecha ? ' doc-estrecha' : '')}>
      {t.subtitulo && <h2 className="doc-subtitulo">{t.subtitulo}</h2>}
      {modelo.compacto && k === 0 && <p className="doc-unidad">Importes en euros</p>}
      <table className="doc-tabla">
        {!t.sinCabecera && (
          <thead><tr>{t.columnas.map((c, i) => {
            const num = c.tipo === 'dinero' || c.tipo === 'entero'
            return <th key={i} className={num ? 'num' : ''} style={!num && c.ancho ? { minWidth: `${Math.round(c.ancho * (modelo.compacto ? 4.5 : 6))}px` } : undefined}>{c.t}</th>
          })}</tr></thead>
        )}
        <tbody>
          {t.filas.length === 0 && <tr><td colSpan={t.columnas.length} className="doc-vacio">{t.vacio || 'Sin datos para mostrar.'}</td></tr>}
          {t.filas.map((f, j) => (
            <tr key={j} className={f.tipo ? 'fila-' + f.tipo : ''}>
              {t.columnas.map((c, i) => {
                const v = f.celdas[i]
                const num = c.tipo === 'dinero' || c.tipo === 'entero'
                let texto = v
                if (c.tipo === 'dinero') texto = v === '' || v == null ? '' : !Number(v) ? '–'
                  : modelo.compacto ? Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) : dinero(v)
                if (c.tipo === 'entero') texto = v === '' || v == null ? '' : Number(v) ? Number(v).toLocaleString('es-ES') : '–'
                return (
                  <td key={i} className={(num ? 'num' : '') + (f.tipo === 'total' && num && i === t.columnas.length - 1 ? ' doc-gran-total' : '')}
                    style={i === 0 && f.nivel ? { paddingLeft: `${8 + f.nivel * 14}px` } : undefined}>{texto}</td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  ))
}
