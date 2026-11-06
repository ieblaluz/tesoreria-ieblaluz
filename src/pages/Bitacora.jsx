import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, dinero, hoy, fmtFecha, traerTodo, mensajeError } from '../supabase'
import { Aviso, Campo, Modal, Cargando } from '../components/ui'
import useOrden from '../components/useOrden'
import { exportarExcel } from '../excel'
import { nombreReporte } from '../components/Documento'

const haceUnMes = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toLocaleDateString('sv-SE') }

// Nombre legible de cada tabla
const TABLAS = {
  ingresos: 'Ingresos', gastos: 'Gastos', movimientos_caja: 'Caja y banco', presupuestos: 'Presupuesto',
  tablon_semanal: 'Tablón', hermanos: 'Hermanos', pagadores: 'Pagadores', grupos_ingreso: 'Grupos de ingreso',
  contadores: 'Contadores', autorizadores: 'Autorizadores', proveedores: 'Proveedores', cuentas: 'Cuentas',
  subcuentas: 'Subcuentas', perfiles: 'Usuarios', roles: 'Roles', permisos: 'Permisos', configuracion: 'Configuración',
  pagos_programados: 'Pagos programados', movimientos_banco: 'Conciliación bancaria', reglas_banco: 'Reglas del banco',
}
const OPERACION = { crear: 'Creó', modificar: 'Modificó', eliminar: 'Eliminó' }
// Nombre legible de cada campo
const CAMPOS = {
  fecha: 'Fecha', fecha_pago: 'Fecha de pago', fecha_vencimiento: 'Vencimiento', fecha_valor: 'Fecha valor',
  turno: 'Turno', medio: 'Medio', modalidad: 'Modalidad', monto: 'Monto', comentario: 'Comentario', concepto: 'Concepto',
  hermano_id: 'Hermano', grupo_id: 'Grupo', pagador_id: 'Pagador', subcuenta_id: 'Subcuenta', cuenta_id: 'Cuenta',
  proveedor_id: 'Proveedor', autorizador_id: 'Autoriza', contador_id: 'Contador', factura: 'Nº de factura',
  nro_sobre: 'Nº de sobre', nro: 'Número', nombre: 'Nombre', apellidos: 'Apellidos', dni_nie: 'DNI/NIE',
  telefono: 'Teléfono', email: 'Email', direccion: 'Dirección', cif_nie: 'CIF/NIE', iban: 'IBAN', banco: 'Entidad bancaria',
  activo: 'Activo', es_concepto: 'Sobre de concepto', descripcion: 'Descripción', ministerio: 'Ministerio',
  anio: 'Año', tipo: 'Tipo', referencia: 'Referencia', rol: 'Rol', usuario: 'Usuario', ver_historial: 'Ve historial',
  estado: 'Estado', destino: 'Destino', notas: 'Notas', recurrencia: 'Frecuencia', dias_aviso: 'Días de aviso',
  creado_por: 'Registrado por', importe: 'Importe', saldo: 'Saldo', nombre_libre: 'Ayudante', pdf_ruta: 'PDF',
}
const MONETARIOS = new Set(['monto', 'importe', 'saldo'])
const OCULTOS = new Set(['id', 'creado_por', 'conciliado_por', 'importado_por', 'pagado_por', 'huella', 'extracto_id',
  'ingreso_id', 'gasto_id', 'caja_id', 'veces'])

