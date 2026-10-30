import { useState } from 'react'
import { supabase, mensajeError } from '../supabase'
import { comprobarHuella, guardarHuella } from '../bloqueo'
import { Aviso } from './ui'

// Pantalla de bloqueo: tapa la app (sin perder lo que estaba a medias) hasta que se escribe la clave
export default function Bloqueo({ perfil, config, sesion, motivo, onDesbloquear, onSalir }) {
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [comprobando, setComprobando] = useState(false)

  async function desbloquear(e) {
    e.preventDefault()
    if (!clave) return
    setComprobando(true); setError('')
    try {
      if (navigator.onLine) {
        const { error: er } = await supabase.auth.signInWithPassword({ email: sesion.user.email, password: clave })
        if (er && !/fetch|network/i.test(er.message)) throw er
        if (!er) { await guardarHuella(sesion.user.id, clave); return onDesbloquear() }
      }
      const ok = await comprobarHuella(sesion.user.id, clave)
      if (ok === true) return onDesbloquear()
      if (ok === null) throw new Error('Sin conexión no se puede comprobar la clave en este dispositivo. Conéctate a internet para desbloquear.')
      throw new Error('Clave incorrecta.')
    } catch (er) {
      setError(mensajeError(er)); setClave('')
    } finally { setComprobando(false) }
  }

  return (
    <div className="bloqueo">
      <form className="login-caja" onSubmit={desbloquear}>
        <img className="login-logo" src={config?.icono_192_url || '/icon-192.png'} alt="" />
        <h1>Sesión bloqueada</h1>
        <p className="login-iglesia">{motivo === 'inactividad'
          ? `Por seguridad, la app se bloqueó tras ${config?.minutos_bloqueo || 30} minutos sin uso.`
          : 'Por seguridad, al volver a abrir la app hay que escribir la clave.'}</p>
        <div className="bloqueo-usuario"><span className="avatar">{(perfil.nombre || '?').charAt(0).toUpperCase()}</span>
          <span>{perfil.nombre}<small>{perfil.usuario}</small></span></div>
        <Aviso>{error}</Aviso>
        <label className="campo">
          <span className="campo-etiqueta">Clave</span>
          <input type="password" autoFocus autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
        </label>
        <button className="btn btn-primario btn-ancho" disabled={comprobando || !clave}>{comprobando ? 'Comprobando…' : 'Desbloquear'}</button>
        <button type="button" className="btn-texto" onClick={onSalir}>Cerrar sesión o entrar con otro usuario</button>
        <p className="tenue nota">Lo que estabas haciendo se conserva. Los ingresos pendientes de enviar siguen guardados.</p>
      </form>
    </div>
  )
}
