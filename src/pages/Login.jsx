import { useState } from 'react'
import { supabase, DOMINIO_INTERNO, mensajeError } from '../supabase'
import { Aviso } from '../components/ui'

export default function Login({ config, aviso, limpiarAviso }) {
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [entrando, setEntrando] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setError(''); limpiarAviso()
    const u = usuario.trim().toLowerCase()
    if (!u || !clave) return setError('Escribe tu usuario y tu clave.')
    setEntrando(true)
    try {
      let email = u
      if (!u.includes('@')) {
        const { data, error: er } = await supabase.rpc('email_de_usuario', { p_usuario: u })
        if (er) throw er
        email = data || `${u}@${DOMINIO_INTERNO}`
      }
      const { error: er } = await supabase.auth.signInWithPassword({ email, password: clave })
      if (er) throw er
    } catch (er) {
      setError(mensajeError(er))
    } finally {
      setEntrando(false)
    }
  }

  return (
    <div className="login">
      <form className="login-caja" onSubmit={entrar}>
        <img className="login-logo" src={config?.logo_url || '/icon-192.png'} alt="" />
        <h1>{config?.nombre_app || 'Tesorería'}</h1>
        <p className="login-iglesia">{config?.nombre_iglesia}</p>
        <Aviso>{aviso || error}</Aviso>
        <label className="campo">
          <span className="campo-etiqueta">Usuario</span>
          <input autoFocus autoCapitalize="none" autoComplete="username" value={usuario}
            onChange={(e) => setUsuario(e.target.value)} />
        </label>
        <label className="campo">
          <span className="campo-etiqueta">Clave</span>
          <input type="password" autoComplete="current-password" value={clave}
            onChange={(e) => setClave(e.target.value)} />
        </label>
        <button className="btn btn-primario btn-ancho" disabled={entrando}>
          {entrando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
