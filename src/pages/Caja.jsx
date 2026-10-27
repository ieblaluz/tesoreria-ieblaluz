import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, dinero, hoy, aNumero, mensajeError } from '../supabase'
import { Aviso } from '../components/ui'
import Combobox from '../components/Combobox'
import ReporteCulto from '../components/ReporteCulto'

const nombreContador = (c) => c.contadores?.nombre || c.nombre_libre || ''
const nombreH = (h) => `${h.nombre} ${h.apellidos || ''}`.trim()

export default function Caja({ perfil, config, esTesorero, puede }) {
  const [contadores, setContadores] = useState([])
  const [contaron, setContaron] = useState([])
  const [persona, setPersona] = useState('')
  const miContador = esTesorero ? null : perfil.contador_id
  const [activo, setActivo] = useState(0)
  const [reporte, setReporte] = useState(false)
  const [hermanos, setHermanos] = useState([])
  const [grupos, setGrupos] = useState([])
  const [fecha, setFecha] = useState(hoy())
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
      await supabase.from('tablon_semanal').insert({ fecha, turno, contador_id: miContador })
      ;({ data: t } = await leerTablon())
    }
    setContaron(t || [])
  }, [fecha, turno, miContador])
  useEffect(() => { cargar() }, [cargar])

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
    }
  }

  async function guardar(e) {
    e?.preventDefault()
    const m = aNumero(monto)
    if (!hermano) return setMsg({ t: 'error', m: 'Elige un hermano por su número de sobre o nombre.' })
    if (!grupoId) return setMsg({ t: 'error', m: 'Elige el grupo de ingreso.' })
    if (!(m > 0)) return setMsg({ t: 'error', m: 'Escribe un monto mayor que cero.' })
    setGuardando(true)
    const { error } = await supabase.from('ingresos').insert({
      fecha, turno, medio, hermano_id: hermano.id, grupo_id: grupoId,
      monto: Math.round(m * 100) / 100, comentario: comentario.trim() || null,
    })
    setGuardando(false)
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    // Deja constancia en el tablón de quién contó este culto (si ya estaba, no se repite)
    if (miContador && !contaron.some((c) => c.contador_id === miContador)) {
      await supabase.from('tablon_semanal').insert({ fecha, turno, contador_id: miContador })
    }
    setMsg({ t: 'ok', m: `Registrado: ${dinero(m)} de ${nombreH(hermano)}` })
    setBusca(''); setHermano(null); setMonto(''); setComentario('')
    refBusca.current?.focus()
    cargar()
  }

  async function quitarDelTablon(c) {
    if (!confirm(`¿Quitar a ${nombreContador(c)} de este culto?`)) return
    const { data, error } = await supabase.from('tablon_semanal').delete().eq('id', c.id).select('id')
    if (error || !data?.length) return setMsg({ t: 'error', m: 'No se pudo quitar. Solo puede corregirlo quien lo anotó, el mismo día.' })
    cargar()
  }
  const hoyLocal = hoy()
  const puedeQuitar = (c) => (esTesorero || c.creado_por === perfil.id) && new Date(c.creado_en).toLocaleDateString('sv-SE') === hoyLocal

  // Añade al tablón a un contador de la lista o, si el nombre no está en la lista, a un ayudante
  async function anotarPersona(e) {
    e?.preventDefault()
    const texto = persona.trim()
    if (!texto) return
    const c = contadores.find((x) => x.nombre.toLowerCase() === texto.toLowerCase())
    if (contaron.some((x) => nombreContador(x).toLowerCase() === texto.toLowerCase())) {
      setPersona(''); return setMsg({ t: 'error', m: `${texto} ya está anotado en este culto.` })
    }
    const { error } = await supabase.from('tablon_semanal')
      .insert(c ? { fecha, turno, contador_id: c.id } : { fecha, turno, nombre_libre: texto })
    if (error) return setMsg({ t: 'error', m: error.code === '23505' ? `${texto} ya está anotado en este culto.` : mensajeError(error) })
    setPersona('')
    cargar()
  }

  async function borrar(l) {
    if (!confirm(`¿Borrar ${dinero(l.monto)} de ${l.hermano_nombre}?`)) return
    const { data, error } = await supabase.from('ingresos').delete().eq('id', l.id).select('id')
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    if (!data?.length) return setMsg({ t: 'error', m: 'No puedes borrar esta línea. Pide al tesorero que la corrija.' })
    cargar()
  }

  const total = lineas.reduce((s, l) => s + Number(l.monto), 0)
  const porMedio = (md) => lineas.filter((l) => l.medio === md).reduce((s, l) => s + Number(l.monto), 0)
  const porGrupo = Object.entries(lineas.reduce((acc, l) => {
    acc[l.grupo] = (acc[l.grupo] || 0) + Number(l.monto); return acc
  }, {}))

  return (
    <section className="pagina caja">
      <h1>Registrar ingresos</h1>

      <div className="caja-culto">
        <label className="campo">
          <span className="campo-etiqueta">Fecha</span>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
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
            onCambio={setGrupoId} onElegido={() => setTimeout(() => refBusca.current?.focus(), 0)} />
        </label>
        <div className="campo campo-contaron">
          <span className="campo-etiqueta">Contaron en este culto</span>
          <div className="contaron-caja">
            <span className="chips">
              {contaron.length === 0 && <span className="tenue">Nadie anotado todavía</span>}
              {contaron.map((c) => (
                <span key={c.id} className={'chip' + (c.contador_id ? '' : ' chip-ayudante')} title={c.contador_id ? 'Contador' : 'Ayudante'}>
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
          </div>
          {!esTesorero && !perfil.contador_id && <span className="campo-error">Tu usuario no está vinculado a un contador. Avisa al tesorero.</span>}
        </div>
      </div>

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
            {lineas.length === 0 && <li className="tenue">Todavía no hay ingresos registrados en este culto.</li>}
            {lineas.map((l) => (
              <li key={l.id}>
                <span className="t-sobre">{l.nro_sobre}</span>
                <span className="t-nombre">{l.hermano_nombre} {l.hermano_apellidos}<small>{l.grupo} · {l.medio}</small></span>
                <span className="t-monto">{dinero(l.monto)}</span>
                <button className="btn-icono" onClick={() => borrar(l)} aria-label="Borrar línea">✕</button>
              </li>
            ))}
          </ol>
          <button className="btn btn-suave btn-ancho ver-reporte" onClick={() => setReporte(true)}>Ver e imprimir reporte del culto</button>
          {reporte && <ReporteCulto fecha={fecha} turno={turno} config={config} onCerrar={() => setReporte(false)} />}
          {!puede('ingresos') && !perfil.ver_historial && (
            <p className="tenue nota">Ves solo los ingresos que has registrado tú.</p>
          )}
        </div>
      </div>
    </section>
  )
}
