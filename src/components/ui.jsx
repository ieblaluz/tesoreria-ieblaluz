import { useEffect, useRef } from 'react'

// Ventanas abiertas, de la más antigua a la más reciente. Solo la última responde a "atrás" y a Esc.
const pila = []
let ignorarAtras = 0
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignorarAtras > 0) { ignorarAtras--; return }
    const ultima = pila[pila.length - 1]
    if (ultima) { ultima.porAtras = true; ultima.cerrar() }
  })
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pila.length) pila[pila.length - 1].cerrar()
  })
}

// Ventana modal. El botón "atrás" del navegador o del móvil la cierra en lugar de cambiar de pantalla.
export function Modal({ titulo, onCerrar, children, ancho, clase }) {
  const cerrarRef = useRef(onCerrar)
  cerrarRef.current = onCerrar
  useEffect(() => {
    const entrada = { porAtras: false, cerrar: () => cerrarRef.current() }
    pila.push(entrada)
    window.history.pushState({ modal: true }, '', window.location.href)
    return () => {
      pila.splice(pila.indexOf(entrada), 1)
      // Si se cerró con la ✕ o "Cancelar", quitamos la entrada que añadimos al historial sin cerrar otras ventanas
      if (!entrada.porAtras && window.history.state?.modal) { ignorarAtras++; window.history.back() }
    }
  }, [])
  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className={'modal' + (clase ? ' ' + clase : '')} style={ancho ? { maxWidth: ancho } : undefined} role="dialog" aria-label={titulo}>
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
