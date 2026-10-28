import { useCallback, useEffect, useState } from 'react'
import { supabase, dinero, hoy, fmtFecha, aNumero, traerTodo, mensajeError } from '../supabase'
import { Aviso, Campo, Modal, Cargando } from '../components/ui'
import useOrden from '../components/useOrden'

const inicioAnio = () => `${new Date().getFullYear()}-01-01`
const vacio = () => ({ fecha: hoy(), tipo: 'Depósito', monto: '', referencia: '', concepto: '' })

// Depósitos (efectivo → banco) y reintegros (banco → efectivo). No son ingresos ni gastos.
export default function Movimientos() {
  const [f, setF] = useState({ desde: inicioAnio(), hasta: hoy(), tipo: '' })
  const [filas, setFilas] = useState(null)
  const [saldos, setSaldos] = useState(null)
  const [editando, setEditando] = useState(null)
  const [msg, setMsg] = useState(null)

  const cargar = useCallback(async () => {
    try {
      const datos = await traerTodo(() => {
        let q = supabase.from('movimientos_caja').select('*').gte('fecha', f.desde).lte('fecha', f.hasta)
        if (f.tipo) q = q.eq('tipo', f.tipo)
        return q.order('fecha', { ascending: false }).order('creado_en', { ascending: false })
      })
      setFilas(datos)
      const { data } = await supabase.rpc('resumen_periodo', { p_desde: hoy(), p_hasta: hoy() })
      setSaldos(data)
    } catch (e) { setMsg({ t: 'error', m: mensajeError(e) }) }
  }, [f.desde, f.hasta, f.tipo])
  useEffect(() => { cargar() }, [cargar])

  async function guardar(e) {
    e.preventDefault()
    const m = aNumero(editando.monto)
    if (!(m > 0)) return setMsg({ t: 'error', m: 'El monto debe ser mayor que cero.' })
    const datos = { fecha: editando.fecha, tipo: editando.tipo, monto: Math.round(m * 100) / 100,
      referencia: editando.referencia.trim() || null, concepto: editando.concepto.trim() || null }
    const { error } = editando.id
      ? await supabase.from('movimientos_caja').update(datos).eq('id', editando.id)
      : await supabase.from('movimientos_caja').insert(datos)
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setEditando(null); setMsg({ t: 'ok', m: `${datos.tipo} guardado.` }); cargar()
  }

  async function borrar() {
    if (!confirm(`¿Borrar este ${editando.tipo.toLowerCase()}?`)) return
    const { error } = await supabase.from('movimientos_caja').delete().eq('id', editando.id)
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setEditando(null); cargar()
  }

  const [ordenadas, th] = useOrden(filas, { monto: (x) => Number(x.monto) })
  const total = (t) => (filas || []).filter((x) => x.tipo === t).reduce((s, x) => s + Number(x.monto), 0)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const setE = (k) => (e) => setEditando({ ...editando, [k]: e.target.value })

  return (
    <section className="pagina con-tabla">
      <div className="titulo-accion">
        <h1>Caja y banco</h1>
        <button className="btn btn-primario" onClick={() => setEditando(vacio())}>Nuevo movimiento</button>
      </div>
      <p className="tenue seccion-descripcion">Depósitos del efectivo en el banco y reintegros del banco para pagos en efectivo. No cambian el saldo total, solo dónde está el dinero.</p>
      {saldos && (
        <div className="saldos-hoy">
          <div><span>Saldo total hoy</span><strong>{dinero(saldos.saldo_actual)}</strong></div>
          <div><span>En efectivo</span><strong>{dinero(saldos.saldo_efectivo)}</strong></div>
          <div><span>En banco</span><strong>{dinero(saldos.saldo_banco)}</strong></div>
        </div>
      )}
      <div className="filtros">
        <Campo etiqueta="Desde"><input type="date" value={f.desde} onChange={set('desde')} /></Campo>
        <Campo etiqueta="Hasta"><input type="date" value={f.hasta} onChange={set('hasta')} /></Campo>
        <Campo etiqueta="Tipo">
          <select value={f.tipo} onChange={set('tipo')}><option value="">Todos</option><option>Depósito</option><option>Reintegro</option></select>
        </Campo>
      </div>
      <Aviso tipo={msg?.t} onCerrar={() => setMsg(null)}>{msg?.m}</Aviso>

      {!filas ? <Cargando /> : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead><tr>{th('fecha', 'Fecha')}{th('tipo', 'Tipo')}{th('referencia', 'Nº referencia')}{th('concepto', 'Concepto')}{th('monto', 'Monto', 'num')}</tr></thead>
            <tbody>
              {filas.length === 0 && <tr><td colSpan="5" className="tenue">No hay movimientos en este periodo.</td></tr>}
              {ordenadas.map((x) => (
                <tr key={x.id} className="clic" onClick={() => setEditando({ ...x, monto: String(x.monto).replace('.', ','), referencia: x.referencia || '', concepto: x.concepto || '' })}>
                  <td>{fmtFecha(x.fecha)}</td>
                  <td><span className={'etiqueta-tipo ' + (x.tipo === 'Depósito' ? 'deposito' : 'reintegro')}>{x.tipo === 'Depósito' ? 'Efectivo → Banco' : 'Banco → Efectivo'}</span></td>
                  <td>{x.referencia}</td><td>{x.concepto}</td>
                  <td className="num">{dinero(x.monto)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan="4">Depósitos {dinero(total('Depósito'))} · Reintegros {dinero(total('Reintegro'))}</td>
              <td className="num">{dinero(total('Depósito') - total('Reintegro'))}</td></tr></tfoot>
          </table>
        </div>
      )}

      {editando && (
        <Modal titulo={editando.id ? `Editar ${editando.tipo.toLowerCase()}` : 'Nuevo movimiento'} onCerrar={() => setEditando(null)}>
          <form className="formulario" onSubmit={guardar}>
            <div className="campo campo-completo">
              <span className="campo-etiqueta">Tipo</span>
              <div className="segmentos">
                {[['Depósito', 'Depósito (efectivo → banco)'], ['Reintegro', 'Reintegro (banco → efectivo)']].map(([v, l]) => (
                  <button key={v} type="button" className={editando.tipo === v ? 'sel' : ''} onClick={() => setEditando({ ...editando, tipo: v })}>{l}</button>
                ))}
              </div>
            </div>
            <Campo etiqueta="Fecha"><input type="date" required value={editando.fecha} onChange={setE('fecha')} /></Campo>
            <Campo etiqueta="Monto"><input inputMode="decimal" required value={editando.monto} onChange={setE('monto')} /></Campo>
            <Campo etiqueta="Nº de referencia" ancho="completo"><input value={editando.referencia} onChange={setE('referencia')} /></Campo>
            <Campo etiqueta="Concepto" ancho="completo"><input value={editando.concepto} onChange={setE('concepto')} placeholder="Ej. Depósito ofrendas del domingo" /></Campo>
            <div className="botonera">
              {editando.id && <button type="button" className="btn btn-peligro" onClick={borrar}>Borrar</button>}
              <span className="espacio" />
              <button type="button" className="btn btn-suave" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn btn-primario">Guardar</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}
