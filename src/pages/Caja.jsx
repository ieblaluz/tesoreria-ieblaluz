import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, dinero, hoy, aNumero, mensajeError } from '../supabase'
import { Aviso, Campo, Modal } from '../components/ui'
import useConfirmar from '../components/Confirmar'
import Icono from '../components/Iconos'
import Combobox from '../components/Combobox'
import NuevoRegistro from '../components/NuevoRegistro'
import ReporteCulto from '../components/ReporteCulto'
import { encolar, verCola, quitarDeCola, actualizarEnCola, sincronizar } from '../cola'
import { suscribir, leerEstado, esErrorDeRed } from '../offline'

const nombreContador = (c) => c.contadores?.nombre || c.nombre_libre || ''
const nombreH = (h) => `${h.nombre} ${h.apellidos || ''}`.trim()

// Consultas que usa la caja, ejecutadas de antemano para que queden guardadas en el dispositivo
export function precargarDatosCaja() {
  supabase.from('hermanos').select('id,nro_sobre,nombre,apellidos').eq('activo', true).order('nro_sobre').then(() => {})
  supabase.from('grupos_ingreso').select('id,nombre').eq('activo', true).order('nombre').then(() => {})
  supabase.from('contadores').select('id,nombre,activo').order('nombre').then(() => {})
}

