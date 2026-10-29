import { useEffect, useMemo, useState } from 'react'
import { supabase, dinero, fmtFecha, mensajeError } from '../supabase'
import { Aviso, Cargando } from './ui'
import { leerEstado } from '../offline'
import { Documento, Firmas, VistaDocumento, nombreReporte } from './Documento'

const importe = (n) => (Number(n) ? dinero(n) : '–')

// Reporte de ingresos de un culto (fecha + turno), para imprimir y firmar
export default function ReporteCulto({ fecha, turno, config, onCerrar, datosLocales }) {
  const [local, setLocal] = useState(false)
  const [r, setR] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const est = leerEstado()
    if (datosLocales && (!est.online || est.pendientes > 0)) {
      datosLocales().then((d) => { setR(d); setLocal(true) }).catch((e) => setError(mensajeError(e)))
      return
    }
    supabase.rpc('reporte_culto', { p_fecha: fecha, p_turno: turno }).then(async ({ data, error: e }) => {
      if (!e && data) return setR(data)
      // Sin conexión: se calcula con lo que hay en el dispositivo
      if (datosLocales) { try { setR(await datosLocales()); setLocal(true); return } catch { /* sigue al error */ } }
      setError(mensajeError(e))
    })
  }, [fecha, turno])

  // Una fila por grupo, con columnas Efectivo / Banco
  const filas = useMemo(() => {
    const m = new Map()
    for (const l of r?.lineas || []) {
      const f = m.get(l.grupo) || { grupo: l.grupo, efectivo: 0, banco: 0 }
      if (l.medio === 'Banco') f.banco += Number(l.total); else f.efectivo += Number(l.total)
      m.set(l.grupo, f)
    }
    return [...m.values()].sort((a, b) => (b.efectivo + b.banco) - (a.efectivo + a.banco))
  }, [r])

  const total = r ? Number(r.efectivo) + Number(r.banco) : 0
  const firmantes = [
    ...(r?.contadores?.length ? r.contadores.map((n) => ({ nombre: n, rol: 'Contador' })) : [{ rol: 'Contador' }]),
    { nombre: config?.tesorero_nombre, rol: 'Tesorero(a)' },
  ]

  return (
    <VistaDocumento titulo={`Reporte del culto · ${fmtFecha(fecha)} ${turno.toLowerCase()}`} archivo={nombreReporte(`Tablon Semanal ${turno}`, fecha)}
      onCerrar={onCerrar} listo={!!r}>
      {error && <Aviso>{error}</Aviso>}
      {local && <Aviso tipo="aviso">Sin conexión: el reporte se ha calculado con los datos de este dispositivo, incluidos los ingresos pendientes de enviar.</Aviso>}
      {!r ? (!error && <Cargando />) : (
        <Documento config={config} titulo="Reporte de ingresos del culto"
          meta={[['Fecha', fmtFecha(fecha)], ['Turno', turno]]}>

          <table className="doc-tabla">
            <thead>
              <tr><th>Concepto</th><th className="num">Efectivo</th><th className="num">Banco</th><th className="num">Total</th></tr>
            </thead>
            <tbody>
              {filas.length === 0 && <tr><td colSpan="4" className="doc-vacio">No hay ingresos registrados en este culto.</td></tr>}
              {filas.map((f) => (
                <tr key={f.grupo}>
                  <td>{f.grupo}</td>
                  <td className="num">{importe(f.efectivo)}</td>
                  <td className="num">{importe(f.banco)}</td>
                  <td className="num">{dinero(f.efectivo + f.banco)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Total del culto</th>
                <td className="num">{dinero(r.efectivo)}</td>
                <td className="num">{dinero(r.banco)}</td>
                <td className="num doc-gran-total">{dinero(total)}</td>
              </tr>
            </tfoot>
          </table>

          {turno === 'Tarde' && (
            <section className="doc-bloque">
              <h2 className="doc-subtitulo">Resumen del día</h2>
              <table className="doc-tabla doc-resumen">
                <tbody>
                  <tr><td>Culto de la mañana</td><td className="num">{dinero(r.manana)}</td></tr>
                  <tr><td>Culto de la tarde</td><td className="num">{dinero(r.tarde)}</td></tr>
                </tbody>
                <tfoot>
                  <tr><th>Total del día</th><td className="num doc-gran-total">{dinero(Number(r.manana) + Number(r.tarde))}</td></tr>
                </tfoot>
              </table>
            </section>
          )}

          <p className="doc-nota">Los firmantes dan conformidad al recuento del dinero de este culto.</p>
          <Firmas firmantes={firmantes} />
        </Documento>
      )}
    </VistaDocumento>
  )
}
