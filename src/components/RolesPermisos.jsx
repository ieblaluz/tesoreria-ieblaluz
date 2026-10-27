import { useCallback, useEffect, useState } from 'react'
import { supabase, mensajeError } from '../supabase'
import { PERMISOS } from '../permisos'
import { Aviso, Campo, Modal } from './ui'

const slug = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

// Matriz de permisos: filas = permisos, columnas = roles
export default function RolesPermisos({ roles, recargar }) {
  const [asignados, setAsignados] = useState(new Set())
  const [editando, setEditando] = useState(null)
  const [msg, setMsg] = useState(null)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('permisos').select('rol_id,modulo')
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setAsignados(new Set((data || []).map((p) => `${p.rol_id}|${p.modulo}`)))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function alternar(rol, modulo) {
    const k = `${rol.id}|${modulo}`
    const tiene = asignados.has(k)
    setAsignados((s) => { const c = new Set(s); tiene ? c.delete(k) : c.add(k); return c })
    const { error } = tiene
      ? await supabase.from('permisos').delete().eq('rol_id', rol.id).eq('modulo', modulo)
      : await supabase.from('permisos').insert({ rol_id: rol.id, modulo })
    if (error) { setMsg({ t: 'error', m: mensajeError(error) }); cargar() }
  }

  async function guardar(e) {
    e.preventDefault()
    const nombre = editando.nombre.trim()
    if (!nombre) return setMsg({ t: 'error', m: 'Escribe el nombre del rol.' })
    const datos = { nombre, descripcion: editando.descripcion.trim() || null }
    const { error } = editando.id
      ? await supabase.from('roles').update(datos).eq('id', editando.id)
      : await supabase.from('roles').insert({ ...datos, id: slug(nombre) || `rol_${Date.now()}` })
    if (error) return setMsg({ t: 'error', m: error.code === '23505' ? 'Ya existe un rol con ese nombre.' : mensajeError(error) })
    setEditando(null); setMsg({ t: 'ok', m: 'Rol guardado. Marca ahora sus permisos.' }); recargar()
  }

  async function borrar() {
    if (!confirm(`¿Borrar el rol «${editando.nombre}»?`)) return
    const { error } = await supabase.from('roles').delete().eq('id', editando.id)
    if (error) return setMsg({ t: 'error', m: error.code === '23503' ? 'No se puede borrar: hay usuarios con este rol. Cámbiales el rol primero.' : mensajeError(error) })
    setEditando(null); recargar(); cargar()
  }

  return (
    <div>
      <div className="titulo-accion">
        <p className="tenue" style={{ margin: 0 }}>Marca lo que puede hacer cada rol. Los cambios se guardan al instante y se aplican la próxima vez que el usuario entre.</p>
        <span className="espacio" />
        <button className="btn btn-primario" onClick={() => setEditando({ nombre: '', descripcion: '' })}>Nuevo rol</button>
      </div>
      <Aviso tipo={msg?.t} onCerrar={() => setMsg(null)}>{msg?.m}</Aviso>
      <div className="tabla-envoltura">
        <table className="tabla permisos">
          <thead>
            <tr>
              <th>Permiso</th>
              {roles.map((r) => (
                <th key={r.id} className="col-rol">
                  <button className="btn-texto" onClick={() => setEditando({ ...r, descripcion: r.descripcion || '' })} title="Editar rol">{r.nombre}</button>
                  {r.es_admin && <small>Administrador</small>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISOS.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.nombre}</strong><small className="sub">{p.desc}</small></td>
                {roles.map((r) => (
                  <td key={r.id} className="col-rol">
                    <input type="checkbox" aria-label={`${p.nombre} para ${r.nombre}`}
                      checked={r.es_admin || asignados.has(`${r.id}|${p.id}`)} disabled={r.es_admin}
                      onChange={() => alternar(r, p.id)} />
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td><strong>Usuarios y configuración</strong><small className="sub">Solo el administrador, para que nadie pierda el acceso por error</small></td>
              {roles.map((r) => <td key={r.id} className="col-rol"><input type="checkbox" checked={!!r.es_admin} disabled /></td>)}
            </tr>
          </tbody>
        </table>
      </div>

      {editando && (
        <Modal titulo={editando.id ? `Rol: ${editando.nombre}` : 'Nuevo rol'} onCerrar={() => setEditando(null)}>
          <form className="formulario" onSubmit={guardar}>
            <Campo etiqueta="Nombre del rol" ancho="completo"><input required value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Descripción" ancho="completo"><input value={editando.descripcion} onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })} placeholder="Ej. Ayuda con los gastos" /></Campo>
            <div className="botonera">
              {editando.id && !editando.sistema && <button type="button" className="btn btn-peligro" onClick={borrar}>Borrar rol</button>}
              <span className="espacio" />
              <button type="button" className="btn btn-suave" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn btn-primario">Guardar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
