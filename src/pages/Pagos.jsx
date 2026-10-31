import { useCallback, useEffect, useState } from 'react'
import { supabase, dinero, hoy, fmtFecha, aNumero, mensajeError } from '../supabase'
import { Aviso, Campo, Modal, InputMonto, fmtMonto } from '../components/ui'
import Combobox from '../components/Combobox'
import NuevoRegistro from '../components/NuevoRegistro'
import useConfirmar from '../components/Confirmar'
import useOrden from '../components/useOrden'
import CalendarioPagos from '../components/CalendarioPagos'
import { RECURRENCIAS } from '../pagos'

const vacio = () => ({ proveedor_id: '', concepto: '', monto: '', fecha_inicio: hoy(), recurrencia: 'mensual', fecha_fin: '', dias_aviso: 3, modalidad: 'Banco', notas: '', activo: true })
const textoRec = Object.fromEntries(RECURRENCIAS)

// Calendario de pagos: pagos programados a proveedores (únicos o periódicos) y facturas pendientes
export default function Pagos({ ir, puede }) {
  const [lista, setLista] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [editando, setEditando] = useState(null)
  const [alta, setAlta] = useState(false)
  const [msg, setMsg] = useState(null)
  const [version, setVersion] = useState(0)
  const [confirmar, dialogo] = useConfirmar()

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('pagos_programados').select('*, proveedores(nombre)').order('fecha_inicio')
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setLista(data || []); setVersion((v) => v + 1)
  }, [])
  useEffect(() => {
    cargar()
    supabase.from('proveedores').select('id,nombre,cif_nie,activo').order('nombre').then(({ data }) => setProveedores(data || []))
  }, [cargar])

  const [ordenados, th] = useOrden(lista, { proveedor: (x) => x.proveedores?.nombre, monto: (x) => Number(x.monto || 0) })

  async function guardar(e) {
    e.preventDefault()
    const m = editando.monto === '' ? null : aNumero(editando.monto)
    if (!editando.concepto.trim()) return setMsg({ t: 'error', m: 'Escribe el concepto.' })
    if (m != null && !(m >= 0)) return setMsg({ t: 'error', m: 'Revisa el monto.' })
    if (editando.fecha_fin && editando.fecha_fin < editando.fecha_inicio) return setMsg({ t: 'error', m: 'La fecha final no puede ser anterior a la primera.' })
    const datos = { proveedor_id: editando.proveedor_id || null, concepto: editando.concepto.trim(), monto: m == null ? null : Math.round(m * 100) / 100,
      fecha_inicio: editando.fecha_inicio, recurrencia: editando.recurrencia, fecha_fin: editando.recurrencia === 'unica' ? null : (editando.fecha_fin || null),
      dias_aviso: Number(editando.dias_aviso) || 0, modalidad: editando.modalidad, notas: editando.notas.trim() || null, activo: editando.activo }
    const prov = proveedores.find((p) => p.id === datos.proveedor_id)
    if (!await confirmar({ titulo: editando.id ? '¿Guardar los cambios?' : '¿Programar este pago?', textoSi: editando.id ? 'Sí, guardar' : 'Sí, programar',
      mensaje: <><b>{prov?.nombre || 'Sin proveedor'}</b> · {datos.concepto}{datos.monto != null && <> · <b>{dinero(datos.monto)}</b></>} · {textoRec[datos.recurrencia].toLowerCase()} desde el {fmtFecha(datos.fecha_inicio)}.</> })) return
    const { error } = editando.id
      ? await supabase.from('pagos_programados').update(datos).eq('id', editando.id)
      : await supabase.from('pagos_programados').insert(datos)
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setEditando(null); setMsg({ t: 'ok', m: 'Pago programado guardado.' }); cargar()
  }

  async function eliminar() {
    if (!await confirmar({ titulo: '¿Eliminar el pago programado?', textoSi: 'Sí, eliminar', peligro: true,
      mensaje: <>Se quitará <b>{editando.concepto}</b> del calendario, también las marcas de pagado. Los gastos registrados no se tocan.</> })) return
    const { error } = await supabase.from('pagos_programados').delete().eq('id', editando.id)
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setEditando(null); cargar()
  }

  const setE = (k) => (e) => setEditando({ ...editando, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  return (
    <section className="pagina">
      <div className="titulo-accion">
        <h1>Calendario de pagos</h1>
        <button className="btn btn-primario" onClick={() => setEditando(vacio())}>Programar pago</button>
      </div>
      <p className="tenue seccion-descripcion">Pagos periódicos o puntuales a proveedores y facturas pendientes de pago (por su fecha de vencimiento). Doble clic en un día para ver el detalle. Los avisos aparecen al abrir la app.</p>
      <Aviso tipo={msg?.t} onCerrar={() => setMsg(null)}>{msg?.m}</Aviso>

      <div className="pagos-disposicion">
        <div className="panel"><CalendarioPagos ir={ir} version={version} /></div>
        <div className="panel">
          <h2>Pagos programados</h2>
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead><tr>{th('proveedor', 'Proveedor')}{th('concepto', 'Concepto')}{th('recurrencia', 'Frecuencia')}{th('fecha_inicio', 'Desde')}{th('monto', 'Monto', 'num')}</tr></thead>
              <tbody>
                {ordenados.length === 0 && <tr><td colSpan="5" className="tenue">Todavía no hay pagos programados.</td></tr>}
                {ordenados.map((p) => (
                  <tr key={p.id} className={'clic' + (p.activo ? '' : ' inactivo')} onClick={() => setEditando({ ...p, proveedor_id: p.proveedor_id || '', monto: p.monto == null ? '' : fmtMonto(p.monto), fecha_fin: p.fecha_fin || '', notas: p.notas || '' })}>
                    <td>{p.proveedores?.nombre || '—'}</td><td>{p.concepto}</td><td>{textoRec[p.recurrencia]}</td>
                    <td>{fmtFecha(p.fecha_inicio)}</td><td className="num">{p.monto != null ? dinero(p.monto) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editando && (
        <Modal titulo={editando.id ? 'Editar pago programado' : 'Programar pago'} onCerrar={() => setEditando(null)}>
          <form className="formulario" onSubmit={guardar}>
            <Campo etiqueta="Proveedor" ancho="completo">
              <Combobox permitirVacio etiquetaVacio="Sin proveedor" valor={editando.proveedor_id} onCambio={(v) => setEditando((p) => ({ ...p, proveedor_id: v }))}
                onNuevo={puede('catalogos') ? () => setAlta(true) : undefined} etiquetaNuevo="Nuevo proveedor"
                opciones={proveedores.filter((p) => p.activo || p.id === editando.proveedor_id).map((p) => ({ id: p.id, etiqueta: p.nombre, detalle: p.cif_nie || '' }))} />
            </Campo>
            <Campo etiqueta="Concepto" ancho="completo"><input required value={editando.concepto} onChange={setE('concepto')} placeholder="Ej. Cuota comunidad del templo" /></Campo>
            <Campo etiqueta="Monto (opcional)"><InputMonto grande={false} value={editando.monto} onChange={(v) => setEditando((p) => ({ ...p, monto: v }))} /></Campo>
            <Campo etiqueta="Modalidad">
              <select value={editando.modalidad} onChange={setE('modalidad')}><option>Banco</option><option>Efectivo</option></select>
            </Campo>
            <Campo etiqueta={editando.recurrencia === 'unica' ? 'Fecha de pago' : 'Primer pago'}><input type="date" required value={editando.fecha_inicio} onChange={setE('fecha_inicio')} /></Campo>
            <Campo etiqueta="Frecuencia">
              <select value={editando.recurrencia} onChange={setE('recurrencia')}>{RECURRENCIAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </Campo>
            {editando.recurrencia !== 'unica' && <Campo etiqueta="Hasta (opcional)"><input type="date" value={editando.fecha_fin} onChange={setE('fecha_fin')} /></Campo>}
            <Campo etiqueta="Avisar con antelación" ayuda="Al abrir la app">
              <select value={editando.dias_aviso} onChange={setE('dias_aviso')}>{[0, 1, 2, 3, 5, 7, 10, 15].map((n) => <option key={n} value={n}>{n === 0 ? 'El mismo día' : `${n} día${n === 1 ? '' : 's'} antes`}</option>)}</select>
            </Campo>
            <Campo etiqueta="Notas" ancho="completo"><input value={editando.notas} onChange={setE('notas')} placeholder="Ej. referencia, contrato…" /></Campo>
            <label className="check campo-completo"><input type="checkbox" checked={editando.activo} onChange={setE('activo')} /> Activo (si se desmarca, deja de aparecer en el calendario)</label>
            <div className="botonera">
              {editando.id && <button type="button" className="btn btn-peligro" onClick={eliminar}>Eliminar</button>}
              <span className="espacio" />
              <button type="button" className="btn btn-suave" autoFocus={!!editando.id} onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn btn-primario">Guardar</button>
            </div>
          </form>
        </Modal>
      )}
      {alta && <NuevoRegistro catalogo="proveedores" onCerrar={() => setAlta(false)}
        onCreado={(fila) => { setProveedores((l) => [...l, { ...fila, activo: true }]); setEditando((p) => ({ ...p, proveedor_id: fila.id })) }} />}
      {dialogo}
    </section>
  )
}
