import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, dinero, hoy, primerDiaMes, fmtFecha, aNumero, traerTodo, mensajeError } from '../supabase'
import { Aviso, Campo, Modal, Cargando } from '../components/ui'
import Combobox from '../components/Combobox'
import { AnalisisGastos } from '../components/Analisis'

const vacio = () => ({ fecha: hoy(), cuenta_id: '', subcuenta_id: '', proveedor_id: '', factura: '', concepto: '',
  modalidad: 'Banco', monto: '', autorizador_id: '', comentario: '' })

export default function Gastos({ config }) {
  const [vista, setVista] = useState('registros')
  const [cuentas, setCuentas] = useState([])
  const [subcuentas, setSubcuentas] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [autorizadores, setAutorizadores] = useState([])
  const [f, setF] = useState({ desde: primerDiaMes(), hasta: hoy(), cuenta: '', modalidad: '', texto: '' })
  const [filas, setFilas] = useState(null)
  const [editando, setEditando] = useState(null)
  const [original, setOriginal] = useState(null)
  const [pres, setPres] = useState(null)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    supabase.from('cuentas').select('id,nro,ministerio,activo').order('nro').then(({ data }) => setCuentas(data || []))
    supabase.from('subcuentas').select('id,nro,nombre,cuenta_id,activo').order('nro').then(({ data }) => setSubcuentas(data || []))
    supabase.from('proveedores').select('id,nombre,cif_nie,activo').order('nombre').then(({ data }) => setProveedores(data || []))
    supabase.from('autorizadores').select('id,nombre,activo').order('nombre').then(({ data }) => setAutorizadores(data || []))
  }, [])

  const cargar = useCallback(async () => {
    try {
      const datos = await traerTodo(() => {
        let q = supabase.from('v_gastos').select('*')
        if (f.desde) q = q.gte('fecha', f.desde)
        if (f.hasta) q = q.lte('fecha', f.hasta)
        if (f.cuenta) q = q.eq('cuenta_id', f.cuenta)
        if (f.modalidad) q = q.eq('modalidad', f.modalidad)
        return q.order('fecha', { ascending: false }).order('creado_en', { ascending: false })
      })
      setFilas(datos)
    } catch (e) { setMsg({ t: 'error', m: mensajeError(e) }) }
  }, [f.desde, f.hasta, f.cuenta, f.modalidad])
  useEffect(() => { cargar() }, [cargar])

  // Presupuesto de la subcuenta elegida en el año del gasto
  const anioGasto = editando?.fecha?.slice(0, 4)
  useEffect(() => {
    setPres(null)
    if (!editando?.subcuenta_id || !anioGasto) return
    supabase.from('v_presupuesto').select('monto,ejecutado,diferencia')
      .eq('subcuenta_id', editando.subcuenta_id).eq('anio', Number(anioGasto)).maybeSingle()
      .then(({ data }) => setPres(data || { sin: true }))
  }, [editando?.subcuenta_id, anioGasto])

  const visibles = useMemo(() => {
    const t = f.texto.trim().toLowerCase()
    if (!filas) return []
    if (!t) return filas
    return filas.filter((x) => `${x.concepto || ''} ${x.proveedor || ''} ${x.factura || ''} ${x.subcuenta} ${x.comentario || ''}`.toLowerCase().includes(t))
  }, [filas, f.texto])
  const total = visibles.reduce((s, x) => s + Number(x.monto), 0)

  let disponible = null
  if (pres && !pres.sin && editando) {
    const mismoOriginal = original && original.subcuenta_id === editando.subcuenta_id && original.fecha.slice(0, 4) === anioGasto
    disponible = Number(pres.diferencia) + (mismoOriginal ? Number(original.monto) : 0) - (aNumero(editando.monto) || 0)
  }

  function abrir(x) {
    if (!x) { setOriginal(null); return setEditando(vacio()) }
    setOriginal(x)
    setEditando({
      id: x.id, fecha: x.fecha, cuenta_id: x.cuenta_id, subcuenta_id: x.subcuenta_id, proveedor_id: x.proveedor_id || '',
      factura: x.factura || '', concepto: x.concepto || '', modalidad: x.modalidad, monto: String(x.monto).replace('.', ','),
      autorizador_id: x.autorizador_id || '', comentario: x.comentario || '',
    })
  }

  async function guardar(e) {
    e.preventDefault()
    const m = aNumero(editando.monto)
    if (!editando.subcuenta_id) return setMsg({ t: 'error', m: 'Elige cuenta y subcuenta.' })
    if (!editando.concepto.trim()) return setMsg({ t: 'error', m: 'Escribe el concepto.' })
    if (!editando.autorizador_id) return setMsg({ t: 'error', m: 'Elige quién autoriza.' })
    if (!(m > 0)) return setMsg({ t: 'error', m: 'El monto debe ser mayor que cero.' })
    const datos = {
      fecha: editando.fecha, subcuenta_id: editando.subcuenta_id, proveedor_id: editando.proveedor_id || null,
      factura: editando.factura.trim() || null, concepto: editando.concepto.trim(), modalidad: editando.modalidad,
      monto: Math.round(m * 100) / 100, autorizador_id: editando.autorizador_id, comentario: editando.comentario.trim() || null,
    }
    const { error } = editando.id
      ? await supabase.from('gastos').update(datos).eq('id', editando.id)
      : await supabase.from('gastos').insert(datos)
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setEditando(null); setMsg({ t: 'ok', m: 'Gasto guardado.' }); cargar()
  }

  async function borrar() {
    if (!confirm('¿Borrar este gasto?')) return
    const { error } = await supabase.from('gastos').delete().eq('id', editando.id)
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setEditando(null); cargar()
  }

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const setV = (k) => (v) => setEditando((p) => (k === 'cuenta_id' ? { ...p, cuenta_id: v, subcuenta_id: '' } : { ...p, [k]: v }))
  const setE = (k) => (e) => {
    const v = e.target.value
    setEditando((p) => (k === 'cuenta_id' ? { ...p, cuenta_id: v, subcuenta_id: '' } : { ...p, [k]: v }))
  }
  const activos = (lista, actual) => lista.filter((x) => x.activo || x.id === actual)

  return (
    <section className="pagina con-tabla">
      <div className="titulo-accion">
        <h1>Gastos</h1>
        <button className="btn btn-primario" onClick={() => abrir(null)}>Nuevo gasto</button>
      </div>
      <div className="pestanas" role="tablist">
        <button role="tab" aria-selected={vista === 'registros'} className={vista === 'registros' ? 'sel' : ''} onClick={() => setVista('registros')}>Registros</button>
        <button role="tab" aria-selected={vista === 'analisis'} className={vista === 'analisis' ? 'sel' : ''} onClick={() => setVista('analisis')}>Análisis</button>
      </div>
      {vista === 'analisis' ? <AnalisisGastos config={config} /> : (
        <div className="flex-resto">
      <div className="filtros">
        <Campo etiqueta="Desde"><input type="date" value={f.desde} onChange={set('desde')} /></Campo>
        <Campo etiqueta="Hasta"><input type="date" value={f.hasta} onChange={set('hasta')} /></Campo>
        <Campo etiqueta="Cuenta">
          <select value={f.cuenta} onChange={set('cuenta')}>
            <option value="">Todas</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nro} · {c.ministerio}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Modalidad">
          <select value={f.modalidad} onChange={set('modalidad')}><option value="">Todas</option><option>Efectivo</option><option>Banco</option></select>
        </Campo>
        <Campo etiqueta="Buscar"><input value={f.texto} onChange={set('texto')} placeholder="Concepto, proveedor…" /></Campo>
      </div>
      <Aviso tipo={msg?.t} onCerrar={() => setMsg(null)}>{msg?.m}</Aviso>

      {!filas ? <Cargando /> : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead><tr><th>Fecha</th><th>Subcuenta</th><th>Concepto</th><th>Proveedor</th><th>Modalidad</th><th className="num">Monto</th></tr></thead>
            <tbody>
              {visibles.map((x) => (
                <tr key={x.id} className="clic" onClick={() => abrir(x)}>
                  <td>{fmtFecha(x.fecha)}</td>
                  <td>{x.nro_subcuenta} · {x.subcuenta}<small className="sub">{x.ministerio}</small></td>
                  <td>{x.concepto}</td><td>{x.proveedor}</td><td>{x.modalidad}</td>
                  <td className="num">{dinero(x.monto)}</td>
                </tr>
              ))}
              {visibles.length === 0 && <tr><td colSpan="6" className="tenue">No hay gastos con estos filtros.</td></tr>}
            </tbody>
            <tfoot><tr><td colSpan="5">{visibles.length} movimientos</td><td className="num">{dinero(total)}</td></tr></tfoot>
          </table>
        </div>
      )}

        </div>
      )}
      {editando && (
        <Modal titulo={editando.id ? 'Editar gasto' : 'Nuevo gasto'} onCerrar={() => setEditando(null)} ancho="720px">
          <form className="formulario" onSubmit={guardar}>
            <Campo etiqueta="Fecha"><input type="date" required value={editando.fecha} onChange={setE('fecha')} /></Campo>
            <Campo etiqueta="Factura"><input value={editando.factura} onChange={setE('factura')} /></Campo>
            <Campo etiqueta="Cuenta (ministerio)">
              <Combobox required valor={editando.cuenta_id} onCambio={setV('cuenta_id')}
                opciones={activos(cuentas, editando.cuenta_id).map((c) => ({ id: c.id, etiqueta: `${c.nro} · ${c.ministerio}` }))} />
            </Campo>
            <Campo etiqueta="Subcuenta">
              <Combobox required valor={editando.subcuenta_id} onCambio={setV('subcuenta_id')} disabled={!editando.cuenta_id}
                placeholder={editando.cuenta_id ? 'Escribe para buscar…' : 'Primero la cuenta'}
                opciones={activos(subcuentas, editando.subcuenta_id).filter((s) => s.cuenta_id === editando.cuenta_id)
                  .map((s) => ({ id: s.id, etiqueta: `${s.nro} · ${s.nombre}` }))} />
            </Campo>
            {pres && (
              <div className={'presupuesto-info campo-completo' + (disponible !== null && disponible < 0 ? ' excedido' : '')}>
                {pres.sin
                  ? `Esta subcuenta no tiene presupuesto en ${anioGasto}.`
                  : <>Presupuesto {anioGasto}: {dinero(pres.monto)} · disponible tras este gasto: <b>{dinero(disponible)}</b></>}
              </div>
            )}
            <Campo etiqueta="Concepto" ancho="completo"><input required value={editando.concepto} onChange={setE('concepto')} /></Campo>
            <Campo etiqueta="Proveedor (opcional)">
              <Combobox permitirVacio etiquetaVacio="Sin proveedor" valor={editando.proveedor_id} onCambio={setV('proveedor_id')}
                opciones={activos(proveedores, editando.proveedor_id).map((p) => ({ id: p.id, etiqueta: p.nombre, detalle: p.cif_nie }))} />
            </Campo>
            <Campo etiqueta="Autoriza">
              <Combobox required valor={editando.autorizador_id} onCambio={setV('autorizador_id')}
                opciones={activos(autorizadores, editando.autorizador_id).map((a) => ({ id: a.id, etiqueta: a.nombre }))} />
            </Campo>
            <Campo etiqueta="Modalidad">
              <select value={editando.modalidad} onChange={setE('modalidad')}><option>Banco</option><option>Efectivo</option></select>
            </Campo>
            <Campo etiqueta="Monto"><input inputMode="decimal" required value={editando.monto} onChange={setE('monto')} /></Campo>
            <Campo etiqueta="Comentario" ancho="completo"><input value={editando.comentario} onChange={setE('comentario')} /></Campo>
            <div className="botonera">
              {editando.id && <button type="button" className="btn btn-peligro" onClick={borrar}>Borrar</button>}
              <span className="espacio" />
              <button type="button" className="btn btn-suave" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn btn-primario">Guardar gasto</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}
