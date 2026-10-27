import { useEffect, useRef } from 'react'

// Ventana modal. El botón "atrás" del navegador o del móvil la cierra en lugar de cambiar de pantalla.
export function Modal({ titulo, onCerrar, children, ancho }) {
  const cerrarRef = useRef(onCerrar)
  cerrarRef.current = onCerrar
  useEffect(() => {
    let porAtras = false
    window.history.pushState({ modal: true }, '', window.location.href)
    const alVolver = () => { porAtras = true; cerrarRef.current() }
    const k = (e) => e.key === 'Escape' && cerrarRef.current()
    window.addEventListener('popstate', alVolver)
    window.addEventListener('keydown', k)
    return () => {
      window.removeEventListener('popstate', alVolver)
      window.removeEventListener('keydown', k)
      // Si se cerró con la ✕ o "Cancelar", quitamos la entrada que añadimos al historial
      if (!porAtras && window.history.state?.modal) window.history.back()
    }
  }, [])
  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal" style={ancho ? { maxWidth: ancho } : undefined} role="dialog" aria-label={titulo}>
        <div className="modal-cab">
          <h2>{titulo}</h2>
          <button className="btn-icono" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Campo({ etiqueta, children, ayuda, error, ancho }) {
  return (
    <label className={'campo' + (ancho ? ' campo-' + ancho : '')}>
      <span className="campo-etiqueta">{etiqueta}</span>
      {children}
      {error ? <span className="campo-error">{error}</span> : ayuda ? <span className="campo-ayuda">{ayuda}</span> : null}
    </label>
  )
}

export function Aviso({ tipo = 'error', children, onCerrar }) {
  if (!children) return null
  return (
    <div className={'aviso aviso-' + tipo} role="status">
      <span>{children}</span>
      {onCerrar && <button className="btn-icono" onClick={onCerrar} aria-label="Cerrar aviso">✕</button>}
    </div>
  )
}

export function Cargando({ texto = 'Cargando…' }) {
  return <p className="cargando">{texto}</p>
}
