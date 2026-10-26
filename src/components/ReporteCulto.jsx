import { useEffect, useState } from 'react'
import { supabase, dinero, fmtFecha, mensajeError } from '../supabase'
import { Aviso, Cargando, Modal } from './ui'

// Reporte del culto (antes "Tablón semanal" de AppSheet), listo para imprimir y firmar
export default function ReporteCulto({ fecha, turno, config, onCerrar }) {
  const [r, setR] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.rpc('reporte_culto', { p_fecha: fecha, p_turno: turno }).then(({ data, error: e }) => {
      if (e) setError(mensajeError(e)); else setR(data)
    })
  }, [fecha, turno])

  const total = r ? Number(r.efectivo) + Number(r.banco) : 0

  return (
    <Modal titulo="Reporte del culto" onCerrar={onCerrar} ancho="820px">
      <Aviso>{error}</Aviso>
      {!r ? (!error && <Cargando />) : (
        <>
          <div className="botonera no-imprimir">
            <span className="espacio" />
            <button className="btn btn-suave" onClick={onCerrar}>Cerrar</button>
            <button className="btn btn-primario" onClick={() => window.print()}>Imprimir</button>
          </div>
          <article className="reporte">
            <header className="rep-cab">
              {config?.logo_url
                ? <img className="rep-logo" src={config.logo_url} alt={config?.nombre_iglesia || ''} />
                : <div className="rep-nombre">{config?.nombre_iglesia}</div>}
              <dl className="rep-fecha">
                <dt>Fecha:</dt><dd>{fmtFecha(fecha)}</dd>
                <dt>Turno:</dt><dd>{turno}</dd>
              </dl>
            </header>

            <table className="rep-tabla">
              <tbody>
                {r.lineas.length === 0 && <tr><td colSpan="2">No hay ingresos registrados en este culto.</td></tr>}
                {r.lineas.map((l) => (
                  <tr key={l.grupo + l.medio}>
                    <td>{l.grupo} <span className="rep-medio">{l.medio}</span></td>
                    <td className="num">{dinero(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table className="rep-total">
              <tbody><tr><th>TOTAL DE INGRESOS:</th><td className="num">{dinero(total)}</td></tr></tbody>
            </table>

            <div className="rep-medios">
              <span><b>Total efectivo:</b> {dinero(r.efectivo)}</span>
              <span><b>Total banco:</b> {dinero(r.banco)}</span>
            </div>

            {turno === 'Tarde' && (
              <div className="rep-dia">
                <h3>Total diario resumen</h3>
                <table className="rep-tabla rep-chica">
                  <tbody>
                    <tr><td>Mañana</td><td className="num">{dinero(r.manana)}</td></tr>
                    <tr><td>Tarde</td><td className="num">{dinero(r.tarde)}</td></tr>
                  </tbody>
                </table>
                <table className="rep-total rep-chica">
                  <tbody><tr><th>TOTAL DEL DÍA:</th><td className="num">{dinero(Number(r.manana) + Number(r.tarde))}</td></tr></tbody>
                </table>
              </div>
            )}

            <footer className="rep-firmas">
              <div>
                <h3>Contadores</h3>
                {r.contadores.length === 0 && <p className="rep-sin">Sin registrar en el tablón</p>}
                {r.contadores.map((c) => <div key={c} className="rep-firma"><span className="rep-linea" />{c}</div>)}
              </div>
              <div>
                <h3>Tesorero(a)</h3>
                <div className="rep-firma"><span className="rep-linea" /></div>
              </div>
            </footer>
          </article>
        </>
      )}
    </Modal>
  )
}
