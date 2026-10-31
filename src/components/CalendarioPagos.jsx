import { useCallback, useEffect, useMemo, useState } from 'react'
import { dinero, hoy, mensajeError } from '../supabase'
import { cargarPagos, marcarPagado, formatoIban, diasHasta } from '../pagos'
import { Aviso, Modal } from './ui'
import useConfirmar from './Confirmar'

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const iso = (d) => d.toLocaleDateString('sv-SE')
const nombreMes = (y, m) => { const t = new Date(y, m, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1) }
const ESTADO = { vencido: 'Vencido', pendiente: 'Pendiente', pagado: 'Pagado' }

// Calendario mensual de pagos. compacto = versión para el Inicio.
// Doble clic (o un toque en el móvil) sobre un día abre el detalle de los pagos.
export default function CalendarioPagos({ compacto, ir, version = 0 }) {
  const h = new Date()
  const [mes, setMes] = useState({ y: h.getFullYear(), m: h.getMonth() })
  const [pagos, setPagos] = useState([])
  const [dia, setDia] = useState(null)
  const [elegido, setElegido] = useState(hoy())
  const [error, setError] = useState('')
  const [confirmar, dialogo] = useConfirmar()

  // Rejilla de 6 semanas empezando en lunes
  const celdas = useMemo(() => {
    const primero = new Date(mes.y, mes.m, 1)
    const inicio = new Date(primero); inicio.setDate(1 - ((primero.getDay() + 6) % 7))
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(inicio); d.setDate(inicio.getDate() + i); return d })
  }, [mes])

  const cargar = useCallback(async () => {
    try { setPagos(await cargarPagos(iso(celdas[0]), iso(celdas[41]))); setError('') }
    catch (e) { setError(mensajeError(e)) }
  }, [celdas])
  useEffect(() => { cargar() }, [cargar, version])

  const porDia = useMemo(() => {
    const m = new Map()
    for (const p of pagos) { if (!m.has(p.fecha)) m.set(p.fecha, []); m.get(p.fecha).push(p) }
    return m
  }, [pagos])

  const mover = (n) => setMes(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const abrir = (f) => { setElegido(f); if (porDia.get(f)?.length) setDia(f) }
  const hoyIso = hoy()
  const delMes = pagos.filter((p) => p.fecha.slice(0, 7) === `${mes.y}-${String(mes.m + 1).padStart(2, '0')}`)
  const pendientesMes = delMes.filter((p) => !p.pagado)

  async function alternarPagado(p) {
    const ok = await confirmar({ titulo: p.pagado ? '¿Marcar como no pagado?' : '¿Marcar como pagado?', textoSi: p.pagado ? 'Sí, desmarcar' : 'Sí, pagado',
      mensaje: <><b>{p.proveedor || p.concepto}</b> · {p.concepto} {p.monto ? <>· <b>{dinero(p.monto)}</b></> : null} ({p.fecha.split('-').reverse().join('/')}).
        {!p.pagado && <><br />Recuerda registrar también el gasto en Gastos.</>}</> })
    if (!ok) return
    try { await marcarPagado(p, !p.pagado); cargar() } catch (e) { setError(mensajeError(e)) }
  }
  const copiar = (t) => navigator.clipboard?.writeText(t.replace(/\s/g, ''))

  const lista = dia ? porDia.get(dia) || [] : []
  return (
    <div className={'calendario' + (compacto ? ' compacto' : '')}>
      <div className="cal-cab">
        <button className="btn-icono" onClick={() => mover(-1)} aria-label="Mes anterior">‹</button>
        <strong>{nombreMes(mes.y, mes.m)}</strong>
        <button className="btn-icono" onClick={() => mover(1)} aria-label="Mes siguiente">›</button>
        <button className="btn-texto" onClick={() => { setMes({ y: h.getFullYear(), m: h.getMonth() }); setElegido(hoyIso) }}>Hoy</button>
      </div>
      <Aviso>{error}</Aviso>
      <div className="cal-rejilla" role="grid">
        {DIAS.map((d) => <span key={d} className="cal-dia-nombre">{d}</span>)}
        {celdas.map((d) => {
          const f = iso(d)
          const ev = porDia.get(f) || []
          const peor = ev.some((x) => x.estado === 'vencido') ? 'vencido'
            : ev.some((x) => x.estado === 'pendiente') ? (ev.some((x) => x.estado === 'pendiente' && diasHasta(x.fecha) <= (x.diasAviso ?? 3)) ? 'proximo' : 'pendiente')
            : ev.length ? 'pagado' : ''
          return (
            <button key={f} type="button" role="gridcell"
              className={['cal-celda', d.getMonth() !== mes.m && 'fuera', f === hoyIso && 'hoy', f === elegido && 'elegido', peor && 'con-pago ' + peor].filter(Boolean).join(' ')}
              onClick={(e) => { setElegido(f); if (e.nativeEvent.pointerType === 'touch' && ev.length) setDia(f) }}
              onDoubleClick={() => abrir(f)} title={ev.length ? `${ev.length} pago(s) · doble clic para ver` : undefined}>
              <span className="cal-num">{d.getDate()}</span>
              {ev.length > 0 && (compacto
                ? <span className="cal-punto">{ev.length > 1 ? ev.length : ''}</span>
                : <span className="cal-eventos">{ev.slice(0, 2).map((x) => <span key={x.clave} className={'cal-evento ' + x.estado}>{x.proveedor || x.concepto}</span>)}
                    {ev.length > 2 && <span className="cal-mas">+{ev.length - 2}</span>}</span>)}
            </button>
          )
        })}
      </div>
      <div className="cal-pie">
        <span className="cal-leyenda"><i className="vencido" />Vencido</span>
        <span className="cal-leyenda"><i className="proximo" />Próximo</span>
        <span className="cal-leyenda"><i className="pendiente" />Programado</span>
        <span className="cal-leyenda"><i className="pagado" />Pagado</span>
      </div>
      {compacto && (
        <p className="tenue cal-resumen">{pendientesMes.length
          ? <>{pendientesMes.length} pago{pendientesMes.length === 1 ? '' : 's'} pendiente{pendientesMes.length === 1 ? '' : 's'} este mes · <b>{dinero(pendientesMes.reduce((s, p) => s + Number(p.monto || 0), 0))}</b></>
          : 'Sin pagos pendientes este mes.'}
          {ir && <button className="btn-texto" onClick={() => ir('pagos')}>Abrir calendario ›</button>}</p>
      )}

      {dia && (
        <Modal titulo={`Pagos del ${new Date(dia + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}`} onCerrar={() => setDia(null)} ancho="620px">
          <ul className="pagos-dia">
            {lista.map((p) => (
              <li key={p.clave} className={p.estado}>
                <div className="pago-cab">
                  <strong>{p.proveedor || 'Sin proveedor'}</strong>
                  <span className={'pago-estado ' + p.estado}>{ESTADO[p.estado]}</span>
                </div>
                <div className="pago-linea"><span>{p.concepto}</span>{p.monto != null && <b>{dinero(p.monto)}</b>}</div>
                <div className="pago-detalle">
                  <span>{p.origen === 'gasto' ? 'Factura pendiente de pago' : 'Pago programado'} · {p.modalidad}</span>
                  {p.cif && <span>CIF/NIE {p.cif}</span>}
                  {p.iban && <span className="pago-iban">IBAN <code>{formatoIban(p.iban)}</code>{p.banco ? ` · ${p.banco}` : ''}
                    <button className="btn-texto" onClick={() => copiar(p.iban)}>Copiar</button></span>}
                  {p.notas && <span>{p.notas}</span>}
                </div>
                <div className="pago-acciones">
                  {p.origen === 'programado'
                    ? <button className={'btn ' + (p.pagado ? 'btn-suave' : 'btn-primario')} onClick={() => alternarPagado(p)}>{p.pagado ? 'Marcar como no pagado' : 'Marcar como pagado'}</button>
                    : ir && <button className="btn btn-suave" onClick={() => { setDia(null); ir('gastos') }}>Ir a Gastos para pagarla</button>}
                </div>
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {dialogo}
    </div>
  )
}
