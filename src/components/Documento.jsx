import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from './ui'

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
export const nombreReporte = (nombre, fecha) =>
  `Reporte - ${nombre}${fecha ? ' - ' + fecha.slice(0, 10).replaceAll('-', '') : ''}`

// Vista previa + copia oculta que es lo único que se imprime.
// archivo: nombre propuesto al "Guardar como PDF" (el navegador usa el título de la página)
export function VistaDocumento({ titulo, archivo, onCerrar, listo, children }) {
  useEffect(() => {
    if (!archivo) return
    const anterior = document.title
    document.title = archivo
    return () => { document.title = anterior }
  }, [archivo])

  return (
    <>
      <Modal titulo={titulo} onCerrar={onCerrar} ancho="920px">
        <div className="vista-barra">
          <span className="tenue">Vista previa · A4</span>
          <span className="espacio" />
          <button className="btn btn-suave" onClick={onCerrar}>Cerrar</button>
          <button className="btn btn-primario" disabled={!listo} onClick={() => window.print()}>Imprimir</button>
        </div>
        <div className="vista-fondo">
          <div className="vista-hoja">{children}</div>
        </div>
      </Modal>
      {listo && createPortal(<div className="zona-impresion">{children}</div>, document.body)}
    </>
  )
}
