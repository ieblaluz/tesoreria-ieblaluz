import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, dinero, hoy, primerDiaMes, fmtFecha, aNumero, traerTodo, mensajeError } from '../supabase'
import { Aviso, Campo, Modal, Cargando } from '../components/ui'
import Combobox from '../components/Combobox'
import NuevoRegistro from '../components/NuevoRegistro'
import { AnalisisIngresos } from '../components/Analisis'

const vacio = () => ({ fecha: hoy(), turno: 'Mañana', medio: 'Efectivo', hermano_id: '', grupo_id: '', monto: '', comentario: '' })

export default function Ingresos({ config, puede }) {
  const editable = puede('ingresos_editar')
  const [alta, setAlta] = useState(null)
  const altaPermitida = puede('catalogos')
  const [vista, setVista] = useState('registros')
  const [hermanos, setHermanos] = useState([])
  const [grupos, setGrupos] = useState([])
  const [f, setF] = useState({ desde: primerDiaMes(), hasta: hoy(), grupo: '', turno: '', medio: '', texto: '' })
  const [filas, setFilas] = useState(null)
  const [editando, setEditando] = useState(null)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    supabase.from('hermanos').select('id,nro_sobre,nombre,apellidos,activo').order('nro_sobre').then(({ data }) => setHermanos(data || []))
    supabase.from('grupos_ingreso').select('id,nombre,activo').order('nombre').then(({ data }) => setGrupos(data || []))
  }, [])

  const cargar = useCallback(async () => {
    try {
      const datos = await traerTodo(() => {
        let q = supabase.from('v_ingresos').select('*')
        if (f.desde) q = q.gte('fecha', f.desde)
        if (f.hasta) q = q.lte('fecha', f.hasta)
        if (f.grupo) q = q.eq('grupo_id', f.grupo)
        if (f.turno) q = q.eq('turno', f.turno)
        if (f.medio) q = q.eq('medio', f.medio)
        return q.order('fecha', { ascending: false }).order('creado_en', { ascending: false })
      })
      setFilas(datos)
    } catch (e) { setMsg({ t: 'error', m: mensajeError(e) }) }
  }, [f.desde, f.hasta, f.grupo, f.turno, f.medio])
  useEffect(() => { cargar() }, [cargar])

  const visibles = useMemo(() => {
    const t = f.texto.trim().toLowerCase()
    if (!filas) return []
    if (!t) return filas
    return filas.filter((x) => `${x.nro_sobre} ${x.hermano_nombre} ${x.hermano_apellidos || ''} ${x.comentario || ''}`.toLowerCase().includes(t))
  }, [filas, f.texto])
  const total = visibles.reduce((s, x) => s + Number(x.monto), 0)

  async function guardar(e) {
    e.preventDefault()
    const m = aNumero(editando.monto)
    if (!editando.hermano_id || !editando.grupo_id) return setMsg({ t: 'error', m: 'Elige hermano y grupo.' })
    if (!(m > 0)) return setMsg({ t: 'error', m: 'El monto debe ser mayor que cero.' })
    const datos = {
      fecha: editando.fecha, turno: editando.turno, medio: editando.medio,
      hermano_id: editando.hermano_id, grupo_id: editando.grupo_id,
      monto: Math.round(m * 100) / 100, comentario: editando.comentario?.trim() || null,
    }
    const { error } = editando.id
      ? await supabase.from('ingresos').update(datos).eq('id', editando.id)
      : await supabase.from('ingresos').insert(datos)
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setEditando(null); setMsg({ t: 'ok', m: 'Ingreso guardado.' }); cargar()
  }

  async function borrar(x) {
    if (!confirm(`¿Borrar el ingreso de ${dinero(x.monto)} del ${fmtFecha(x.fecha)}?`)) return
    const { error } = await supabase.from('ingresos').delete().eq('id', x.id)
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setEditando(null); cargar()
  }

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const setE = (k) => (e) => setEditando({ ...editando, [k]: e.target.value })

  return (
    <section className="pagina con-tabla">
      <div className="titulo-accion">
        <h1>Ingresos</h1>
        {editable && <button className="btn btn-primario" onClick={() => setEditando(vacio())}>Nuevo ingreso</button>}
      </div>
      <div className="pestanas" role="tablist">
        <button role="tab" aria-selected={vista === 'registros'} className={vista === 'registros' ? 'sel' : ''} onClick={() => setVista('registros')}>Registros</button>
        <button role="tab" aria-selected={vista === 'analisis'} className={vista === 'analisis' ? 'sel' : ''} onClick={() => setVista('analisis')}>Análisis</button>
      </div>
      {vista === 'analisis' ? <AnalisisIngresos config={config} /> : (
        <div className="flex-resto">
      <div className="filtros">
        <Campo etiqueta="Desde"><input type="date" value={f.desde} onChange={set('desde')} /></Campo>
        <Campo etiqueta="Hasta"><input type="date" value={f.hasta} onChange={set('hasta')} /></Campo>
        <Campo etiqueta="Grupo">
          <select value={f.grupo} onChange={set('grupo')}>
            <option value="">Todos</option>
            {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Turno">
          <select value={f.turno} onChange={set('turno')}><option value="">Todos</option><option>Mañana</option><option>Tarde</option></select>
        </Campo>
        <Campo etiqueta="Medio">
          <select value={f.medio} onChange={set('medio')}><option value="">Todos</option><option>Efectivo</option><option>Banco</option></select>
        </Campo>
        <Campo etiqueta="Buscar"><input value={f.texto} onChange={set('texto')} placeholder="Sobre, nombre…" /></Campo>
      </div>
      <Aviso tipo={msg?.t} onCerrar={() => setMsg(null)}>{msg?.m}</Aviso>

      {!filas ? <Cargando /> : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead><tr><th>Fecha</th><th>Turno</th><th>Sobre</th><th>Hermano</th><th>Grupo</th><th>Medio</th><th className="num">Monto</th></tr></thead>
            <tbody>
              {visibles.map((x) => (
                <tr key={x.id} className={editable ? 'clic' : ''} onClick={editable ? () => setEditando({ ...x, monto: String(x.monto).replace('.', ',') }) : undefined}>
                  <td>{fmtFecha(x.fecha)}</td><td>{x.turno}</td><td>{x.nro_sobre}</td>
                  <td>{x.hermano_nombre} {x.hermano_apellidos}</td><td>{x.grupo}</td><td>{x.medio}</td>
                  <td className="num">{dinero(x.monto)}</td>
                </tr>
              ))}
              {visibles.length === 0 && <tr><td colSpan="7" className="tenue">No hay ingresos con estos filtros.</td></tr>}
            </tbody>
            <tfoot><tr><td colSpan="6">{visibles.length} movimientos</td><td className="num">{dinero(total)}</td></tr></tfoot>
          </table>
        </div>
      )}

        </div>
      )}
      {editando && (
        <Modal titulo={editando.id ? 'Editar ingreso' : 'Nuevo ingreso'} onCerrar={() => setEditando(null)}>
          <form className="formulario" onSubmit={guardar}>
            <Campo etiqueta="Fecha"><input type="date" required value={editando.fecha} onChange={setE('fecha')} /></Campo>
            <Campo etiqueta="Turno">
              <select value={editando.turno} onChange={setE('turno')}><option>Mañana</option><option>Tarde</option></select>
            </Campo>
            <Campo etiqueta="Hermano" ancho="completo">
              <Combobox required valor={editando.hermano_id} onCambio={(v) => setEditando((p) => ({ ...p, hermano_id: v }))}
                onNuevo={altaPermitida ? (texto) => setAlta({ catalogo: 'hermanos', texto }) : undefined} etiquetaNuevo="Nuevo hermano"
                opciones={hermanos.filter((h) => h.activo || h.id === editando.hermano_id)
                  .map((h) => ({ id: h.id, etiqueta: `${h.nro_sobre} · ${h.nombre} ${h.apellidos || ''}`.trim() }))} />
            </Campo>
            <Campo etiqueta="Grupo" ancho="completo">
              <Combobox required valor={editando.grupo_id} onCambio={(v) => setEditando((p) => ({ ...p, grupo_id: v }))}
                onNuevo={altaPermitida ? (texto) => setAlta({ catalogo: 'grupos_ingreso', texto }) : undefined} etiquetaNuevo="Nuevo grupo"
                opciones={grupos.filter((g) => g.activo || g.id === editando.grupo_id).map((g) => ({ id: g.id, etiqueta: g.nombre }))} />
            </Campo>
            <Campo etiqueta="Medio">
              <select value={editando.medio} onChange={setE('medio')}><option>Efectivo</option><option>Banco</option></select>
            </Campo>
            <Campo etiqueta="Monto"><input inputMode="decimal" required value={editando.monto} onChange={setE('monto')} /></Campo>
            <Campo etiqueta="Comentario" ancho="completo"><input value={editando.comentario || ''} onChange={setE('comentario')} /></Campo>
            <div className="botonera">
              {editando.id && <button type="button" className="btn btn-peligro" onClick={() => borrar(editando)}>Borrar</button>}
              <span className="espacio" />
              <button type="button" className="btn btn-suave" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn btn-primario">Guardar ingreso</button>
            </div>
          </form>
        </Modal>
      )}
      {alta && (
        <NuevoRegistro catalogo={alta.catalogo} texto={alta.texto} onCerrar={() => setAlta(null)}
          onCreado={(fila) => {
            const conActivo = { ...fila, activo: true }
            if (alta.catalogo === 'hermanos') { setHermanos((l) => [...l, conActivo]); setEditando((p) => ({ ...p, hermano_id: fila.id })) }
            else { setGrupos((l) => [...l, conActivo]); setEditando((p) => ({ ...p, grupo_id: fila.id })) }
          }} />
      )}
    </section>
  )
}
