import { useCallback, useEffect, useState } from 'react'
import { supabase, mensajeError } from '../supabase'
import { Aviso, Campo, Modal, Cargando } from '../components/ui'

async function api(cuerpo) {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch('/api/usuarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(cuerpo),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'No se pudo completar la acción.')
  return j
}

export default function Usuarios({ perfil }) {
  const [lista, setLista] = useState(null)
  const [nuevo, setNuevo] = useState(null)
  const [clave, setClave] = useState(null)
  const [msg, setMsg] = useState(null)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('perfiles').select('*').order('nombre')
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setLista(data || [])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function actualizar(u, cambios) {
    const { error } = await supabase.from('perfiles').update(cambios).eq('id', u.id)
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    cargar()
  }

  async function alternarActivo(u) {
    if (!confirm(u.activo ? `¿Desactivar a ${u.nombre}? No podrá entrar.` : `¿Reactivar a ${u.nombre}?`)) return
    try { await api({ accion: 'activo', id: u.id, activo: !u.activo }); cargar() }
    catch (e) { setMsg({ t: 'error', m: e.message }) }
  }

  async function crear(e) {
    e.preventDefault()
    try {
      await api({ accion: 'crear', ...nuevo })
      setMsg({ t: 'ok', m: `Usuario "${nuevo.usuario.trim().toLowerCase()}" creado. Pásale su usuario y clave.` })
      setNuevo(null); cargar()
    } catch (er) { setMsg({ t: 'error', m: er.message }) }
  }

  async function cambiarClave(e) {
    e.preventDefault()
    try {
      await api({ accion: 'clave', id: clave.id, clave: clave.clave })
      setMsg({ t: 'ok', m: `Clave de ${clave.nombre} restablecida.` }); setClave(null)
    } catch (er) { setMsg({ t: 'error', m: er.message }) }
  }

  return (
    <section className="pagina">
      <div className="titulo-accion">
        <h1>Usuarios</h1>
        <span className="espacio" />
        <button className="btn btn-primario" onClick={() => setNuevo({ usuario: '', nombre: '', clave: '', rol: 'contador', ver_historial: false })}>
          Nuevo usuario
        </button>
      </div>
      <Aviso tipo={msg?.t} onCerrar={() => setMsg(null)}>{msg?.m}</Aviso>

      {!lista ? <Cargando /> : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Ve historial de ingresos</th><th /></tr></thead>
            <tbody>
              {lista.map((u) => {
                const yo = u.id === perfil.id
                return (
                  <tr key={u.id} className={u.activo ? '' : 'inactivo'}>
                    <td>{u.nombre}{yo && <small className="sub">Tú</small>}</td>
                    <td>{u.usuario}</td>
                    <td>
                      <select value={u.rol} disabled={yo} onChange={(e) => actualizar(u, { rol: e.target.value })}>
                        <option value="contador">Contador</option><option value="tesorero">Tesorero</option>
                      </select>
                    </td>
                    <td>
                      {u.rol === 'tesorero' ? <span className="tenue">Siempre</span> : (
                        <label className="check"><input type="checkbox" checked={u.ver_historial}
                          onChange={(e) => actualizar(u, { ver_historial: e.target.checked })} /> Permitir</label>
                      )}
                    </td>
                    <td className="acciones">
                      <button className="btn-texto" onClick={() => setClave({ id: u.id, nombre: u.nombre, clave: '' })}>Restablecer clave</button>
                      {!yo && <button className="btn-texto" onClick={() => alternarActivo(u)}>{u.activo ? 'Desactivar' : 'Activar'}</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {nuevo && (
        <Modal titulo="Nuevo usuario" onCerrar={() => setNuevo(null)}>
          <form className="formulario" onSubmit={crear}>
            <Campo etiqueta="Nombre completo" ancho="completo">
              <input required value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
            </Campo>
            <Campo etiqueta="Usuario" ayuda="Sin espacios. Ej. ruth.ortega">
              <input required autoCapitalize="none" value={nuevo.usuario} onChange={(e) => setNuevo({ ...nuevo, usuario: e.target.value })} />
            </Campo>
            <Campo etiqueta="Clave inicial" ayuda="Mínimo 6 caracteres">
              <input required value={nuevo.clave} onChange={(e) => setNuevo({ ...nuevo, clave: e.target.value })} />
            </Campo>
            <Campo etiqueta="Rol">
              <select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}>
                <option value="contador">Contador</option><option value="tesorero">Tesorero</option>
              </select>
            </Campo>
            {nuevo.rol === 'contador' && (
              <label className="check campo-completo"><input type="checkbox" checked={nuevo.ver_historial}
                onChange={(e) => setNuevo({ ...nuevo, ver_historial: e.target.checked })} /> Puede ver el historial completo de ingresos</label>
            )}
            <div className="botonera"><span className="espacio" />
              <button type="button" className="btn btn-suave" onClick={() => setNuevo(null)}>Cancelar</button>
              <button className="btn btn-primario">Crear usuario</button>
            </div>
          </form>
        </Modal>
      )}

      {clave && (
        <Modal titulo={`Restablecer clave de ${clave.nombre}`} onCerrar={() => setClave(null)}>
          <form className="formulario" onSubmit={cambiarClave}>
            <Campo etiqueta="Clave nueva" ancho="completo" ayuda="Mínimo 6 caracteres. Comunícasela en persona.">
              <input required value={clave.clave} onChange={(e) => setClave({ ...clave, clave: e.target.value })} />
            </Campo>
            <div className="botonera"><span className="espacio" />
              <button type="button" className="btn btn-suave" onClick={() => setClave(null)}>Cancelar</button>
              <button className="btn btn-primario">Restablecer clave</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}
