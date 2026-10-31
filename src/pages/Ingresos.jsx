import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, dinero, hoy, primerDiaMes, fmtFecha, aNumero, traerTodo, mensajeError } from '../supabase'
import { Aviso, Campo, Modal, Cargando, InputMonto, fmtMonto } from '../components/ui'
import Combobox from '../components/Combobox'
import NuevoRegistro from '../components/NuevoRegistro'
import { AnalisisIngresos } from '../components/Analisis'
import useOrden from '../components/useOrden'
import useConfirmar from '../components/Confirmar'

const turnoActual = () => (new Date().getHours() < 15 ? 'Mañana' : 'Tarde')
const vacio = () => ({ fecha: hoy(), turno: turnoActual(), medio: 'Banco', hermano_id: '', grupo_id: '', pagador_id: '', monto: '', comentario: '' })

export default function Ingresos({ config, puede }) {
  const editable = puede('ingresos_editar')
  const [alta, setAlta] = useState(null)
  const [confirmar, dialogo] = useConfirmar()
  const altaPermitida = puede('catalogos')
  const [vista, setVista] = useState('registros')
  const [hermanos, setHermanos] = useState([])
  const [grupos, setGrupos] = useState([])
  const [pagadores, setPagadores] = useState([])
  const [f, setF] = useState({ desde: primerDiaMes(), hasta: hoy(), grupo: '', turno: '', medio: '', pagador: '', texto: '' })
  const [filas, setFilas] = useState(null)
  const [editando, setEditando] = useState(null)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    supabase.from('hermanos').select('id,nro_sobre,nombre,apellidos,activo,es_concepto').order('nro_sobre').then(({ data }) => setHermanos(data || []))
    supabase.from('pagadores').select('id,nombre,dni_nie,activo').order('nombre').then(({ data }) => setPagadores(data || []))
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
        if (f.pagador) q = q.eq('pagador_id', f.pagador)
        return q.order('fecha', { ascending: false }).order('creado_en', { ascending: false })
      })
      setFilas(datos)
    } catch (e) { setMsg({ t: 'error', m: mensajeError(e) }) }
  }, [f.desde, f.hasta, f.grupo, f.turno, f.medio, f.pagador])
  useEffect(() => { cargar() }, [cargar])

  const visibles = useMemo(() => {
    const t = f.texto.trim().toLowerCase()
    if (!filas) return []
    if (!t) return filas
    return filas.filter((x) => `${x.nro_sobre} ${x.hermano_nombre} ${x.hermano_apellidos || ''} ${x.pagador || ''} ${x.comentario || ''}`.toLowerCase().includes(t))
  }, [filas, f.texto])
  const total = visibles.reduce((s, x) => s + Number(x.monto), 0)
  const [ordenadas, th] = useOrden(visibles, {
    hermano: (x) => `${x.hermano_nombre} ${x.hermano_apellidos || ''}`, monto: (x) => Number(x.monto), nro_sobre: (x) => Number(x.nro_sobre),
  })

  // Al elegir el sobre, propone grupo, pagador y medio del último ingreso de ese sobre (útil para el alquiler)
  async function elegirSobre(id) {
    setEditando((p) => ({ ...p, hermano_id: id }))
    if (!id || editando?.id) return
    const { data } = await supabase.from('ingresos').select('grupo_id,pagador_id,medio')
      .eq('hermano_id', id).order('fecha', { ascending: false }).limit(1).maybeSingle()
    if (data) setEditando((p) => ({ ...p, grupo_id: p.grupo_id || data.grupo_id, pagador_id: p.pagador_id || data.pagador_id || '', medio: data.medio || p.medio }))
  }

  async function guardar(e) {
    e.preventDefault()
    const m = aNumero(editando.monto)
    if (!editando.hermano_id || !editando.grupo_id) return setMsg({ t: 'error', m: 'Elige el número de sobre y el grupo.' })
    if (!(m > 0)) return setMsg({ t: 'error', m: 'El monto debe ser mayor que cero.' })
    const datos = {
      fecha: editando.fecha, turno: editando.turno, medio: editando.medio,
      hermano_id: editando.hermano_id, grupo_id: editando.grupo_id, pagador_id: editando.pagador_id || null,
      monto: Math.round(m * 100) / 100, comentario: editando.comentario?.trim() || null,
    }
    const h = hermanos.find((x) => x.id === datos.hermano_id)
    if (!await confirmar({ titulo: editando.id ? '¿Guardar los cambios?' : '¿Registrar este ingreso?', textoSi: editando.id ? 'Sí, guardar' : 'Sí, registrar',
      mensaje: <>{editando.id ? 'Se modificará' : 'Se registrará'} el ingreso del sobre <b>{h?.nro_sobre} · {h?.nombre}</b> por <b>{dinero(datos.monto)}</b> ({datos.medio}, {fmtFecha(datos.fecha)}).</> })) return
    const { error } = editando.id
      ? await supabase.from('ingresos').update(datos).eq('id', editando.id)
      : await supabase.from('ingresos').insert(datos)
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setEditando(null); setMsg({ t: 'ok', m: 'Ingreso guardado.' }); cargar()
  }

  async function borrar(x) {
    if (!await confirmar({ titulo: '¿Eliminar este ingreso?', textoSi: 'Sí, eliminar', peligro: true,
      mensaje: <>Vas a eliminar <b>{dinero(aNumero(x.monto))}</b> del sobre <b>{x.nro_sobre} · {x.hermano_nombre}</b> del {fmtFecha(x.fecha)}. Esta acción no se puede deshacer.</> })) return
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
        <Campo etiqueta="Pagado por">
          <select value={f.pagador} onChange={set('pagador')}>
            <option value="">Todos</option>
            {pagadores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Buscar"><input value={f.texto} onChange={set('texto')} placeholder="Sobre, nombre…" /></Campo>
      </div>
      <Aviso tipo={msg?.t} onCerrar={() => setMsg(null)}>{msg?.m}</Aviso>

      {!filas ? <Cargando /> : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead><tr>{th('fecha', 'Fecha')}{th('turno', 'Turno')}{th('nro_sobre', 'Sobre')}{th('hermano', 'Nombre / concepto')}{th('pagador', 'Pagado por')}{th('grupo', 'Grupo')}{th('medio', 'Medio')}{th('monto', 'Monto', 'num')}</tr></thead>
            <tbody>
              {ordenadas.map((x) => (
                <tr key={x.id} className={editable ? 'clic' : ''} onClick={editable ? () => setEditando({ ...x, pagador_id: x.pagador_id || '', monto: fmtMonto(x.monto) }) : undefined}>
                  <td>{fmtFecha(x.fecha)}</td><td>{x.turno}</td><td>{x.nro_sobre}</td>
                  <td>{x.hermano_nombre} {x.hermano_apellidos}</td><td>{x.pagador}</td><td>{x.grupo}</td><td>{x.medio}</td>
                  <td className="num">{dinero(x.monto)}</td>
                </tr>
              ))}
              {visibles.length === 0 && <tr><td colSpan="8" className="tenue">No hay ingresos con estos filtros.</td></tr>}
            </tbody>
            <tfoot><tr><td colSpan="7">{visibles.length} movimientos</td><td className="num">{dinero(total)}</td></tr></tfoot>
          </table>
        </div>
      )}

        </div>
      )}
      {editando && (
        <Modal titulo={editando.id ? 'Editar ingreso' : 'Nuevo ingreso'} onCerrar={() => setEditando(null)}>
          {!editando.id && <p className="tenue modal-ayuda">Para movimientos que registras tú: transferencias del banco, el alquiler, reembolsos… Lo que se cuenta en el culto se registra en «Registrar».</p>}
          <form className="formulario" onSubmit={guardar}>
            <Campo etiqueta="Fecha"><input type="date" required value={editando.fecha} onChange={setE('fecha')} /></Campo>
            <div className="campo">
              <span className="campo-etiqueta">Turno</span>
              <div className="segmentos">
                {['Mañana', 'Tarde'].map((t) => <button key={t} type="button" className={editando.turno === t ? 'sel' : ''} onClick={() => setEditando({ ...editando, turno: t })}>{t}</button>)}
              </div>
            </div>
            <Campo etiqueta="Nº de sobre" ancho="completo" ayuda="Persona o concepto (p. ej. 39 · Alquiler Piso Pastoral)">
              <Combobox required valor={editando.hermano_id} onCambio={elegirSobre} placeholder="Número o nombre…"
                onNuevo={altaPermitida ? (texto) => setAlta({ catalogo: 'hermanos', texto }) : undefined} etiquetaNuevo="Nuevo sobre"
                opciones={hermanos.filter((h) => h.activo || h.id === editando.hermano_id)
                  .map((h) => ({ id: h.id, etiqueta: `${h.nro_sobre} · ${h.nombre} ${h.apellidos || ''}`.trim(), detalle: h.es_concepto ? 'Sobre de concepto' : '' }))} />
            </Campo>
            <Campo etiqueta="Grupo" ancho="completo">
              <Combobox required valor={editando.grupo_id} onCambio={(v) => setEditando((p) => ({ ...p, grupo_id: v }))}
                onNuevo={altaPermitida ? (texto) => setAlta({ catalogo: 'grupos_ingreso', texto }) : undefined} etiquetaNuevo="Nuevo grupo"
                opciones={grupos.filter((g) => g.activo || g.id === editando.grupo_id).map((g) => ({ id: g.id, etiqueta: g.nombre }))} />
            </Campo>
            <Campo etiqueta="Pagado por (opcional)" ancho="completo" ayuda="Quién hizo el pago, si no es el titular del sobre (p. ej. el inquilino)">
              <Combobox permitirVacio etiquetaVacio="—" valor={editando.pagador_id || ''} onCambio={(v) => setEditando((p) => ({ ...p, pagador_id: v }))}
                onNuevo={altaPermitida ? (texto) => setAlta({ catalogo: 'pagadores', texto }) : undefined} etiquetaNuevo="Nuevo pagador"
                opciones={pagadores.filter((x) => x.activo || x.id === editando.pagador_id).map((x) => ({ id: x.id, etiqueta: x.nombre, detalle: x.dni_nie || '' }))} />
            </Campo>
            <div className="campo">
              <span className="campo-etiqueta">Medio</span>
              <div className="segmentos">
                {['Banco', 'Efectivo'].map((t) => <button key={t} type="button" className={editando.medio === t ? 'sel' : ''} onClick={() => setEditando({ ...editando, medio: t })}>{t}</button>)}
              </div>
            </div>
            <Campo etiqueta="Monto">
              <InputMonto required value={editando.monto} onChange={(v) => setEditando((p) => ({ ...p, monto: v }))} />
            </Campo>
            <Campo etiqueta="Comentario" ancho="completo"><input value={editando.comentario || ''} onChange={setE('comentario')} placeholder="Ej. Alquiler de noviembre, referencia de la transferencia…" /></Campo>
            <div className="botonera">
              {editando.id && <button type="button" className="btn btn-peligro" onClick={() => borrar(editando)}>Borrar</button>}
              <span className="espacio" />
              <button type="button" className="btn btn-suave" autoFocus={!!editando.id} onClick={() => setEditando(null)}>Cancelar</button>
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
            else if (alta.catalogo === 'pagadores') { setPagadores((l) => [...l, conActivo]); setEditando((p) => ({ ...p, pagador_id: fila.id })) }
            else { setGrupos((l) => [...l, conActivo]); setEditando((p) => ({ ...p, grupo_id: fila.id })) }
          }} />
      )}
      {dialogo}
    </section>
  )
}
