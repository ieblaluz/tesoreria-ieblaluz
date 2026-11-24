import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, dinero, aNumero, mensajeError } from '../supabase'
import { Aviso, Campo, Modal, Cargando, InputMonto, fmtMonto } from '../components/ui'
import useConfirmar from '../components/Confirmar'

// Redondeo del importe resultante tras aplicar el porcentaje
const REDONDEOS = [
  { id: 'centimo', etiqueta: 'Al céntimo', paso: 0.01 },
  { id: 'euro', etiqueta: 'Al euro', paso: 1 },
  { id: 'cinco', etiqueta: 'A 5 €', paso: 5 },
  { id: 'diez', etiqueta: 'A 10 €', paso: 10 },
]
const redondear = (n, id) => {
  const paso = REDONDEOS.find((r) => r.id === id)?.paso || 0.01
  return Math.round(n / paso) * paso
}

export default function Presupuesto() {
  const anioActual = new Date().getFullYear()
  const [anio, setAnio] = useState(anioActual)
  const [anios, setAnios] = useState([anioActual])
  const [filas, setFilas] = useState(null)
  const [subcuentas, setSubcuentas] = useState([])
  const [editando, setEditando] = useState(null)
  const [copia, setCopia] = useState(null)
  const [sel, setSel] = useState(null) // null = sin seleccionar · Set de ids cuando está activo
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

  // Abre la ventana de copiar a otro año o de ajustar el año en curso
  function abrirCopia(modo) {
    setMsg(null)
    setCopia({
      modo, destino: modo === 'copiar' ? anio + 1 : anio, porcentaje: '', redondeo: 'centimo',
      lineas: (filas || []).map((f) => ({
        subcuenta_id: f.subcuenta_id, etiqueta: `${f.nro_subcuenta} · ${f.subcuenta}`,
        ministerio: `${f.nro_cuenta} · ${f.ministerio}`, base: Number(f.monto),
        monto: fmtMonto(f.monto), incluir: true,
      })),
      existentes: new Set(), cargando: modo === 'copiar',
    })
  }

  const usadas = new Set((filas || []).map((f) => f.subcuenta_id))
  const pct = (e, m) => (m > 0 ? Math.min(100, (e / m) * 100) : e > 0 ? 100 : 0)

  // ---- Selección por lotes para quitar varias partidas de una vez ----
  const seleccionando = sel !== null
  const marcada = (id) => !!sel?.has(id)
  const alternar = (ids, poner) => setSel((p) => {
    const s = new Set(p)
    ids.forEach((id) => (poner ? s.add(id) : s.delete(id)))
    return s
  })
  const idsTodos = (filas || []).map((f) => f.id)
  const seleccionadas = (filas || []).filter((f) => marcada(f.id))
  const totalSel = seleccionadas.reduce((s, f) => s + Number(f.monto), 0)
  const conGasto = seleccionadas.filter((f) => Number(f.ejecutado) > 0).length

  async function borrarLote() {
    if (!seleccionadas.length) return
    const r = await confirmar({
      titulo: `¿Quitar ${seleccionadas.length} ${seleccionadas.length === 1 ? 'partida' : 'partidas'}?`,
      textoSi: 'Sí, quitar', peligro: true, pin: true,
      mensaje: <>Se quitarán del presupuesto {anio} por un total de <b>{dinero(totalSel)}</b>.
        {conGasto > 0 && <> {conGasto} {conGasto === 1 ? 'tiene' : 'tienen'} gastos registrados; esos gastos <b>no se borran</b>.</>}</>,
    })
    if (!r) return
    const { data, error } = await supabase.rpc('presupuesto_borrar_lote', {
      p_pin: r.pin, p_ids: seleccionadas.map((f) => f.id) })
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setSel(null); setMsg({ t: 'ok', m: `Se quitaron ${data} partidas del presupuesto ${anio}.` })
    cargar(); cargarAnios()
  }

  return (
    <section className="pagina con-tabla">
      <div className="titulo-accion">
        <h1>Presupuesto</h1>
        <select className="selector-anio" value={anio} onChange={(e) => setAnio(Number(e.target.value))} aria-label="Año">
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="espacio" />
        {seleccionando ? (
          <>
            <button className="btn btn-suave" onClick={() => setSel(null)}>Cancelar selección</button>
            <button className="btn btn-peligro" onClick={borrarLote} disabled={!seleccionadas.length}>
              Quitar {seleccionadas.length || ''} {seleccionadas.length === 1 ? 'partida' : 'partidas'}
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-suave" onClick={() => setSel(new Set())} disabled={!filas?.length}>Seleccionar</button>
            <button className="btn btn-suave" onClick={() => abrirCopia('ajustar')} disabled={!filas?.length}>Ajustar %</button>
            <button className="btn btn-suave" onClick={() => abrirCopia('copiar')} disabled={!filas?.length}>Copiar a otro año</button>
            <button className="btn btn-primario" onClick={() => setEditando({ subcuenta_id: '', monto: '', comentario: '' })}>Añadir partida</button>
          </>
        )}
      </div>
      {seleccionando && (
        <p className="tenue nota">
          Marca las partidas que quieras quitar. La casilla de un ministerio marca todas sus subcuentas.
          {seleccionadas.length > 0 && <> Seleccionadas: <b>{seleccionadas.length}</b> · <b>{dinero(totalSel)}</b>.</>}
        </p>
      )}
      <Aviso tipo={msg?.t} onCerrar={() => setMsg(null)}>{msg?.m}</Aviso>

      {!filas ? <Cargando /> : filas.length === 0 ? (
        <p className="vacio">No hay presupuesto para {anio}. Añade partidas o copia el de otro año.</p>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla presupuesto">
            <thead><tr>
              {seleccionando && (
                <th className="col-check">
                  <input type="checkbox" aria-label="Seleccionar todas"
                    checked={!!filas.length && seleccionadas.length === filas.length}
                    onChange={(e) => alternar(idsTodos, e.target.checked)} />
                </th>
              )}
              <th>Subcuenta</th><th className="num">Presupuestado</th><th className="num">Ejecutado</th><th className="num">Diferencia</th><th className="col-avance">Avance</th>
            </tr></thead>
            {grupos.map((c) => (
              <tbody key={c.nro}>
                <tr className="fila-cuenta">
                  {seleccionando && (
                    <td className="col-check">
                      <input type="checkbox" aria-label={`Seleccionar ${c.nombre}`}
                        checked={c.filas.every((f) => marcada(f.id))}
                        onChange={(e) => alternar(c.filas.map((f) => f.id), e.target.checked)} />
                    </td>
                  )}
                  <td>{c.nro} · {c.nombre}</td><td className="num">{dinero(c.monto)}</td>
                  <td className="num">{dinero(c.ejecutado)}</td>
                  <td className={'num' + (c.monto - c.ejecutado < 0 ? ' neg' : '')}>{dinero(c.monto - c.ejecutado)}</td>
                  <td className="col-avance"><span className="avance"><span style={{ width: `${pct(c.ejecutado, c.monto)}%` }} /></span></td>
                </tr>
                {c.filas.map((f) => (
                  <tr key={f.id} className={'clic' + (marcada(f.id) ? ' fila-marcada' : '')}
                    onClick={() => (seleccionando
                      ? alternar([f.id], !marcada(f.id))
                      : setEditando({ id: f.id, subcuenta_id: f.subcuenta_id, monto: fmtMonto(f.monto), comentario: f.comentario || '' }))}>
                    {seleccionando && (
                      <td className="col-check">
                        <input type="checkbox" checked={marcada(f.id)} readOnly tabIndex={-1}
                          aria-label={`Seleccionar ${f.subcuenta}`} />
                      </td>
                    )}
                    <td className="sangria">{f.nro_subcuenta} · {f.subcuenta}</td>
                    <td className="num">{dinero(f.monto)}</td><td className="num">{dinero(f.ejecutado)}</td>
                    <td className={'num' + (Number(f.diferencia) < 0 ? ' neg' : '')}>{dinero(f.diferencia)}</td>
                    <td className="col-avance"><span className={'avance' + (Number(f.diferencia) < 0 ? ' excedido' : '')}><span style={{ width: `${pct(Number(f.ejecutado), Number(f.monto))}%` }} /></span></td>
                  </tr>
                ))}
              </tbody>
            ))}
            <tfoot><tr>{seleccionando && <td className="col-check" />}<td>Total {anio}</td><td className="num">{dinero(tot.monto)}</td><td className="num">{dinero(tot.ejecutado)}</td>
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

      {copia && (
        <VentanaCopia copia={copia} setCopia={setCopia} anio={anio} anios={anios} confirmar={confirmar}
          onHecho={async (destino, texto) => {
            setCopia(null); setMsg({ t: 'ok', m: texto })
            await cargarAnios()
            if (destino !== anio) setAnio(destino); else cargar()
          }}
          onError={(m) => setMsg({ t: 'error', m })} />
      )}
      {dialogo}
    </section>
  )
}

// ---------- Copiar a otro año / ajustar un porcentaje ----------
function VentanaCopia({ copia, setCopia, anio, anios, confirmar, onHecho, onError }) {
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const esCopia = copia.modo === 'copiar'
  const cambiar = (c) => setCopia((p) => ({ ...p, ...c }))

  // Años a los que se puede copiar: los diez siguientes, los años que ya tienen
  // presupuesto y también los anteriores, por si hay que rellenar un año pasado
  const aniosDestino = useMemo(() => {
    const s = new Set(anios)
    for (let a = anio - 3; a <= anio + 10; a++) s.add(a)
    return [...s].filter((a) => a !== anio).sort((x, y) => x - y)
  }, [anios, anio])

  // Al copiar, se mira qué subcuentas ya tienen partida en el año destino: esas no se tocan
  useEffect(() => {
    if (!esCopia) return
    let vigente = true
    cambiar({ cargando: true })
    supabase.from('presupuestos').select('subcuenta_id').eq('anio', copia.destino).then(({ data }) => {
      if (!vigente) return
      cambiar({ existentes: new Set((data || []).map((x) => x.subcuenta_id)), cargando: false })
    })
    return () => { vigente = false }
  }, [esCopia, copia.destino])

  const aplicable = (l) => !(esCopia && copia.existentes.has(l.subcuenta_id))

  // Aplica el porcentaje a todas las partidas que siguen marcadas
  function aplicarPorcentaje() {
    const p = aNumero(copia.porcentaje)
    if (!Number.isFinite(p)) return setError('Escribe un porcentaje válido.')
    setError('')
    cambiar({
      lineas: copia.lineas.map((l) => (l.incluir && aplicable(l)
        ? { ...l, monto: fmtMonto(Math.max(0, redondear(l.base * (1 + p / 100), copia.redondeo))) }
        : l)),
    })
  }

  function cambiarLinea(id, c) {
    cambiar({ lineas: copia.lineas.map((l) => (l.subcuenta_id === id ? { ...l, ...c } : l)) })
  }

  const activas = copia.lineas.filter((l) => l.incluir && aplicable(l))
  const totalBase = activas.reduce((s, l) => s + l.base, 0)
  const totalNuevo = activas.reduce((s, l) => s + (aNumero(l.monto) || 0), 0)
  const diferencia = totalNuevo - totalBase
  const yaExisten = copia.lineas.filter((l) => !aplicable(l)).length

  async function guardarTodo() {
    if (!activas.length) return setError('No hay ninguna partida marcada.')
    const malas = activas.filter((l) => !(aNumero(l.monto) >= 0))
    if (malas.length) return setError(`Revisa el importe de «${malas[0].etiqueta}».`)
    setError('')
    const r = await confirmar({
      titulo: esCopia ? `¿Copiar a ${copia.destino}?` : `¿Ajustar el presupuesto ${copia.destino}?`,
      textoSi: esCopia ? 'Sí, copiar' : 'Sí, ajustar', pin: true,
      mensaje: esCopia
        ? <>Se crearán <b>{activas.length}</b> partidas en <b>{copia.destino}</b> por un total de <b>{dinero(totalNuevo)}</b>.{yaExisten > 0 && <> Las {yaExisten} que ya existen en {copia.destino} no se tocan.</>}</>
        : <>Se actualizarán <b>{activas.length}</b> partidas de <b>{copia.destino}</b>. El total pasa de <b>{dinero(totalBase)}</b> a <b>{dinero(totalNuevo)}</b>.</>,
    })
    if (!r) return
    setGuardando(true)
    const { data, error: e } = await supabase.rpc('presupuesto_aplicar', {
      p_pin: r.pin, p_anio: copia.destino, p_solo_nuevas: esCopia,
      p_lineas: activas.map((l) => ({ subcuenta_id: l.subcuenta_id, monto: Math.round(aNumero(l.monto) * 100) / 100 })),
    })
    setGuardando(false)
    if (e) return onError(mensajeError(e))
    onHecho(copia.destino, esCopia
      ? `Se copiaron ${data} partidas a ${copia.destino}.`
      : `Se actualizaron ${data} partidas de ${copia.destino}.`)
  }

  return (
    <Modal titulo={esCopia ? `Copiar el presupuesto de ${anio}` : `Ajustar el presupuesto ${anio}`}
      onCerrar={() => setCopia(null)} ancho="980px">
      <div className="copia-pres">
        <div className="copia-mandos">
          {esCopia && (
            <Campo etiqueta="Año destino">
              <select value={copia.destino} onChange={(e) => cambiar({ destino: Number(e.target.value) })}>
                {aniosDestino.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </Campo>
          )}
          <Campo etiqueta="Aumentar un %">
            <input inputMode="decimal" value={copia.porcentaje} placeholder="0"
              onChange={(e) => cambiar({ porcentaje: e.target.value })} />
          </Campo>
          <Campo etiqueta="Redondear">
            <select value={copia.redondeo} onChange={(e) => cambiar({ redondeo: e.target.value })}>
              {REDONDEOS.map((r) => <option key={r.id} value={r.id}>{r.etiqueta}</option>)}
            </select>
          </Campo>
          <div className="campo-check">
            <button type="button" className="btn btn-suave" onClick={aplicarPorcentaje}>Aplicar a todas</button>
          </div>
        </div>
        <p className="tenue nota">
          Escribe el porcentaje y pulsa «Aplicar a todas». Puedes usar un número negativo para recortar.
          Después corrige a mano las partidas que necesiten otro importe, o desmárcalas para dejarlas fuera.
          {esCopia && yaExisten > 0 && ` ${yaExisten} subcuentas ya tienen partida en ${copia.destino} y no se tocan.`}
        </p>
        <Aviso onCerrar={() => setError('')}>{error}</Aviso>

        {copia.cargando ? <Cargando /> : (
          <div className="tabla-envoltura copia-tabla">
            <table className="tabla">
              <thead>
                <tr>
                  <th className="col-check"> </th>
                  <th>Subcuenta</th>
                  <th className="num">{esCopia ? `Importe ${anio}` : 'Importe actual'}</th>
                  <th className="num">Importe nuevo</th>
                  <th className="num">Dif.</th>
                </tr>
              </thead>
              <tbody>
                {copia.lineas.map((l) => {
                  const fuera = !aplicable(l)
                  const nuevo = aNumero(l.monto) || 0
                  return (
                    <tr key={l.subcuenta_id} className={fuera || !l.incluir ? 'fila-apagada' : ''}>
                      <td className="col-check">
                        <input type="checkbox" checked={l.incluir && !fuera} disabled={fuera}
                          onChange={(e) => cambiarLinea(l.subcuenta_id, { incluir: e.target.checked })}
                          aria-label={`Incluir ${l.etiqueta}`} />
                      </td>
                      <td>
                        {l.etiqueta}
                        <small className="tenue bloque">{l.ministerio}{fuera && ` · ya existe en ${copia.destino}`}</small>
                      </td>
                      <td className="num">{dinero(l.base)}</td>
                      <td className="num col-importe">
                        {fuera || !l.incluir ? <span className="tenue">{dinero(l.base)}</span> : (
                          <InputMonto value={l.monto} onChange={(v) => cambiarLinea(l.subcuenta_id, { monto: v })} />
                        )}
                      </td>
                      <td className={'num' + (nuevo - l.base < 0 ? ' neg' : '')}>
                        {fuera || !l.incluir ? '–' : dinero(nuevo - l.base)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="2">{activas.length} partidas</td>
                  <td className="num">{dinero(totalBase)}</td>
                  <td className="num">{dinero(totalNuevo)}</td>
                  <td className={'num' + (diferencia < 0 ? ' neg' : '')}>
                    {dinero(diferencia)}
                    {totalBase > 0 && <small className="tenue bloque">{(diferencia / totalBase * 100).toFixed(2).replace('.', ',')} %</small>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="botonera">
          <span className="espacio" />
          <button type="button" className="btn btn-suave" onClick={() => setCopia(null)}>Cancelar</button>
          <button type="button" className="btn btn-primario" disabled={guardando || copia.cargando} onClick={guardarTodo}>
            {guardando ? 'Guardando…' : esCopia ? `Copiar a ${copia.destino}` : 'Guardar ajuste'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