export default function Bitacora() {
  const [f, setF] = useState({ desde: haceUnMes(), hasta: hoy(), tabla: '', usuario: '', operacion: '', texto: '' })
  const [filas, setFilas] = useState(null)
  const [usuarios, setUsuarios] = useState([])
  const [nombres, setNombres] = useState({})     // id de catálogo → nombre, para mostrar los cambios
  const [detalle, setDetalle] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.rpc('bitacora_usuarios').then(({ data }) => setUsuarios(data || []))
    const n = {}
    const guarda = (lista, f) => (lista || []).forEach((x) => { n[x.id] = f(x) })
    Promise.all([
      supabase.from('hermanos').select('id,nro_sobre,nombre,apellidos').then(({ data }) => guarda(data, (h) => `${h.nro_sobre} · ${h.nombre} ${h.apellidos || ''}`.trim())),
      supabase.from('subcuentas').select('id,nro,nombre').then(({ data }) => guarda(data, (s) => `${s.nro} · ${s.nombre}`)),
      supabase.from('cuentas').select('id,nro,ministerio').then(({ data }) => guarda(data, (c) => `${c.nro} · ${c.ministerio}`)),
      supabase.from('grupos_ingreso').select('id,nombre').then(({ data }) => guarda(data, (x) => x.nombre)),
      supabase.from('proveedores').select('id,nombre').then(({ data }) => guarda(data, (x) => x.nombre)),
      supabase.from('autorizadores').select('id,nombre').then(({ data }) => guarda(data, (x) => x.nombre)),
      supabase.from('contadores').select('id,nombre').then(({ data }) => guarda(data, (x) => x.nombre)),
      supabase.from('pagadores').select('id,nombre').then(({ data }) => guarda(data, (x) => x.nombre)),
    ]).then(() => setNombres(n))
  }, [])

  const cargar = useCallback(async () => {
    if (!f.desde || !f.hasta || f.desde > f.hasta) return
    setFilas(null)
    try {
      const datos = await traerTodo(() => {
        let q = supabase.from('bitacora').select('*').gte('momento', f.desde).lte('momento', f.hasta + 'T23:59:59')
        if (f.tabla) q = q.eq('tabla', f.tabla)
        if (f.usuario) q = q.eq('usuario_id', f.usuario)
        if (f.operacion) q = q.eq('operacion', f.operacion)
        return q.order('momento', { ascending: false }).order('id', { ascending: false })
      })
      setFilas(datos); setError('')
    } catch (e) { setError(mensajeError(e)) }
  }, [f.desde, f.hasta, f.tabla, f.usuario, f.operacion])
  useEffect(() => { cargar() }, [cargar])

  const visibles = useMemo(() => {
    const t = f.texto.trim().toLowerCase()
    return (filas || []).filter((x) => !t || `${x.descripcion || ''} ${x.usuario || ''} ${TABLAS[x.tabla] || x.tabla}`.toLowerCase().includes(t))
  }, [filas, f.texto])

  const momento = (m) => new Date(m).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const [ordenadas, th] = useOrden(visibles, { momento: (x) => x.momento, tabla: (x) => TABLAS[x.tabla] || x.tabla })

  // Muestra un valor de forma legible
  const valor = (campo, v) => {
    if (v === null || v === undefined || v === '') return '—'
    if (typeof v === 'boolean') return v ? 'Sí' : 'No'
    if (MONETARIOS.has(campo)) return dinero(v)
    if (campo.endsWith('_id') && nombres[v]) return nombres[v]
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return fmtFecha(String(v))
    return String(v)
  }
  const listaCambios = (x) => Object.entries(x.cambios || {}).filter(([k]) => !OCULTOS.has(k))
  const listaDatos = (x) => Object.entries(x.datos || {}).filter(([k]) => !OCULTOS.has(k) && x.datos[k] !== null)

  const exportar = () => exportarExcel({
    titulo: 'Bitácora de movimientos', hoja: 'Bitácora', archivo: nombreReporte('Bitacora', f.desde, f.hasta),
    meta: [['Periodo', `${fmtFecha(f.desde)} – ${fmtFecha(f.hasta)}`], ['Registros', String(ordenadas.length)]],
    tablas: [{
      columnas: [{ t: 'Fecha y hora', ancho: 18 }, { t: 'Usuario', ancho: 22 }, { t: 'Acción', ancho: 12 },
        { t: 'Módulo', ancho: 20 }, { t: 'Registro', ancho: 40 }, { t: 'Cambios', ancho: 60 }],
      filas: ordenadas.map((x) => ({ celdas: [momento(x.momento), x.usuario || '', OPERACION[x.operacion], TABLAS[x.tabla] || x.tabla,
        x.descripcion || '', listaCambios(x).map(([k, c]) => `${CAMPOS[k] || k}: ${valor(k, c.antes)} → ${valor(k, c.despues)}`).join(' · ')] })),
    }],
  })

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  return (
    <section className="pagina con-tabla">
      <div className="titulo-accion">
        <h1>Bitácora</h1>
        <span className="espacio" />
        <button className="btn btn-suave" disabled={!ordenadas.length} onClick={exportar}>Descargar Excel</button>
      </div>
      <p className="tenue seccion-descripcion">Todo lo que se crea, modifica o elimina en el sistema queda registrado aquí: quién lo hizo, cuándo y qué cambió. Pulsa una fila para ver el detalle.</p>

      <div className="filtros">
        <Campo etiqueta="Desde"><input type="date" value={f.desde} onChange={set('desde')} /></Campo>
        <Campo etiqueta="Hasta"><input type="date" value={f.hasta} onChange={set('hasta')} /></Campo>
        <Campo etiqueta="Módulo">
          <select value={f.tabla} onChange={set('tabla')}>
            <option value="">Todos</option>
            {Object.entries(TABLAS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Usuario">
          <select value={f.usuario} onChange={set('usuario')}>
            <option value="">Todos</option>
            {usuarios.map((u) => <option key={u.usuario_id || 'sis'} value={u.usuario_id || ''}>{u.usuario || 'Sistema'}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Acción">
          <select value={f.operacion} onChange={set('operacion')}>
            <option value="">Todas</option><option value="crear">Creó</option><option value="modificar">Modificó</option><option value="eliminar">Eliminó</option>
          </select>
        </Campo>
        <Campo etiqueta="Buscar"><input value={f.texto} onChange={set('texto')} placeholder="Registro, usuario…" /></Campo>
      </div>
      <Aviso>{f.desde > f.hasta ? 'La fecha «desde» no puede ser posterior a «hasta».' : error}</Aviso>

      {!filas ? <Cargando /> : (
        <div className="flex-resto">
          <div className="tabla-envoltura">
            <table className="tabla bitacora">
              <thead><tr>{th('momento', 'Fecha y hora')}{th('usuario', 'Usuario')}{th('operacion', 'Acción')}{th('tabla', 'Módulo')}{th('descripcion', 'Registro')}<th>Cambios</th></tr></thead>
              <tbody>
                {ordenadas.length === 0 && <tr><td colSpan="6" className="tenue">No hay movimientos con estos filtros.</td></tr>}
                {ordenadas.map((x) => {
                  const cambios = listaCambios(x)
                  return (
                    <tr key={x.id} className="clic" onClick={() => setDetalle(x)}>
                      <td className="col-fecha">{momento(x.momento)}</td>
                      <td>{x.usuario || 'Sistema'}</td>
                      <td><span className={'etiqueta-op ' + x.operacion}>{OPERACION[x.operacion]}</span></td>
                      <td>{TABLAS[x.tabla] || x.tabla}</td>
                      <td>{x.descripcion || '—'}</td>
                      <td className="col-cambios">
                        {x.operacion === 'modificar'
                          ? cambios.slice(0, 2).map(([k]) => CAMPOS[k] || k).join(', ') + (cambios.length > 2 ? ` y ${cambios.length - 2} más` : '')
                          : <span className="tenue">Ver detalle</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot><tr><td colSpan="6">{ordenadas.length} movimientos</td></tr></tfoot>
            </table>
          </div>
        </div>
      )}

      {detalle && (
        <Modal titulo={`${OPERACION[detalle.operacion]} · ${TABLAS[detalle.tabla] || detalle.tabla}`} onCerrar={() => setDetalle(null)} ancho="680px">
          <dl className="ficha">
            <dt>Cuándo</dt><dd>{momento(detalle.momento)}</dd>
            <dt>Quién</dt><dd>{detalle.usuario || 'Sistema'}</dd>
            <dt>Registro</dt><dd>{detalle.descripcion || '—'}</dd>
          </dl>
          {detalle.operacion === 'modificar' ? (
            <>
              <h2>Qué cambió</h2>
              <table className="tabla">
                <thead><tr><th>Campo</th><th>Antes</th><th>Después</th></tr></thead>
                <tbody>{listaCambios(detalle).map(([k, c]) => (
                  <tr key={k}><td>{CAMPOS[k] || k}</td><td className="antes">{valor(k, c.antes)}</td><td className="despues">{valor(k, c.despues)}</td></tr>
                ))}</tbody>
              </table>
            </>
          ) : (
            <>
              <h2>{detalle.operacion === 'crear' ? 'Datos registrados' : 'Datos del registro eliminado'}</h2>
              <table className="tabla">
                <tbody>{listaDatos(detalle).map(([k, v]) => (
                  <tr key={k}><td>{CAMPOS[k] || k}</td><td>{valor(k, v)}</td></tr>
                ))}</tbody>
              </table>
            </>
          )}
          <div className="botonera"><span className="espacio" /><button className="btn btn-primario" onClick={() => setDetalle(null)}>Cerrar</button></div>
        </Modal>
      )}
    </section>
  )
}
