import { useEffect } from 'react'

export function Modal({ titulo, onCerrar, children, ancho }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onCerrar])
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
