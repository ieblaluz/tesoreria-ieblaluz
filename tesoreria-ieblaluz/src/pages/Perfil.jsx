import { useState } from 'react'
import { supabase, mensajeError } from '../supabase'
import { Aviso, Campo } from '../components/ui'

export default function Perfil({ perfil }) {
  const [clave, setClave] = useState('')
  const [repite, setRepite] = useState('')
  const [msg, setMsg] = useState(null)

  async function cambiar(e) {
    e.preventDefault()
    if (clave.length < 6) return setMsg({ t: 'error', m: 'La clave debe tener al menos 6 caracteres.' })
    if (clave !== repite) return setMsg({ t: 'error', m: 'Las dos claves no coinciden.' })
    const { error } = await supabase.auth.updateUser({ password: clave })
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setClave(''); setRepite('')
    setMsg({ t: 'ok', m: 'Clave cambiada. Úsala la próxima vez que entres.' })
  }

  return (
    <section className="pagina estrecha">
      <h1>Mi perfil</h1>
      <dl className="ficha">
        <dt>Nombre</dt><dd>{perfil.nombre}</dd>
        <dt>Usuario</dt><dd>{perfil.usuario}</dd>
        <dt>Rol</dt><dd>{perfil.rol === 'tesorero' ? 'Tesorero' : 'Contador'}</dd>
      </dl>
      <form className="panel" onSubmit={cambiar}>
        <h2>Cambiar mi clave</h2>
        <Aviso tipo={msg?.t} onCerrar={() => setMsg(null)}>{msg?.m}</Aviso>
        <Campo etiqueta="Clave nueva">
          <input type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} />
        </Campo>
        <Campo etiqueta="Repite la clave nueva">
          <input type="password" autoComplete="new-password" value={repite} onChange={(e) => setRepite(e.target.value)} />
        </Campo>
        <button className="btn btn-primario">Cambiar clave</button>
      </form>
    </section>
  )
}
