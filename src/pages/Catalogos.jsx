import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, mensajeError } from '../supabase'
import { Aviso, Campo, Modal, Cargando } from '../components/ui'

// Definición de cada catálogo: campos del formulario y columnas visibles
const CATALOGOS = [
  { id: 'hermanos', titulo: 'Hermanos', singular: 'hermano', orden: 'nro_sobre',
    numero: { campo: 'nro_sobre', rpc: 'siguiente_nro_sobre', nombre: 'número de sobre' },
    campos: [
      { k: 'nro_sobre', l: 'Nº de sobre', t: 'numero', req: true },
      { k: 'nombre', l: 'Nombre', req: true }, { k: 'apellidos', l: 'Apellidos' },
      { k: 'dni_nie', l: 'DNI/NIE' }, { k: 'telefono', l: 'Teléfono', t: 'tel' }, { k: 'email', l: 'Email', t: 'email' },
    ],
    columnas: ['nro_sobre', 'nombre', 'apellidos', 'dni_nie', 'telefono'] },
  { id: 'proveedores', titulo: 'Proveedores', singular: 'proveedor', orden: 'nombre',
    campos: [{ k: 'nombre', l: 'Proveedor', req: true }, { k: 'cif_nie', l: 'CIF/NIE' }, { k: 'direccion', l: 'Dirección', ancho: 'completo' }],
    columnas: ['nombre', 'cif_nie', 'direccion'] },
  { id: 'cuentas', titulo: 'Cuentas', singular: 'cuenta', orden: 'nro',
    numero: { campo: 'nro', rpc: 'siguiente_nro_cuenta', nombre: 'número de cuenta' },
    campos: [{ k: 'nro', l: 'Nº de cuenta', t: 'numero', req: true }, { k: 'ministerio', l: 'Ministerio', req: true }],
    columnas: ['nro', 'ministerio'] },
  { id: 'subcuentas', titulo: 'Subcuentas', singular: 'subcuenta', orden: 'nro',
    numero: { campo: 'nro', rpc: 'siguiente_nro_subcuenta', nombre: 'número de subcuenta', depende: 'cuenta_id', param: 'p_cuenta_id' },
    campos: [
      { k: 'cuenta_id', l: 'Cuenta', t: 'ref', ref: 'cuentas', req: true },
      { k: 'nro', l: 'Nº de subcuenta', t: 'numero', req: true }, { k: 'nombre', l: 'Nombre', req: true },
    ],
    columnas: ['nro', 'nombre', 'cuenta_id'] },
  { id: 'grupos_ingreso', titulo: 'Grupos de ingreso', singular: 'grupo', orden: 'nombre',
    campos: [{ k: 'nombre', l: 'Nombre del grupo', req: true, ancho: 'completo' }], columnas: ['nombre'] },
  { id: 'autorizadores', titulo: 'Autorizadores', singular: 'autorizador', orden: 'nombre',
    campos: [{ k: 'nombre', l: 'Nombre', req: true }, { k: 'cargo', l: 'Cargo' }], columnas: ['nombre', 'cargo'] },
  { id: 'contadores', titulo: 'Contadores', singular: 'contador', orden: 'nombre',
    campos: [{ k: 'nombre', l: 'Nombre', req: true, ancho: 'completo' }], columnas: ['nombre'] },
]

const etiquetaRef = { cuentas: (c) => `${c.nro} · ${c.ministerio}` }

export default function Catalogos() {
  const [actual, setActual] = useState(CATALOGOS[0])
  return (
    <section className="pagina con-tabla">
      <h1>Catálogos</h1>
      <div className="pestanas" role="tablist">
        {CATALOGOS.map((c) => (
          <button key={c.id} role="tab" aria-selected={c.id === actual.id} className={c.id === actual.id ? 'sel' : ''}
            onClick={() => setActual(c)}>{c.titulo}</button>
        ))}
      </div>
      <Catalogo key={actual.id} def={actual} />
    </section>
  )
}

