import { useEffect, useMemo, useState } from 'react'
import { supabase, dinero, fmtFecha, traerTodo, mensajeError } from '../supabase'
import { Aviso, Cargando } from './ui'
import { Documento, Firmas, VistaDocumento, nombreReporte } from './Documento'
import { exportarExcel } from '../excel'

// Recibo individual de contribuciones: aportes de un hermano en un periodo
export default function ReciboContribuciones({ hermanoId, desde, hasta, grupoId, config, onCerrar }) {
  const [hermano, setHermano] = useState(null)
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const { data: h, error: e1 } = await supabase.from('hermanos')
          .select('nro_sobre,nombre,apellidos,dni_nie').eq('id', hermanoId).single()
        if (e1) throw e1
        const datos = await traerTodo(() => {
          let q = supabase.from('v_ingresos').select('id,fecha,turno,medio,monto,grupo')
            .eq('hermano_id', hermanoId).gte('fecha', desde).lte('fecha', hasta)
          if (grupoId) q = q.eq('grupo_id', grupoId)
          return q.order('fecha').order('turno')
        })
        setHermano(h); setFilas(datos)
      } catch (e) { setError(mensajeError(e)) }
    })()
  }, [hermanoId, desde, hasta, grupoId])

  const total = (filas || []).reduce((s, f) => s + Number(f.monto), 0)
  const porConcepto = useMemo(() => {
    const m = new Map()
    for (const f of filas || []) m.set(f.grupo, (m.get(f.grupo) || 0) + Number(f.monto))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [filas])

  const nombre = hermano ? `${hermano.nombre} ${hermano.apellidos || ''}`.trim() : ''
  const nroRecibo = hermano ? `RC-${hermano.nro_sobre}-${hasta.replaceAll('-', '')}` : ''
  const listo = !!(hermano && filas)

  const excel = () => exportarExcel({
    titulo: 'Recibo individual de contribuciones', hoja: 'Recibo',
    archivo: nombreReporte(`Recibo Individual de Contribuciones - ${nombre}`, desde, hasta),
    meta: [['Nº de recibo', nroRecibo], ['Periodo', `${fmtFecha(desde)} – ${fmtFecha(hasta)}`],
      ['Contribuyente', nombre], ['DNI/NIE', hermano.dni_nie || '—'], ['Nº de sobre', String(hermano.nro_sobre)]],
    tablas: [{
      columnas: [{ t: 'Fecha', ancho: 12 }, { t: 'Concepto', ancho: 34 }, { t: 'Medio', ancho: 12 }, { t: 'Importe', tipo: 'dinero' }],
      filas: [...filas.map((f) => ({ celdas: [fmtFecha(f.fecha), f.grupo, f.medio, Number(f.monto)] })),
        { celdas: ['Total aportado', '', '', total], tipo: 'total' }],
    }],
  }, config)

  return (
    <VistaDocumento titulo={`Recibo de contribuciones · ${nombre}`} onCerrar={onCerrar} listo={listo} onExcel={excel}
      archivo={listo ? nombreReporte(`Recibo Individual de Contribuciones - ${nombre}`, desde, hasta) : undefined}>
      {error && <Aviso>{error}</Aviso>}
      {!listo ? (!error && <Cargando />) : (
        <Documento config={config} titulo="Recibo individual de contribuciones"
          meta={[['Nº de recibo', nroRecibo], ['Periodo', `${fmtFecha(desde)} – ${fmtFecha(hasta)}`]]}>

          <dl className="doc-datos">
            <div><dt>Contribuyente</dt><dd>{nombre}</dd></div>
            <div><dt>DNI/NIE</dt><dd>{hermano.dni_nie || '—'}</dd></div>
            <div><dt>Nº de sobre</dt><dd>{hermano.nro_sobre}</dd></div>
          </dl>

          <table className="doc-tabla">
            <thead>
              <tr><th>Fecha</th><th>Concepto</th><th>Medio</th><th className="num">Importe</th></tr>
            </thead>
            <tbody>
              {filas.length === 0 && <tr><td colSpan="4" className="doc-vacio">No hay aportaciones registradas en este periodo.</td></tr>}
              {filas.map((f) => (
                <tr key={f.id}>
                  <td>{fmtFecha(f.fecha)}</td><td>{f.grupo}</td><td>{f.medio}</td>
                  <td className="num">{dinero(f.monto)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th colSpan="3">Total aportado ({filas.length} {filas.length === 1 ? 'aportación' : 'aportaciones'})</th>
                <td className="num doc-gran-total">{dinero(total)}</td></tr>
            </tfoot>
          </table>

          {porConcepto.length > 1 && (
            <section className="doc-bloque">
              <h2 className="doc-subtitulo">Resumen por concepto</h2>
              <table className="doc-tabla doc-resumen">
                <tbody>
                  {porConcepto.map(([c, v]) => <tr key={c}><td>{c}</td><td className="num">{dinero(v)}</td></tr>)}
                </tbody>
              </table>
            </section>
          )}

          <p className="doc-nota">
            La tesorería de {config?.nombre_iglesia || 'la iglesia'} hace constar que ha recibido de {nombre} las
            aportaciones detalladas en este documento, por un total de {dinero(total)}, durante el periodo indicado.
          </p>
          <Firmas firmantes={[{ nombre: config?.tesorero_nombre, rol: 'Tesorero(a)' }]} />
        </Documento>
      )}
    </VistaDocumento>
  )
}
