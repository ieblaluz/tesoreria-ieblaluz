import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, dinero, hoy, fmtFecha, traerTodo, mensajeError } from '../supabase'
import { Aviso, Campo, Modal, Cargando, InputMonto, fmtMonto } from '../components/ui'
import Combobox from '../components/Combobox'
import useConfirmar from '../components/Confirmar'
import { leerArchivo, huellaDe, normal } from '../banco'

const TURNOS = ['Mañana', 'Tarde']
const DESTINOS = [
  ['ingreso', 'Ingreso'], ['gasto', 'Gasto'], ['deposito', 'Depósito (efectivo → banco)'],
  ['reintegro', 'Reintegro (banco → efectivo)'], ['ignorar', 'No registrar'],
]
const ETIQUETA = Object.fromEntries(DESTINOS)
const sinNada = { hermano_id: '', grupo_id: '', pagador_id: '', subcuenta_id: '', proveedor_id: '', autorizador_id: '', factura: '' }

// Conciliación bancaria: importar el extracto y registrar los movimientos con un clic
export default function Banco({ ir, puede }) {
  const [cat, setCat] = useState({ hermanos: [], grupos: [], pagadores: [], subcuentas: [], cuentas: [], proveedores: [], autorizadores: [] })
  const [reglas, setReglas] = useState([])
  const [pendientesGasto, setPendientesGasto] = useState([])
  const [programados, setProgramados] = useState([])
  const [ultimoGasto, setUltimoGasto] = useState({})   // proveedor → subcuenta y autorizador usados la última vez
  const [filas, setFilas] = useState(null)
  const [extractos, setExtractos] = useState([])
  const [borrador, setBorrador] = useState({})       // id → propuesta editada
  const [filtro, setFiltro] = useState('pendiente')
  const [msg, setMsg] = useState(null)
  const [cargando, setCargando] = useState('')
  const [mapeo, setMapeo] = useState(null)           // archivo con columnas sin reconocer
  const [confirmar, dialogo] = useConfirmar()
  const refArchivo = useRef(null)

  const cargar = useCallback(async () => {
    const [mb, ex] = await Promise.all([
      traerTodo(() => supabase.from('movimientos_banco').select('*').order('fecha').order('id')),
      supabase.from('extractos').select('*').order('importado_en', { ascending: false }).limit(12).then((r) => r.data || []),
    ])
    setFilas(mb); setExtractos(ex)
  }, [])

  useEffect(() => {
    cargar()
    const t = (tabla, sel, orden) => supabase.from(tabla).select(sel).order(orden).then(({ data }) => data || [])
    Promise.all([
      t('hermanos', 'id,nro_sobre,nombre,apellidos,activo,es_concepto', 'nro_sobre'),
      t('grupos_ingreso', 'id,nombre,activo', 'nombre'),
      t('pagadores', 'id,nombre,activo', 'nombre'),
      t('subcuentas', 'id,nro,nombre,cuenta_id,activo', 'nro'),
      t('cuentas', 'id,nro,ministerio', 'nro'),
      t('proveedores', 'id,nombre,cif_nie,activo', 'nombre'),
      t('autorizadores', 'id,nombre,activo', 'nombre'),
    ]).then(([hermanos, grupos, pagadores, subcuentas, cuentas, proveedores, autorizadores]) =>
      setCat({ hermanos, grupos, pagadores, subcuentas, cuentas, proveedores, autorizadores }))
    supabase.from('reglas_banco').select('*').order('veces', { ascending: false }).then(({ data }) => setReglas(data || []))
    supabase.from('v_gastos').select('id,fecha,concepto,monto,proveedor,proveedor_id,subcuenta_id,autorizador_id,factura').is('fecha_pago', null)
      .then(({ data }) => setPendientesGasto(data || []))
    supabase.from('pagos_programados').select('*, proveedores(nombre)').eq('activo', true).then(({ data }) => setProgramados(data || []))
    supabase.from('gastos').select('proveedor_id,subcuenta_id,autorizador_id,fecha').not('proveedor_id', 'is', null)
      .order('fecha', { ascending: false }).limit(600)
      .then(({ data }) => { const m = {}; for (const g of data || []) if (!m[g.proveedor_id]) m[g.proveedor_id] = g; setUltimoGasto(m) })
  }, [cargar])

  // ---------- Propuesta automática ----------
  const proponer = useCallback((m) => {
    const texto = normal(`${m.concepto} ${m.referencia || ''}`)
    const entrada = Number(m.importe) > 0
    const base = { ...sinNada, destino: entrada ? 'ingreso' : 'gasto', fecha: m.fecha, turno: 'Mañana', motivo: '' }
    // Completa subcuenta y autorizador con lo que se usó la última vez con ese proveedor
    const conProveedor = (p, proveedorId, motivo) => {
      const u = proveedorId ? ultimoGasto[proveedorId] : null
      return { ...p, proveedor_id: proveedorId || p.proveedor_id || '',
        subcuenta_id: p.subcuenta_id || u?.subcuenta_id || '', autorizador_id: p.autorizador_id || u?.autorizador_id || '',
        motivo: motivo || p.motivo }
    }
    // ¿El concepto del banco nombra a esta persona o empresa?
    // Vale con dos palabras suyas, o con una sola si es larga y no la comparte con otro de la lista.
    const contieneNombre = (nombre, lista) => {
      const palabras = normal(nombre).split(' ').filter((w) => w.length > 3)
      const encontradas = palabras.filter((w) => texto.includes(w))
      if (!palabras.length || !encontradas.length) return false
      if (encontradas.length >= 2 || palabras.length === 1) return true
      const w = encontradas[0]
      if (w.length < 6) return false
      return lista.filter((x) => normal(x.nombre).split(' ').includes(w)).length === 1
    }

    // 1. Factura pendiente de pago con el mismo importe
    if (!entrada) {
      const g = pendientesGasto.find((x) => Math.abs(Number(x.monto) + Number(m.importe)) < 0.01
        && (normal(x.proveedor || '').split(' ')[0] && texto.includes(normal(x.proveedor || '').split(' ')[0]) || Math.abs(new Date(x.fecha) - new Date(m.fecha)) < 45 * 86400000))
      if (g) return { ...base, destino: 'gasto', gastoExistente: g, subcuenta_id: g.subcuenta_id, proveedor_id: g.proveedor_id || '',
        autorizador_id: g.autorizador_id || '', factura: g.factura || '', motivo: `Factura pendiente: ${g.concepto}` }
    }
    // 2. Regla aprendida
    const regla = reglas.find((r) => (r.signo === 'ambos' || (r.signo === 'entrada') === entrada) && texto.includes(r.patron))
    if (regla) return conProveedor({ ...base, destino: regla.destino, hermano_id: regla.hermano_id || '', grupo_id: regla.grupo_id || '',
      pagador_id: regla.pagador_id || '', subcuenta_id: regla.subcuenta_id || '', autorizador_id: regla.autorizador_id || '',
      motivo: `Regla aprendida: «${regla.patron}»`, patron: regla.patron }, regla.proveedor_id)
    // 3. Pago programado con importe parecido
    if (!entrada) {
      const p = programados.find((x) => x.monto && Math.abs(Number(x.monto) + Number(m.importe)) < 0.01)
      if (p) return conProveedor({ ...base, destino: 'gasto' }, p.proveedor_id, `Pago programado: ${p.concepto}`)
    }
    // 4. Por el texto
    if (/reintegro|cajero|retirada|disposicion efectivo/.test(texto)) return { ...base, destino: 'reintegro', motivo: 'Retirada de efectivo' }
    if (/ingreso efectivo|imposicion|ingreso en efectivo|deposito/.test(texto) && entrada) return { ...base, destino: 'deposito', motivo: 'Depósito de efectivo' }
    if (/comision|mantenimiento tarifa|tarifa/.test(texto) && !entrada) {
      const s = cat.subcuentas.find((x) => normal(x.nombre).includes('tarifa banco'))
      if (s) return { ...base, destino: 'gasto', subcuenta_id: s.id, motivo: 'Comisión bancaria' }
    }
    // 5. Proveedor o pagador por su nombre
    if (!entrada) {
      const p = cat.proveedores.find((x) => contieneNombre(x.nombre, cat.proveedores))
      if (p) return conProveedor(base, p.id, `Proveedor: ${p.nombre}`)
    } else {
      const p = cat.pagadores.find((x) => contieneNombre(x.nombre, cat.pagadores))
      if (p) {
        const s = cat.hermanos.find((h) => h.es_concepto && normal(h.nombre).includes('alquiler'))
        const g = cat.grupos.find((x) => normal(x.nombre).includes('alquiler'))
        return { ...base, pagador_id: p.id, hermano_id: s?.id || '', grupo_id: g?.id || '', motivo: `Pagador: ${p.nombre}` }
      }
    }
    return base
  }, [reglas, pendientesGasto, programados, cat, ultimoGasto])

  const propuesta = (m) => borrador[m.id] || proponer(m)
  const cambiar = (m, campos) => setBorrador((b) => ({ ...b, [m.id]: { ...propuesta(m), ...campos } }))

  // ---------- Importar ----------
  async function importar(e, mapa) {
    const archivo = e?.target?.files?.[0] || mapeo?.archivo
    if (e?.target) e.target.value = ''
    if (!archivo) return
    setCargando('Leyendo el archivo…')
    try {
      const ex = await leerArchivo(archivo, mapa)
      const { data: nuevo, error } = await supabase.from('extractos').insert({
        archivo: archivo.name, formato: ex.formato, cuenta: ex.cuenta || null, desde: ex.desde, hasta: ex.hasta,
        saldo_inicial: ex.saldoInicial ?? null, saldo_final: ex.saldoFinal ?? null,
      }).select().single()
      if (error) throw error
      const apuntes = ex.movimientos.map((m) => ({
        extracto_id: nuevo.id, fecha: m.fecha, fecha_valor: m.fechaValor, concepto: m.concepto,
        referencia: m.referencia || null, importe: m.importe, saldo: m.saldo ?? null, huella: huellaDe(m),
      }))
      setCargando(`Guardando ${apuntes.length} movimientos…`)
      const { data: metidos, error: e2 } = await supabase.from('movimientos_banco')
        .upsert(apuntes, { onConflict: 'huella', ignoreDuplicates: true }).select('id')
      if (e2) throw e2
      const repetidos = apuntes.length - (metidos?.length || 0)
      setMapeo(null)
      setMsg({ t: 'ok', m: `Extracto importado: ${metidos?.length || 0} movimientos nuevos${repetidos ? ` · ${repetidos} ya estaban importados` : ''}.` })
      cargar()
    } catch (er) {
      if (er.cabeceras) { setMapeo({ archivo, cabeceras: er.cabeceras, filas: er.filas.slice(0, 6), mapa: {} }); setMsg(null) }
      else setMsg({ t: 'error', m: mensajeError(er) })
    }
    setCargando('')
  }

  // ---------- Conciliar ----------
  function valido(m, p) {
    if (p.destino === 'ignorar' || p.destino === 'deposito' || p.destino === 'reintegro') return true
    if (p.destino === 'ingreso') return !!(p.hermano_id && p.grupo_id)
    return !!(p.gastoExistente || (p.subcuenta_id && p.autorizador_id))
  }

  async function conciliar(m, p, silencioso) {
    const { error } = await supabase.rpc('conciliar_movimiento', {
      p_id: m.id, p_destino: p.destino, p_fecha: p.fecha || m.fecha, p_monto: m.importe,
      p_concepto: (p.concepto || m.concepto).slice(0, 200), p_hermano: p.hermano_id || null, p_grupo: p.grupo_id || null,
      p_pagador: p.pagador_id || null, p_turno: p.turno || 'Mañana', p_subcuenta: p.subcuenta_id || null,
      p_proveedor: p.proveedor_id || null, p_autorizador: p.autorizador_id || null, p_factura: p.factura || null,
      p_referencia: m.referencia || null,
    })
    if (error) throw error
    if (!silencioso) await aprender(m, p)
    setBorrador((b) => { const c = { ...b }; delete c[m.id]; return c })
  }

  // Guarda una regla con las palabras más significativas del concepto
  async function aprender(m, p) {
    if (p.destino === 'ignorar') return
    const palabras = normal(m.concepto).split(' ').filter((w) => w.length > 3 && !/^(de|del|la|el|los|las|por|para|con|sin|desde)$/.test(w))
    const patron = palabras.slice(0, 3).join(' ')
    if (patron.length < 5) return
    const signo = Number(m.importe) > 0 ? 'entrada' : 'salida'
    const existente = reglas.find((r) => r.patron === patron && r.signo === signo)
    const datos = { patron, signo, destino: p.destino, hermano_id: p.hermano_id || null, grupo_id: p.grupo_id || null,
      pagador_id: p.pagador_id || null, subcuenta_id: p.subcuenta_id || null, proveedor_id: p.proveedor_id || null,
      autorizador_id: p.autorizador_id || null, veces: (existente?.veces || 0) + 1 }
    const { data } = existente
      ? await supabase.from('reglas_banco').update(datos).eq('id', existente.id).select().single()
      : await supabase.from('reglas_banco').insert(datos).select().single()
    if (data) setReglas((l) => [data, ...l.filter((r) => r.id !== data.id)])
  }

  async function conciliarUno(m) {
    const p = propuesta(m)
    if (!valido(m, p)) return setMsg({ t: 'error', m: 'Completa los datos que faltan antes de registrar este movimiento.' })
    const ok = await confirmar({ titulo: p.destino === 'ignorar' ? '¿Marcar como no registrable?' : `¿Registrar como ${ETIQUETA[p.destino].toLowerCase()}?`,
      textoSi: 'Sí, continuar', mensaje: <><b>{dinero(Math.abs(m.importe))}</b> · {m.concepto} ({fmtFecha(p.fecha || m.fecha)}).{p.gastoExistente && <><br />Se marcará como pagada la factura «{p.gastoExistente.concepto}».</>}</> })
    if (!ok) return
    try { await conciliar(m, p); setMsg({ t: 'ok', m: 'Movimiento registrado.' }); cargar() }
    catch (e) { setMsg({ t: 'error', m: mensajeError(e) }) }
  }

  async function conciliarTodos() {
    const listos = visibles.filter((m) => m.estado === 'pendiente' && valido(m, propuesta(m)) && propuesta(m).destino !== 'ignorar' && propuesta(m).motivo)
    if (!listos.length) return setMsg({ t: 'error', m: 'No hay movimientos con una propuesta completa. Revísalos uno a uno.' })
    const ok = await confirmar({ titulo: `¿Registrar ${listos.length} movimientos?`, textoSi: 'Sí, registrar todos',
      mensaje: <>Se registrarán los <b>{listos.length}</b> movimientos que la app ha reconocido por completo. Los demás quedarán pendientes de revisar.</> })
    if (!ok) return
    setCargando('Registrando…')
    let n = 0, fallos = 0
    for (const m of listos) {
      try { await conciliar(m, propuesta(m)); n++ } catch { fallos++ }
    }
    setCargando('')
    setMsg({ t: fallos ? 'error' : 'ok', m: `${n} movimientos registrados${fallos ? ` · ${fallos} con error, revísalos` : ''}.` })
    cargar()
  }

  async function deshacer(m) {
    const ok = await confirmar({ titulo: '¿Deshacer el registro?', textoSi: 'Sí, deshacer', peligro: true,
      mensaje: <>Se borrará lo que se creó a partir de este movimiento y volverá a quedar pendiente.</> })
    if (!ok) return
    const { error } = await supabase.rpc('desconciliar_movimiento', { p_id: m.id })
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    cargar()
  }

  // ---------- Vista ----------
  const visibles = useMemo(() => (filas || []).filter((m) => filtro === 'todos' || m.estado === filtro), [filas, filtro])
  const pendientes = (filas || []).filter((m) => m.estado === 'pendiente')
  const ultimo = extractos[0]
  const opciones = (lista, valor, etiqueta) => lista.filter((x) => x.activo !== false || x.id === valor).map(etiqueta)

  if (!filas) return <section className="pagina"><h1>Conciliación bancaria</h1><Cargando /></section>

  return (
    <section className="pagina con-tabla">
      <div className="titulo-accion">
        <h1>Conciliación bancaria</h1>
        <label className="btn btn-primario">
          {cargando || 'Importar extracto'}
          <input ref={refArchivo} type="file" accept=".n43,.q43,.txt,.csv,.xls,.xlsx" hidden onChange={importar} disabled={!!cargando} />
        </label>
      </div>
      <p className="tenue seccion-descripcion">Sube el extracto del banco (Norma 43, CSV o Excel) y la app propone cómo registrar cada movimiento. Lo que ya estaba importado no se repite.</p>
      <Aviso tipo={msg?.t} onCerrar={() => setMsg(null)}>{msg?.m}</Aviso>

      {ultimo && (
        <div className="banco-resumen">
          <div><span>Último extracto</span><strong>{ultimo.archivo}</strong><small>{fmtFecha(ultimo.desde)} – {fmtFecha(ultimo.hasta)}{ultimo.cuenta ? ` · ${ultimo.cuenta}` : ''}</small></div>
          {ultimo.saldo_final != null && <div><span>Saldo del extracto</span><strong>{dinero(ultimo.saldo_final)}</strong></div>}
          <div><span>Pendientes de revisar</span><strong className={pendientes.length ? 'neg' : ''}>{pendientes.length}</strong></div>
          <span className="espacio" />
          {pendientes.length > 0 && <button className="btn btn-suave" disabled={!!cargando} onClick={conciliarTodos}>Registrar los reconocidos</button>}
        </div>
      )}

      <div className="filtros">
        <Campo etiqueta="Mostrar">
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="pendiente">Pendientes de revisar</option>
            <option value="registrado">Ya registrados</option>
            <option value="ignorado">No registrables</option>
            <option value="todos">Todos</option>
          </select>
        </Campo>
      </div>

      <div className="flex-resto">
        <div className="tabla-envoltura">
          <table className="tabla banco">
            <thead><tr><th>Fecha</th><th>Concepto</th><th className="num">Importe</th><th>Cómo registrarlo</th><th /></tr></thead>
            <tbody>
              {visibles.length === 0 && <tr><td colSpan="5" className="tenue">{filtro === 'pendiente' ? '¡Todo conciliado! No queda ningún movimiento pendiente.' : 'Nada que mostrar.'}</td></tr>}
              {visibles.map((m) => {
                const p = propuesta(m)
                const entrada = Number(m.importe) > 0
                const subcuentas = cat.subcuentas
                return (
                  <tr key={m.id} className={m.estado}>
                    <td className="col-fecha">{fmtFecha(m.fecha)}</td>
                    <td className="col-concepto">{m.concepto}{m.referencia && <small className="sub">{m.referencia}</small>}</td>
                    <td className={'num ' + (entrada ? 'pos' : 'neg')}>{dinero(m.importe)}</td>
                    <td className="col-destino">
                      {m.estado !== 'pendiente' ? (
                        <span className={'etiqueta-tipo ' + (m.estado === 'registrado' ? 'deposito' : 'reintegro')}>
                          {m.estado === 'registrado' ? ETIQUETA[m.destino] || 'Registrado' : 'No registrado'}
                        </span>
                      ) : (
                        <div className="banco-form">
                          {p.motivo && <span className="banco-motivo">✓ {p.motivo}</span>}
                          <select value={p.destino} onChange={(e) => cambiar(m, { destino: e.target.value, gastoExistente: null })}>
                            {DESTINOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                          {p.destino === 'ingreso' && (
                            <>
                              <Combobox valor={p.hermano_id} onCambio={(v) => cambiar(m, { hermano_id: v })} placeholder="Nº de sobre…"
                                opciones={opciones(cat.hermanos, p.hermano_id, (h) => ({ id: h.id, etiqueta: `${h.nro_sobre} · ${h.nombre} ${h.apellidos || ''}`.trim() }))} />
                              <Combobox valor={p.grupo_id} onCambio={(v) => cambiar(m, { grupo_id: v })} placeholder="Grupo…"
                                opciones={opciones(cat.grupos, p.grupo_id, (g) => ({ id: g.id, etiqueta: g.nombre }))} />
                              <Combobox permitirVacio etiquetaVacio="Sin pagador" valor={p.pagador_id} onCambio={(v) => cambiar(m, { pagador_id: v })}
                                opciones={opciones(cat.pagadores, p.pagador_id, (x) => ({ id: x.id, etiqueta: x.nombre }))} />
                            </>
                          )}
                          {p.destino === 'gasto' && !p.gastoExistente && (
                            <>
                              <Combobox valor={p.subcuenta_id} onCambio={(v) => cambiar(m, { subcuenta_id: v })} placeholder="Subcuenta…"
                                opciones={subcuentas.filter((s) => s.activo || s.id === p.subcuenta_id).map((s) => {
                                  const c = cat.cuentas.find((x) => x.id === s.cuenta_id)
                                  return { id: s.id, etiqueta: `${s.nro} · ${s.nombre}`, detalle: c ? `${c.nro} · ${c.ministerio}` : '' }
                                })} />
                              <Combobox permitirVacio etiquetaVacio="Sin proveedor" valor={p.proveedor_id} onCambio={(v) => cambiar(m, { proveedor_id: v })}
                                opciones={opciones(cat.proveedores, p.proveedor_id, (x) => ({ id: x.id, etiqueta: x.nombre }))} />
                              <Combobox valor={p.autorizador_id} onCambio={(v) => cambiar(m, { autorizador_id: v })} placeholder="Autoriza…"
                                opciones={opciones(cat.autorizadores, p.autorizador_id, (x) => ({ id: x.id, etiqueta: x.nombre }))} />
                            </>
                          )}
                          {p.gastoExistente && <span className="tenue">Se marcará como pagada la factura ya registrada.</span>}
                        </div>
                      )}
                    </td>
                    <td className="acciones">
                      {m.estado === 'pendiente'
                        ? <button className="btn btn-primario" onClick={() => conciliarUno(m)}>Registrar</button>
                        : <button className="btn-texto" onClick={() => deshacer(m)}>Deshacer</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {mapeo && (
        <Modal titulo="Indica qué contiene cada columna" onCerrar={() => setMapeo(null)} ancho="760px">
          <p className="tenue modal-ayuda">No se han reconocido las columnas del archivo. Elige cuál es cada una; la próxima vez con el mismo banco funcionará igual.</p>
          <div className="formulario">
            {[['fecha', 'Fecha'], ['concepto', 'Concepto'], ['importe', 'Importe (con signo)'], ['debe', 'Cargos (si van aparte)'], ['haber', 'Abonos (si van aparte)'], ['saldo', 'Saldo']].map(([k, l]) => (
              <Campo key={k} etiqueta={l}>
                <select value={mapeo.mapa[k] ?? -1} onChange={(e) => setMapeo({ ...mapeo, mapa: { ...mapeo.mapa, [k]: Number(e.target.value) } })}>
                  <option value={-1}>— No tiene —</option>
                  {mapeo.cabeceras.map((c, i) => <option key={i} value={i}>{c || `Columna ${i + 1}`}</option>)}
                </select>
              </Campo>
            ))}
            <div className="tabla-envoltura campo-completo">
              <table className="tabla"><tbody>{mapeo.filas.map((f, i) => <tr key={i}>{f.map((c, j) => <td key={j}>{String(c ?? '').slice(0, 24)}</td>)}</tr>)}</tbody></table>
            </div>
            <div className="botonera"><span className="espacio" />
              <button className="btn btn-suave" onClick={() => setMapeo(null)}>Cancelar</button>
              <button className="btn btn-primario" onClick={() => importar(null, { ...{ fecha: -1, concepto: -1, importe: -1, debe: -1, haber: -1, saldo: -1, referencia: -1 }, ...mapeo.mapa })}>Importar</button>
            </div>
          </div>
        </Modal>
      )}
      {dialogo}
    </section>
  )
}