function Catalogo({ def }) {
  const [filas, setFilas] = useState(null)
  const [refs, setRefs] = useState({})
  const [texto, setTexto] = useState('')
  const [verInactivos, setVerInactivos] = useState(false)
  const [editando, setEditando] = useState(null)
  const [msg, setMsg] = useState(null)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from(def.id).select('*').order(def.orden)
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setFilas(data || [])
  }, [def])

  useEffect(() => {
    cargar()
    def.campos.filter((c) => c.t === 'ref').forEach((c) =>
      supabase.from(c.ref).select('*').order('nro').then(({ data }) => setRefs((r) => ({ ...r, [c.ref]: data || [] }))))
  }, [def, cargar])

  const mostrar = (fila, k) => {
    const campo = def.campos.find((c) => c.k === k)
    if (campo?.t === 'ref') {
      const r = (refs[campo.ref] || []).find((x) => x.id === fila[k])
      return r ? etiquetaRef[campo.ref](r) : ''
    }
    return fila[k] ?? ''
  }

  const visibles = useMemo(() => {
    const t = texto.trim().toLowerCase()
    return (filas || []).filter((f) => (verInactivos || f.activo) &&
      (!t || def.columnas.some((k) => String(mostrar(f, k)).toLowerCase().includes(t))))
  }, [filas, texto, verInactivos, refs]) // eslint-disable-line

  async function alternarActivo(f) {
    const { error } = await supabase.from(def.id).update({ activo: !f.activo }).eq('id', f.id)
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    cargar()
  }

  const titulos = Object.fromEntries(def.campos.map((c) => [c.k, c.l]))

  return (
    <div className="flex-resto">
      <div className="titulo-accion">
        <input className="buscador" placeholder={`Buscar ${def.titulo.toLowerCase()}…`} value={texto} onChange={(e) => setTexto(e.target.value)} />
        <label className="check"><input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Ver desactivados</label>
        <span className="espacio" />
        <button className="btn btn-primario" onClick={() => setEditando({})}>Nuevo {def.singular}</button>
      </div>
      <Aviso tipo={msg?.t} onCerrar={() => setMsg(null)}>{msg?.m}</Aviso>
      {!filas ? <Cargando /> : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead><tr>{def.columnas.map((k) => <th key={k}>{titulos[k]}</th>)}<th /></tr></thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={f.id} className={'clic' + (f.activo ? '' : ' inactivo')} onClick={() => setEditando(f)}>
                  {def.columnas.map((k) => <td key={k}>{mostrar(f, k)}</td>)}
                  <td className="acciones" onClick={(e) => e.stopPropagation()}>
                    <button className="btn-texto" onClick={() => alternarActivo(f)}>{f.activo ? 'Desactivar' : 'Activar'}</button>
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && <tr><td colSpan={def.columnas.length + 1} className="tenue">Nada que mostrar.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {editando && (
        <Formulario def={def} inicial={editando} refs={refs}
          onCerrar={() => setEditando(null)}
          onGuardado={(m) => { setEditando(null); setMsg({ t: 'ok', m }); cargar() }} />
      )}
    </div>
  )
}

