import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, dinero, aNumero, mensajeError } from '../supabase'
import { Aviso, Campo, Modal, Cargando, InputMonto, fmtMonto } from '../components/ui'
import useConfirmar from '../components/Confirmar'

export default function Presupuesto() {
  const anioActual = new Date().getFullYear()
  const [anio, setAnio] = useState(anioActual)
  const [anios, setAnios] = useState([anioActual])
  const [filas, setFilas] = useState(null)
  const [subcuentas, setSubcuentas] = useState([])
  const [editando, setEditando] = useState(null)
  const [msg, setMsg] = useState(null)
  const [confirmar, dialogo] = useConfirmar()

  const cargarAnios = useCallback(async () => {
    const { data } = await supabase.from('presupuestos').select('anio')
    const s = new Set([anioActual, anioActual + 1, ...(data || []).map((x) => x.anio)])
    setAnios([...s].sort((a, b) => b - a))
  }, [anioActual])

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('v_presupuesto').select('*').eq('anio', anio)
      .order('nro_cuenta').order('nro_subcuenta')
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setFilas(data || [])
  }, [anio])

  useEffect(() => {
    cargarAnios()
    supabase.from('subcuentas').select('id,nro,nombre,activo,cuentas(nro,ministerio)').order('nro')
      .then(({ data }) => setSubcuentas(data || []))
  }, [cargarAnios])
  useEffect(() => { cargar() }, [cargar])

  const grupos = useMemo(() => {
    const g = []
    for (const f of filas || []) {
      let c = g.find((x) => x.nro === f.nro_cuenta)
      if (!c) g.push(c = { nro: f.nro_cuenta, nombre: f.ministerio, filas: [], monto: 0, ejecutado: 0 })
      c.filas.push(f); c.monto += Number(f.monto); c.ejecutado += Number(f.ejecutado)
    }
    return g
  }, [filas])
  const tot = grupos.reduce((a, c) => ({ monto: a.monto + c.monto, ejecutado: a.ejecutado + c.ejecutado }), { monto: 0, ejecutado: 0 })

  async function guardar(e) {
    e.preventDefault()
    const m = aNumero(editando.monto)
    if (!editando.subcuenta_id) return setMsg({ t: 'error', m: 'Elige la subcuenta.' })
    if (!(m >= 0)) return setMsg({ t: 'error', m: 'Escribe un monto válido.' })
    const sub = subcuentas.find((x) => x.id === editando.subcuenta_id)
    const r = await confirmar({ titulo: '¿Guardar la partida?', textoSi: 'Sí, guardar', pin: true,
      mensaje: <>Presupuesto {anio} de <b>{sub?.nro} · {sub?.nombre}</b>: <b>{dinero(m)}</b>.</> })
    if (!r) return
    const { error } = await supabase.rpc('presupuesto_guardar', {
      p_pin: r.pin, p_id: editando.id || null, p_anio: anio, p_subcuenta: editando.subcuenta_id,
      p_monto: Math.round(m * 100) / 100, p_comentario: editando.comentario?.trim() || null })
    if (error) return setMsg({ t: 'error', m: error.code === '23505' ? 'Esa subcuenta ya tiene presupuesto en este año.' : mensajeError(error) })
    setEditando(null); cargar(); cargarAnios()
  }

  async function borrar() {
    const r = await confirmar({ titulo: '¿Quitar la partida?', textoSi: 'Sí, quitar', peligro: true, pin: true,
      mensaje: <>Se quitará del presupuesto {anio} la partida de <b>{dinero(aNumero(editando.monto))}</b>. Los gastos registrados no se borran.</> })
    if (!r) return
    const { error } = await supabase.rpc('presupuesto_borrar', { p_pin: r.pin, p_id: editando.id })
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setEditando(null); cargar()
  }

  async function copiar() {
    const destino = anio + 1
    const r = await confirmar({ titulo: `¿Copiar a ${destino}?`, textoSi: 'Sí, copiar', pin: true,
      mensaje: <>Se copiarán las partidas de <b>{anio}</b> a <b>{destino}</b>. Las que ya existan en {destino} no se tocan.</> })
    if (!r) return
    const { data, error } = await supabase.rpc('copiar_presupuesto', { p_origen: anio, p_destino: destino, p_pin: r.pin })
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setMsg({ t: 'ok', m: `Se copiaron ${data} partidas a ${destino}.` })
    await cargarAnios(); setAnio(destino)
  }

  const usadas = new Set((filas || []).map((f) => f.subcuenta_id))
  const pct = (e, m) => (m > 0 ? Math.min(100, (e / m) * 100) : e > 0 ? 100 : 0)

  return (
    <section className="pagina con-tabla">
      <div className="titulo-accion">
        <h1>Presupuesto</h1>
        <select className="selector-anio" value={anio} onChange={(e) => setAnio(Number(e.target.value))} aria-label="Año">
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="espacio" />
        <button className="btn btn-suave" onClick={copiar} disabled={!filas?.length}>Copiar a {anio + 1}</button>
        <button className="btn btn-primario" onClick={() => setEditando({ subcuenta_id: '', monto: '', comentario: '' })}>Añadir partida</button>
      </div>
      <Aviso tipo={msg?.t} onCerrar={() => setMsg(null)}>{msg?.m}</Aviso>

      {!filas ? <Cargando /> : filas.length === 0 ? (
        <p className="vacio">No hay presupuesto para {anio}. Añade partidas o copia el de otro año.</p>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla presupuesto">
            <thead><tr><th>Subcuenta</th><th className="num">Presupuestado</th><th className="num">Ejecutado</th><th className="num">Diferencia</th><th className="col-avance">Avance</th></tr></thead>
            {grupos.map((c) => (
              <tbody key={c.nro}>
                <tr className="fila-cuenta">
                  <td>{c.nro} · {c.nombre}</td><td className="num">{dinero(c.monto)}</td>
                  <td className="num">{dinero(c.ejecutado)}</td>
                  <td className={'num' + (c.monto - c.ejecutado < 0 ? ' neg' : '')}>{dinero(c.monto - c.ejecutado)}</td>
                  <td className="col-avance"><span className="avance"><span style={{ width: `${pct(c.ejecutado, c.monto)}%` }} /></span></td>
                </tr>
                {c.filas.map((f) => (
                  <tr key={f.id} className="clic" onClick={() => setEditando({ id: f.id, subcuenta_id: f.subcuenta_id, monto: fmtMonto(f.monto), comentario: f.comentario || '' })}>
                    <td className="sangria">{f.nro_subcuenta} · {f.subcuenta}</td>
                    <td className="num">{dinero(f.monto)}</td><td className="num">{dinero(f.ejecutado)}</td>
                    <td className={'num' + (Number(f.diferencia) < 0 ? ' neg' : '')}>{dinero(f.diferencia)}</td>
                    <td className="col-avance"><span className={'avance' + (Number(f.diferencia) < 0 ? ' excedido' : '')}><span style={{ width: `${pct(Number(f.ejecutado), Number(f.monto))}%` }} /></span></td>
                  </tr>
                ))}
              </tbody>
            ))}
            <tfoot><tr><td>Total {anio}</td><td className="num">{dinero(tot.monto)}</td><td className="num">{dinero(tot.ejecutado)}</td>
              <td className="num">{dinero(tot.monto - tot.ejecutado)}</td><td /></tr></tfoot>
          </table>
        </div>
      )}

      {editando && (
        <Modal titulo={editando.id ? `Editar partida ${anio}` : `Nueva partida ${anio}`} onCerrar={() => setEditando(null)}>
          <form className="formulario" onSubmit={guardar}>
            <Campo etiqueta="Subcuenta" ancho="completo">
              <select required value={editando.subcuenta_id} disabled={!!editando.id}
                onChange={(e) => setEditando({ ...editando, subcuenta_id: e.target.value })}>
                <option value="">Elige…</option>
                {subcuentas.filter((s) => s.id === editando.subcuenta_id || (s.activo && !usadas.has(s.id))).map((s) =>
                  <option key={s.id} value={s.id}>{s.cuentas?.nro} · {s.cuentas?.ministerio} → {s.nro} · {s.nombre}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Monto presupuestado"><InputMonto required value={editando.monto} onChange={(v) => setEditando((p) => ({ ...p, monto: v }))} /></Campo>
            <Campo etiqueta="Comentario"><input value={editando.comentario}
              onChange={(e) => setEditando({ ...editando, comentario: e.target.value })} /></Campo>
            <div className="botonera">
              {editando.id && <button type="button" className="btn btn-peligro" onClick={borrar}>Quitar partida</button>}
              <span className="espacio" />
              <button type="button" className="btn btn-suave" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn btn-primario">Guardar partida</button>
            </div>
          </form>
        </Modal>
      )}
      {dialogo}
    </section>
  )
}