export default function Caja({ perfil, config, esTesorero, puede }) {
  const [contadores, setContadores] = useState([])
  const [contaron, setContaron] = useState([])
  const [persona, setPersona] = useState('')
  const [alta, setAlta] = useState(null) // { catalogo, texto } para el formulario de alta rápida
  const altaPermitida = puede('catalogos')
  const miContador = esTesorero ? null : perfil.contador_id
  const [activo, setActivo] = useState(0)
  const [reporte, setReporte] = useState(false)
  const [hermanos, setHermanos] = useState([])
  const [grupos, setGrupos] = useState([])
  // Por defecto hoy. Se puede elegir un día pasado para registrar con retraso,
  // salvo que ese culto ya tenga ingresos de otros días (culto cerrado: se consulta en Ingresos)
  const [fecha, setFecha] = useState(hoy())
  const [cerrado, setCerrado] = useState(false) // false | true | 'sin-conexion'
  useEffect(() => {
    if (fecha >= hoy()) return setCerrado(false)
    if (!leerEstado().online) return setCerrado('sin-conexion')
    setCerrado(null)
    supabase.rpc('culto_cerrado', { p_fecha: fecha, p_turno: turno })
      .then(({ data, error }) => setCerrado(error ? 'sin-conexion' : !!data))
  }, [fecha, turno])
  const [turno, setTurno] = useState(new Date().getHours() < 15 ? 'Mañana' : 'Tarde')
  const [grupoId, setGrupoId] = useState('')
  const [medio, setMedio] = useState('Efectivo')
  const [busca, setBusca] = useState('')
  const [hermano, setHermano] = useState(null)
  const [monto, setMonto] = useState('')
  const [comentario, setComentario] = useState('')
  const [lineas, setLineas] = useState([])
  const [msg, setMsg] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const refBusca = useRef(null)
  const refMonto = useRef(null)

  useEffect(() => {
    supabase.from('hermanos').select('id,nro_sobre,nombre,apellidos').eq('activo', true).order('nro_sobre')
      .then(({ data }) => setHermanos(data || []))
    supabase.from('contadores').select('id,nombre,activo').order('nombre')
      .then(({ data }) => setContadores(data || []))
    supabase.from('grupos_ingreso').select('id,nombre').eq('activo', true).order('nombre')
      .then(({ data }) => {
        setGrupos(data || [])
        const diezmo = (data || []).find((g) => g.nombre.toUpperCase() === 'DIEZMOS')
        setGrupoId((diezmo || data?.[0])?.id || '')
      })
  }, [])

  // ---- Sin conexión: lo que no se puede enviar queda en cola y se envía solo al volver internet ----
  const [cola, setCola] = useState([])
  const cargarCola = useCallback(async () => {
    const todo = await verCola()
    setCola(todo.filter((x) => x.datos.fecha === fecha && x.datos.turno === turno))
  }, [fecha, turno])
  async function insertarOEncolar(tabla, datos) {
    if (!leerEstado().online) { await encolar(tabla, datos); return { encolado: true } }
    const { error } = await supabase.from(tabla).insert(datos)
    if (error && esErrorDeRed(error)) { await encolar(tabla, datos); return { encolado: true } }
    return { error }
  }

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('v_ingresos').select('*')
      .eq('fecha', fecha).eq('turno', turno).order('creado_en', { ascending: false })
    if (error) setMsg({ t: 'error', m: mensajeError(error) })
    setLineas(data || [])
    const leerTablon = () => supabase.from('tablon_semanal').select('id,contador_id,nombre_libre,creado_por,creado_en,contadores(nombre)')
      .eq('fecha', fecha).eq('turno', turno).order('creado_en')
    let { data: t } = await leerTablon()
    // El contador que entra queda anotado solo en el culto de hoy
    if (miContador && fecha === hoy() && !(t || []).some((c) => c.contador_id === miContador)) {
      const yaEnCola = (await verCola()).some((x) => x.tabla === 'tablon_semanal' && x.datos.fecha === fecha && x.datos.turno === turno && x.datos.contador_id === miContador)
      if (!yaEnCola) {
        const r = await insertarOEncolar('tablon_semanal', { fecha, turno, contador_id: miContador })
        if (!r.encolado) ({ data: t } = await leerTablon())
      }
    }
    setContaron(t || [])
    cargarCola()
  }, [fecha, turno, miContador, cargarCola]) // eslint-disable-line
  useEffect(() => { cargar() }, [cargar])
  // Cuando se envía lo pendiente (o cambia la conexión), se actualiza la lista
  useEffect(() => {
    let antes = leerEstado()
    return suscribir((e) => {
      if (e.pendientes !== antes.pendientes || (e.online && !antes.online)) cargar()
      antes = e
    })
  }, [cargar])

  const sugerencias = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t || hermano) return []
    if (/^\d+$/.test(t)) {
      const exacto = hermanos.filter((h) => String(h.nro_sobre) === t)
      return [...exacto, ...hermanos.filter((h) => String(h.nro_sobre) !== t && String(h.nro_sobre).startsWith(t))].slice(0, 8)
    }
    const n = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    return hermanos.filter((h) => n(nombreH(h)).includes(n(t))).slice(0, 8)
  }, [busca, hermano, hermanos])

  function escribirBusca(v) {
    setBusca(v); setHermano(null); setActivo(0)
  }
  function elegir(h) {
    setHermano(h); setBusca(String(h.nro_sobre))
    setTimeout(() => refMonto.current?.focus(), 0)
  }
  function teclaBusca(e) {
    if (e.key === 'ArrowDown' && sugerencias.length) { e.preventDefault(); setActivo((a) => Math.min(a + 1, sugerencias.length - 1)) }
    else if (e.key === 'ArrowUp' && sugerencias.length) { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Escape') { setBusca(''); setHermano(null) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (hermano) refMonto.current?.focus()
      else if (sugerencias[activo]) elegir(sugerencias[activo])
      else if (busca.trim() && altaPermitida) setAlta({ catalogo: 'hermanos', texto: busca })
    }
  }

  async function guardar(e) {
    e?.preventDefault()
    const m = aNumero(monto)
    if (!hermano) return setMsg({ t: 'error', m: 'Elige un hermano por su número de sobre o nombre.' })
    if (!grupoId) return setMsg({ t: 'error', m: 'Elige el grupo de ingreso.' })
    if (!(m > 0)) return setMsg({ t: 'error', m: 'Escribe un monto mayor que cero.' })
    setGuardando(true)
    const r = await insertarOEncolar('ingresos', {
      id: crypto.randomUUID(), fecha, turno, medio, hermano_id: hermano.id, grupo_id: grupoId,
      monto: Math.round(m * 100) / 100, comentario: comentario.trim() || null,
    })
    setGuardando(false)
    if (r.error) return setMsg({ t: 'error', m: mensajeError(r.error) })
    // Deja constancia en el tablón de quién contó este culto (si ya estaba, no se repite)
    if (miContador && !contaronVista.some((c) => c.contador_id === miContador)) {
      await insertarOEncolar('tablon_semanal', { fecha, turno, contador_id: miContador })
    }
    setMsg(r.encolado
      ? { t: 'ok', m: `Guardado en el dispositivo: ${dinero(m)} de ${nombreH(hermano)}. Se enviará solo al volver la conexión.` }
      : { t: 'ok', m: `Registrado: ${dinero(m)} de ${nombreH(hermano)}` })
    setBusca(''); setHermano(null); setMonto(''); setComentario('')
    refBusca.current?.focus()
    cargar()
  }

  async function quitarDelTablon(c) {
    if (!await confirmar({ titulo: '¿Quitar del tablón?', textoSi: 'Sí, quitar', peligro: true, mensaje: <>Se quitará a <b>{nombreContador(c)}</b> de las personas que contaron este culto.</> })) return
    if (c.pendiente) { await quitarDeCola(c.id); return cargar() }
    if (!leerEstado().online) return setMsg({ t: 'error', m: 'Sin conexión: para quitar a alguien ya enviado hace falta internet.' })
    const { data, error } = await supabase.from('tablon_semanal').delete().eq('id', c.id).select('id')
    if (error || !data?.length) return setMsg({ t: 'error', m: 'No se pudo quitar. Solo puede corregirlo quien lo anotó, el mismo día.' })
    cargar()
  }
  const hoyLocal = hoy()
  const puedeQuitar = (c) => c.pendiente || ((esTesorero || c.creado_por === perfil.id) && new Date(c.creado_en).toLocaleDateString('sv-SE') === hoyLocal)

  // Añade al tablón a un contador de la lista o, si el nombre no está en la lista, a un ayudante
  async function anotarPersona(e) {
    e?.preventDefault()
    const texto = persona.trim()
    if (!texto) return
    const c = contadores.find((x) => x.nombre.toLowerCase() === texto.toLowerCase())
    if (contaronVista.some((x) => nombreContador(x).toLowerCase() === texto.toLowerCase())) {
      setPersona(''); return setMsg({ t: 'error', m: `${texto} ya está anotado en este culto.` })
    }
    const { error } = await insertarOEncolar('tablon_semanal', c ? { fecha, turno, contador_id: c.id } : { fecha, turno, nombre_libre: texto })
    if (error) return setMsg({ t: 'error', m: error.code === '23505' ? `${texto} ya está anotado en este culto.` : mensajeError(error) })
    setPersona('')
    cargar()
  }

  // ---- Corregir una línea: ventana con el detalle y confirmación destacada ----
  const [confirmar, dialogo] = useConfirmar()
  const [linea, setLinea] = useState(null)
  const puedeCorregir = (l) => l.pendiente || puede('ingresos_editar') || (l.creado_por === perfil.id
    && new Date(l.creado_en).toLocaleDateString('sv-SE') === hoy() && (config?.contador_borra_mismo_dia ?? true))
  const abrirLinea = (l) => setLinea({ ...l, monto: String(l.monto).replace('.', ','), comentario: l.comentario || '' })

  async function guardarLinea() {
    const m = aNumero(linea.monto)
    if (!linea.hermano_id || !linea.grupo_id || !(m > 0)) return setMsg({ t: 'error', m: 'Revisa el sobre, el grupo y el monto.' })
    const h = hermanos.find((x) => x.id === linea.hermano_id)
    const ok = await confirmar({ titulo: '¿Guardar los cambios?', textoSi: 'Sí, guardar',
      mensaje: <>Se modificará el ingreso del sobre <b>{h?.nro_sobre}</b> por <b>{dinero(m)}</b>.</> })
    if (!ok) return
    if (linea.pendiente) {
      await actualizarEnCola(linea.clave, { hermano_id: linea.hermano_id, grupo_id: linea.grupo_id, medio: linea.medio,
        monto: Math.round(m * 100) / 100, comentario: linea.comentario.trim() || null })
      setLinea(null); setMsg({ t: 'ok', m: 'Ingreso pendiente corregido.' }); return cargarCola()
    }
    if (!leerEstado().online) return setMsg({ t: 'error', m: 'Sin conexión: para corregir un ingreso ya enviado hace falta internet.' })
    const { data, error } = await supabase.from('ingresos').update({
      hermano_id: linea.hermano_id, grupo_id: linea.grupo_id, medio: linea.medio,
      monto: Math.round(m * 100) / 100, comentario: linea.comentario.trim() || null,
    }).eq('id', linea.id).select('id')
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    if (!data?.length) return setMsg({ t: 'error', m: 'No tienes permiso para modificar esta línea. Pide al tesorero que la corrija.' })
    setLinea(null); setMsg({ t: 'ok', m: 'Ingreso corregido.' }); cargar()
  }

  async function borrarLinea() {
    const ok = await confirmar({ titulo: '¿Eliminar este ingreso?', textoSi: 'Sí, eliminar', peligro: true,
      mensaje: <>Vas a eliminar <b>{dinero(linea.monto && aNumero(linea.monto))}</b> del sobre <b>{linea.nro_sobre} · {linea.hermano_nombre}</b>. Esta acción no se puede deshacer.</> })
    if (!ok) return
    if (linea.pendiente) { await quitarDeCola(linea.clave); setLinea(null); setMsg({ t: 'ok', m: 'Ingreso pendiente eliminado.' }); return cargarCola() }
    if (!leerEstado().online) return setMsg({ t: 'error', m: 'Sin conexión: para eliminar un ingreso ya enviado hace falta internet.' })
    const { data, error } = await supabase.from('ingresos').delete().eq('id', linea.id).select('id')
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    if (!data?.length) return setMsg({ t: 'error', m: 'No tienes permiso para eliminar esta línea. Pide al tesorero que la corrija.' })
    setLinea(null); setMsg({ t: 'ok', m: 'Ingreso eliminado.' }); cargar()
  }

  // Lo enviado + lo pendiente en el dispositivo
  const lineasVista = [
    ...cola.filter((x) => x.tabla === 'ingresos' && !lineas.some((l) => l.id === x.datos.id)).reverse().map((x) => {
      const h = hermanos.find((y) => y.id === x.datos.hermano_id) || {}
      return { ...x.datos, clave: x.clave, pendiente: true, errorEnvio: x.error, nro_sobre: h.nro_sobre, hermano_nombre: h.nombre,
        hermano_apellidos: h.apellidos, grupo: grupos.find((g) => g.id === x.datos.grupo_id)?.nombre }
    }),
    ...lineas,
  ]
  const contaronVista = [
    ...contaron,
    ...cola.filter((x) => x.tabla === 'tablon_semanal').map((x) => ({
      id: x.clave, pendiente: true, contador_id: x.datos.contador_id, nombre_libre: x.datos.nombre_libre,
      contadores: x.datos.contador_id ? { nombre: contadores.find((c) => c.id === x.datos.contador_id)?.nombre } : null,
    })),
  ]
  // Reporte calculado en el dispositivo, para cuando no hay conexión
  async function reporteLocal() {
    const otro = turno === 'Mañana' ? 'Tarde' : 'Mañana'
    const { data: otras } = await supabase.from('v_ingresos').select('*').eq('fecha', fecha).eq('turno', otro).order('creado_en', { ascending: false }).then((r) => r, () => ({ data: [] }))
    const otrasPend = (await verCola()).filter((x) => x.tabla === 'ingresos' && x.datos.fecha === fecha && x.datos.turno === otro)
    const sumar = (arr) => arr.reduce((t, l) => t + Number(l.monto), 0)
    const m = new Map()
    for (const l of lineasVista) { const k = l.grupo + '|' + l.medio; m.set(k, { grupo: l.grupo, medio: l.medio, total: (m.get(k)?.total || 0) + Number(l.monto) }) }
    const totalOtro = sumar(otras || []) + sumar(otrasPend.map((x) => x.datos))
    return {
      lineas: [...m.values()], efectivo: sumar(lineasVista.filter((l) => l.medio === 'Efectivo')), banco: sumar(lineasVista.filter((l) => l.medio === 'Banco')),
      manana: turno === 'Mañana' ? sumar(lineasVista) : totalOtro, tarde: turno === 'Tarde' ? sumar(lineasVista) : totalOtro,
      contadores: contaronVista.map(nombreContador).filter(Boolean),
    }
  }
  async function abrirReporte() {
    if (leerEstado().online && leerEstado().pendientes) await sincronizar()
    setReporte(true)
  }

  const total = lineasVista.reduce((s, l) => s + Number(l.monto), 0)
  const porMedio = (md) => lineasVista.filter((l) => l.medio === md).reduce((s, l) => s + Number(l.monto), 0)
  const porGrupo = Object.entries(lineasVista.reduce((acc, l) => {
    acc[l.grupo] = (acc[l.grupo] || 0) + Number(l.monto); return acc
  }, {}))

  return (
    <section className="pagina caja">
      <h1>Registrar ingresos</h1>

      <div className="caja-culto">
        <div className="campo">
          <span className="campo-etiqueta">Fecha</span>
          <input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value || hoy())} />
        </div>
        <div className="campo">
          <span className="campo-etiqueta">Turno</span>
          <div className="segmentos">
            {['Mañana', 'Tarde'].map((t) => (
              <button key={t} type="button" className={turno === t ? 'sel' : ''} onClick={() => setTurno(t)}>{t}</button>
            ))}
          </div>
        </div>
        <label className="campo">
          <span className="campo-etiqueta">Grupo</span>
          <Combobox opciones={grupos.map((g) => ({ id: g.id, etiqueta: g.nombre }))} valor={grupoId}
            onCambio={setGrupoId} onElegido={() => setTimeout(() => refBusca.current?.focus(), 0)}
            onNuevo={altaPermitida ? (texto) => setAlta({ catalogo: 'grupos_ingreso', texto }) : undefined} etiquetaNuevo="Nuevo grupo" />
        </label>
        <div className="campo campo-contaron">
          <span className="campo-etiqueta">Contaron en este culto</span>
          {cerrado !== false ? <div className="contaron-caja"><span className="tenue">—</span></div> : <div className="contaron-caja">
            <span className="chips">
              {contaronVista.length === 0 && <span className="tenue">Nadie anotado todavía</span>}
              {contaronVista.map((c) => (
                <span key={c.id} className={'chip' + (c.contador_id ? '' : ' chip-ayudante') + (c.pendiente ? ' chip-pendiente' : '')} title={c.contador_id ? 'Contador' : 'Ayudante'}>
                  {nombreContador(c)}
                  {puedeQuitar(c) && <button type="button" aria-label={`Quitar a ${nombreContador(c)}`} onClick={() => quitarDelTablon(c)}>✕</button>}
                </span>
              ))}
            </span>
            <form className="contaron-anadir" onSubmit={anotarPersona}>
              <input list="lista-contadores" value={persona} onChange={(e) => setPersona(e.target.value)}
                placeholder="Contador o ayudante…" aria-label="Añadir persona que contó" />
              <datalist id="lista-contadores">
                {contadores.filter((c) => c.activo && !contaron.some((x) => x.contador_id === c.id)).map((c) => <option key={c.id} value={c.nombre} />)}
              </datalist>
              <button className="btn btn-suave" disabled={!persona.trim()}>+ Añadir</button>
            </form>
          </div>}
          {!esTesorero && !perfil.contador_id && <span className="campo-error">Tu usuario no está vinculado a un contador. Avisa al tesorero.</span>}
        </div>
      </div>

      {fecha < hoy() && cerrado === false && (
        <Aviso tipo="aviso">Estás registrando con fecha atrasada: <b>{fecha.split('-').reverse().join('/')}</b> · {turno}. Comprueba que es la fecha correcta.</Aviso>
      )}
      {cerrado === null && <p className="tenue">Comprobando la fecha…</p>}
      {(cerrado === true || cerrado === 'sin-conexion') ? (
        <div className="culto-cerrado">
          <span className="confirmacion-icono" aria-hidden="true">!</span>
          <div>
            {cerrado === true ? <>
              <h2>Este culto ya está registrado</h2>
              <p>El culto del <b>{fecha.split('-').reverse().join('/')}</b> ({turno.toLowerCase()}) ya tiene ingresos registrados, así que no se pueden añadir más desde la caja.
                Para consultarlos o corregirlos, usa el módulo <b>Ingresos</b>.</p>
            </> : <>
              <h2>Sin conexión</h2>
              <p>Para registrar con una fecha pasada hace falta internet, para comprobar que ese culto no esté ya registrado. Sin conexión solo se puede registrar el día de hoy.</p>
            </>}
            <button className="btn btn-primario" onClick={() => setFecha(hoy())}>Volver a hoy</button>
          </div>
        </div>
      ) : cerrado === false && (
      <div className="caja-cuerpo">
        <form className="caja-entrada panel" onSubmit={guardar}>
          <Aviso tipo={msg?.t} onCerrar={() => setMsg(null)}>{msg?.m}</Aviso>
          <label className="campo">
            <span className="campo-etiqueta">Sobre o nombre</span>
            <input ref={refBusca} autoFocus value={busca} onChange={(e) => escribirBusca(e.target.value)}
              onKeyDown={teclaBusca} placeholder="Ej. 12 o Ana" autoComplete="off" />
          </label>
          <div className="caja-hermano">
            {hermano
              ? <strong>{hermano.nro_sobre} · {nombreH(hermano)}</strong>
              : sugerencias.length > 0
                ? <ul className="sugerencias">
                    {sugerencias.map((h, i) => (
                      <li key={h.id}><button type="button" tabIndex={-1} className={i === activo ? 'activo' : ''}
                        onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(h)} onMouseEnter={() => setActivo(i)}>
                        <b>{h.nro_sobre}</b> {nombreH(h)}
                      </button></li>
                    ))}
                  </ul>
                : <span className="tenue">{busca ? 'Sin coincidencias' : 'Escribe el número del sobre o el nombre; usa ↑ ↓ y Enter'}</span>}
            {!hermano && busca.trim() && altaPermitida && (
              <button type="button" className="btn-texto nuevo-enlace" onClick={() => setAlta({ catalogo: 'hermanos', texto: busca })}>
                + Nuevo hermano «{busca.trim()}»
              </button>
            )}
          </div>
          <label className="campo">
            <span className="campo-etiqueta">Monto</span>
            <input ref={refMonto} className="monto-grande" inputMode="decimal" value={monto}
              onChange={(e) => setMonto(e.target.value)} placeholder="0,00" />
          </label>
          <div className="campo">
            <span className="campo-etiqueta">Medio</span>
            <div className="segmentos">
              {['Efectivo', 'Banco'].map((t) => (
                <button key={t} type="button" className={medio === t ? 'sel' : ''} onClick={() => setMedio(t)}>{t}</button>
              ))}
            </div>
          </div>
          <label className="campo">
            <span className="campo-etiqueta">Comentario (opcional)</span>
            <input value={comentario} onChange={(e) => setComentario(e.target.value)} />
          </label>
          <button className="btn btn-primario btn-ancho" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Registrar'}
          </button>
        </form>

        <div className="caja-ticket">
          <div className="pantalla">
            <span>Total {turno.toLowerCase()} · {fecha.split('-').reverse().join('/')}</span>
            <output>{dinero(total)}</output>
            <div className="pantalla-medios">
              <span>Efectivo {dinero(porMedio('Efectivo'))}</span>
              <span>Banco {dinero(porMedio('Banco'))}</span>
            </div>
          </div>
          {porGrupo.length > 1 && (
            <ul className="desglose">
              {porGrupo.map(([g, v]) => <li key={g}><span>{g}</span><span>{dinero(v)}</span></li>)}
            </ul>
          )}
          <ol className="ticket-lineas">
            {lineasVista.length === 0 && <li className="tenue">Todavía no hay ingresos registrados en este culto.</li>}
            {lineasVista.map((l) => (
              <li key={l.id} className={l.pendiente ? 'pendiente' : ''} title={l.pendiente ? (l.errorEnvio ? `No se pudo enviar: ${l.errorEnvio}` : 'Pendiente de enviar') : undefined}>
                <span className="t-sobre">{l.nro_sobre}</span>
                <span className="t-nombre">{l.hermano_nombre} {l.hermano_apellidos}<small>{l.grupo} · {l.medio}{l.pendiente && <b className={'marca-pendiente' + (l.errorEnvio ? ' con-error' : '')}>{l.errorEnvio ? ' · No enviado (revisar)' : ' · Pendiente de enviar'}</b>}</small></span>
                <span className="t-monto">{dinero(l.monto)}</span>
                {puedeCorregir(l)
                  ? <button className="btn-icono" onClick={() => abrirLinea(l)} aria-label="Ver o corregir" title="Ver o corregir"><Icono nombre="editar" tam={18} /></button>
                  : <span />}
              </li>
            ))}
          </ol>
          <button className="btn btn-suave btn-ancho ver-reporte" onClick={abrirReporte}>Ver e imprimir reporte del culto</button>
          {reporte && <ReporteCulto fecha={fecha} turno={turno} config={config} onCerrar={() => setReporte(false)} datosLocales={reporteLocal} />}
          {!puede('ingresos') && !perfil.ver_historial && (
            <p className="tenue nota">Ves solo los ingresos que has registrado tú.</p>
          )}
        </div>
      </div>
      )}
      {alta && (
        <NuevoRegistro catalogo={alta.catalogo} texto={alta.texto} onCerrar={() => setAlta(null)}
          onCreado={(fila) => {
            if (alta.catalogo === 'hermanos') {
              setHermanos((l) => [...l, fila].sort((a, b) => a.nro_sobre - b.nro_sobre)); elegir(fila)
            } else {
              setGrupos((l) => [...l, fila].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))); setGrupoId(fila.id)
              setTimeout(() => refBusca.current?.focus(), 0)
            }
          }} />
      )}
      {linea && (
        <Modal titulo="Detalle del ingreso" onCerrar={() => setLinea(null)}>
          <form className="formulario" onSubmit={(e) => { e.preventDefault(); guardarLinea() }}>
            <p className="tenue campo-completo modal-ayuda">{linea.fecha.split('-').reverse().join('/')} · {linea.turno}</p>
            <Campo etiqueta="Nº de sobre" ancho="completo">
              <Combobox required valor={linea.hermano_id} onCambio={(v) => setLinea((p) => ({ ...p, hermano_id: v }))}
                opciones={hermanos.map((h) => ({ id: h.id, etiqueta: `${h.nro_sobre} · ${nombreH(h)}` }))} />
            </Campo>
            <Campo etiqueta="Grupo" ancho="completo">
              <Combobox required valor={linea.grupo_id} onCambio={(v) => setLinea((p) => ({ ...p, grupo_id: v }))}
                opciones={grupos.map((g) => ({ id: g.id, etiqueta: g.nombre }))} />
            </Campo>
            <div className="campo">
              <span className="campo-etiqueta">Medio</span>
              <div className="segmentos">
                {['Efectivo', 'Banco'].map((t) => <button key={t} type="button" className={linea.medio === t ? 'sel' : ''} onClick={() => setLinea({ ...linea, medio: t })}>{t}</button>)}
              </div>
            </div>
            <Campo etiqueta="Monto"><input className="monto-grande" inputMode="decimal" required value={linea.monto} onChange={(e) => setLinea({ ...linea, monto: e.target.value })} /></Campo>
            <Campo etiqueta="Comentario" ancho="completo"><input value={linea.comentario} onChange={(e) => setLinea({ ...linea, comentario: e.target.value })} /></Campo>
            <div className="botonera">
              <button type="button" className="btn btn-peligro" onClick={borrarLinea}>Eliminar</button>
              <span className="espacio" />
              <button type="button" className="btn btn-suave" autoFocus onClick={() => setLinea(null)}>Cancelar</button>
              <button className="btn btn-primario">Guardar</button>
            </div>
          </form>
        </Modal>
      )}
      {dialogo}
    </section>
  )
}