function Formulario({ def, inicial, refs, onCerrar, onGuardado }) {
  const nuevo = !inicial.id
  const [form, setForm] = useState(() => {
    const f = {}
    def.campos.forEach((c) => { f[c.k] = inicial[c.k] ?? '' })
    return f
  })
  const [error, setError] = useState('')
  const [avisoNro, setAvisoNro] = useState('')
  const [guardando, setGuardando] = useState(false)
  const nroTocado = useRef(false)
  const num = def.numero

  // Sugerir el número siguiente (al abrir, o al cambiar de cuenta en subcuentas)
  const dependeValor = num?.depende ? form[num.depende] : null
  useEffect(() => {
    if (!nuevo || !num || nroTocado.current) return
    if (num.depende && !dependeValor) return
    const params = num.depende ? { [num.param]: dependeValor } : {}
    supabase.rpc(num.rpc, params).then(({ data }) => {
      if (data != null && !nroTocado.current) setForm((f) => ({ ...f, [num.campo]: data }))
    })
  }, [nuevo, num, dependeValor])

  // Comprobar en vivo que el número no esté usado
  const nroValor = num ? form[num.campo] : null
  useEffect(() => {
    if (!num || nroValor === '' || nroValor == null) { setAvisoNro(''); return }
    const t = setTimeout(async () => {
      let q = supabase.from(def.id).select('id').eq(num.campo, Number(nroValor))
      if (inicial.id) q = q.neq('id', inicial.id)
      const { data } = await q.limit(1)
      setAvisoNro(data?.length ? `El ${num.nombre} ${nroValor} ya está registrado. Usa otro.` : '')
    }, 300)
    return () => clearTimeout(t)
  }, [num, nroValor, def.id, inicial.id])

  async function guardar(e) {
    e.preventDefault()
    if (avisoNro) return
    const datos = {}
    for (const c of def.campos) {
      let v = form[c.k]
      if (typeof v === 'string') v = v.trim()
      if (c.req && (v === '' || v == null)) return setError(`Falta: ${c.l}.`)
      if (c.t === 'numero') {
        v = Number(v)
        if (!Number.isInteger(v) || v < 0) return setError(`${c.l} debe ser un número entero.`)
      }
      datos[c.k] = v === '' ? null : v
    }
    setGuardando(true)
    const { error: er } = nuevo
      ? await supabase.from(def.id).insert(datos)
      : await supabase.from(def.id).update(datos).eq('id', inicial.id)
    setGuardando(false)
    if (er) return setError(mensajeError(er))
    onGuardado(nuevo ? `${def.singular[0].toUpperCase() + def.singular.slice(1)} creado.` : 'Cambios guardados.')
  }

  async function eliminar() {
    if (!confirm(`¿Eliminar este ${def.singular}? Si tiene movimientos, no se podrá; desactívalo en su lugar.`)) return
    const { error: er } = await supabase.from(def.id).delete().eq('id', inicial.id)
    if (er) return setError(mensajeError(er))
    onGuardado('Eliminado.')
  }

  return (
    <Modal titulo={nuevo ? `Nuevo ${def.singular}` : `Editar ${def.singular}`} onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <Aviso>{error}</Aviso>
        {def.campos.map((c) => {
          const esNro = num && c.k === num.campo
          const onChange = (e) => {
            if (esNro) nroTocado.current = true
            setForm({ ...form, [c.k]: e.target.value })
          }
          return (
            <Campo key={c.k} etiqueta={c.l} ancho={c.ancho}
              error={esNro ? avisoNro : ''} ayuda={esNro && nuevo ? 'Sugerido automáticamente; puedes cambiarlo.' : ''}>
              {c.t === 'ref' ? (
                <select value={form[c.k]} onChange={onChange} required={c.req}>
                  <option value="">Elige…</option>
                  {(refs[c.ref] || []).filter((r) => r.activo || r.id === form[c.k]).map((r) =>
                    <option key={r.id} value={r.id}>{etiquetaRef[c.ref](r)}</option>)}
                </select>
              ) : (
                <input type={c.t === 'numero' ? 'number' : c.t || 'text'} min={c.t === 'numero' ? 0 : undefined}
                  value={form[c.k]} onChange={onChange} required={c.req} />
              )}
            </Campo>
          )
        })}
        <div className="botonera">
          {!nuevo && <button type="button" className="btn btn-peligro" onClick={eliminar}>Eliminar</button>}
          <span className="espacio" />
          <button type="button" className="btn btn-suave" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario" disabled={guardando || !!avisoNro}>Guardar</button>
        </div>
      </form>
    </Modal>
  )
}
