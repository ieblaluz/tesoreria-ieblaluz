import { useEffect, useState } from 'react'
import { supabase, dinero, fmtFecha, mensajeError } from '../supabase'
import { importeEnLetras } from '../letras'
import { Aviso, Cargando } from './ui'
import { VistaDocumento, Firmas, nombreReporte } from './Documento'

const FECHA_LARGA = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

// Plantilla común de recibo / comprobante (una sola operación, para firmar)
function Recibo({ config, titulo, numero, fecha, parte, filas, total, letras, observaciones, firmantes }) {
  return (
    <article className="doc recibo">
      <header className="doc-cab">
        <div className="doc-entidad">
          {config?.logo_reporte_url && <img className="doc-logo" src={config.logo_reporte_url} alt="" style={{ height: `${config.logo_reporte_alto || 60}px` }} />}
          {(config?.reporte_mostrar_nombre ?? true) && (
            <div><div className="doc-iglesia">{config?.nombre_iglesia}</div><div className="doc-area">{config?.nombre_app || 'Tesorería'}</div></div>
          )}
        </div>
        <div className="recibo-titulo">
          <h1>{titulo}</h1>
          <dl className="doc-meta">
            <div><dt>Número</dt><dd>{numero}</dd></div>
            <div><dt>Fecha</dt><dd>{FECHA_LARGA(fecha)}</dd></div>
          </dl>
        </div>
      </header>

      <section className="recibo-parte">
        <h2 className="doc-subtitulo">{parte.titulo}</h2>
        <dl className="doc-datos">
          <div><dt>Nombre</dt><dd>{parte.nombre || <span className="recibo-hueco" />}</dd></div>
          <div><dt>DNI / NIF</dt><dd>{parte.doc || <span className="recibo-hueco" />}</dd></div>
          {parte.extra && <div><dt>{parte.extra[0]}</dt><dd>{parte.extra[1]}</dd></div>}
        </dl>
      </section>

      <table className="doc-tabla">
        <thead><tr><th>Descripción</th><th>Medio</th><th className="num">Importe</th></tr></thead>
        <tbody>{filas.map((f, i) => <tr key={i}><td>{f.descripcion}{f.detalle && <small className="recibo-detalle">{f.detalle}</small>}</td><td>{f.medio}</td><td className="num">{dinero(f.importe)}</td></tr>)}</tbody>
      </table>

      <div className="recibo-total">
        <span>Total</span>
        <strong>{dinero(total)}</strong>
      </div>
      <p className="recibo-letras">{letras}</p>

      {observaciones && <div className="recibo-obs"><h3>Observaciones</h3><p>{observaciones}</p></div>}

      <Firmas firmantes={firmantes} />
      <p className="recibo-aviso">Documento no válido como factura.</p>
    </article>
  )
}

// ---------- Recibo de ingreso (p. ej. alquiler del piso) ----------
export function ReciboIngreso({ ingreso, config, onCerrar }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    (async () => {
      try {
        const { data: numero, error: e1 } = await supabase.rpc('numero_recibo', { p_tipo: 'ingreso', p_ref: ingreso.id })
        if (e1) throw e1
        let nombre = '', doc = ''
        if (ingreso.pagador_id) {
          const { data: p } = await supabase.from('pagadores').select('nombre,dni_nie').eq('id', ingreso.pagador_id).maybeSingle()
          nombre = p?.nombre || ingreso.pagador || ''; doc = p?.dni_nie || ''
        } else if (!ingreso.es_concepto) {
          const { data: h } = await supabase.from('hermanos').select('nombre,apellidos,dni_nie').eq('id', ingreso.hermano_id).maybeSingle()
          nombre = `${h?.nombre || ''} ${h?.apellidos || ''}`.trim(); doc = h?.dni_nie || ''
        }
        setDatos({ numero, nombre, doc })
      } catch (e) { setError(mensajeError(e)) }
    })()
  }, [ingreso])

  const total = Number(ingreso.monto)
  return (
    <VistaDocumento titulo="Recibo de ingreso" onCerrar={onCerrar} listo={!!datos}
      archivo={datos ? nombreReporte(`Recibo ${datos.numero} - ${datos.nombre || ingreso.grupo}`, ingreso.fecha) : undefined}>
      {error && <Aviso>{error}</Aviso>}
      {!datos ? (!error && <Cargando />) : (
        <Recibo config={config} titulo="Recibo de ingreso" numero={datos.numero} fecha={ingreso.fecha}
          parte={{ titulo: 'Recibido de', nombre: datos.nombre, doc: datos.doc, extra: ['Sobre', `${ingreso.nro_sobre} · ${ingreso.hermano_nombre} ${ingreso.hermano_apellidos || ''}`.trim()] }}
          filas={[{ descripcion: ingreso.grupo, detalle: ingreso.comentario, medio: ingreso.medio, importe: total }]}
          total={total}
          letras={<>{config?.nombre_iglesia || 'La iglesia'} ha recibido de {datos.nombre || '____________________'} la cantidad de <b>{importeEnLetras(total)}</b> ({dinero(total)}) en concepto de {String(ingreso.grupo).toLowerCase()}.</>}
          observaciones={ingreso.comentario}
          firmantes={[{ nombre: config?.tesorero_nombre, rol: 'Tesorero(a) · Recibí' }]} />
      )}
    </VistaDocumento>
  )
}

// ---------- Comprobante de pago (gasto sin factura, firmado por quien cobra) ----------
export function ComprobanteGasto({ gasto, config, onCerrar }) {
  const [numero, setNumero] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    supabase.rpc('numero_recibo', { p_tipo: 'gasto', p_ref: gasto.id })
      .then(({ data, error: e }) => (e ? setError(mensajeError(e)) : setNumero(data)))
  }, [gasto])

  const total = Number(gasto.monto)
  const fecha = gasto.fecha_pago || gasto.fecha
  return (
    <VistaDocumento titulo="Comprobante de pago" onCerrar={onCerrar} listo={!!numero}
      archivo={numero ? nombreReporte(`Comprobante ${numero} - ${gasto.proveedor || gasto.concepto || 'pago'}`, fecha) : undefined}>
      {error && <Aviso>{error}</Aviso>}
      {!numero ? (!error && <Cargando />) : (
        <Recibo config={config} titulo="Comprobante de pago" numero={numero} fecha={fecha}
          parte={{ titulo: 'Pagado a', nombre: gasto.proveedor, doc: gasto.cif_nie, extra: gasto.factura ? ['Factura / referencia', gasto.factura] : null }}
          filas={[{ descripcion: gasto.concepto || gasto.subcuenta, detalle: `${gasto.nro_subcuenta} · ${gasto.subcuenta}`, medio: gasto.modalidad, importe: total }]}
          total={total}
          letras={<>Recibí de {config?.nombre_iglesia || 'la iglesia'} la cantidad de <b>{importeEnLetras(total)}</b> ({dinero(total)}) en concepto de {gasto.concepto || gasto.subcuenta}.</>}
          observaciones={gasto.comentario}
          firmantes={[{ nombre: gasto.proveedor, rol: 'Recibí conforme (firma y DNI)' }, { nombre: config?.tesorero_nombre, rol: 'Tesorero(a)' }]} />
      )}
    </VistaDocumento>
  )
}
