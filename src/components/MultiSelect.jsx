import { useEffect, useMemo, useRef, useState } from 'react'

const normal = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// Selección múltiple con búsqueda. seleccion vacía = todos.
export default function MultiSelect({ opciones, seleccion, onCambio, etiquetaTodas = 'Todos' }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (!ref.current?.contains(e.target)) setAbierto(false) }
    const esc = (e) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])

  const visibles = useMemo(() => {
    const t = normal(texto.trim())
    return opciones.filter((o) => !t || normal(o.etiqueta).includes(t))
  }, [opciones, texto])

  const marcado = (id) => seleccion.includes(id)
  const alternar = (id) => onCambio(marcado(id) ? seleccion.filter((x) => x !== id) : [...seleccion, id])
  const resumen = seleccion.length === 0 ? etiquetaTodas
    : seleccion.length === 1 ? (opciones.find((o) => o.id === seleccion[0])?.etiqueta || '1 seleccionado')
    : `${seleccion.length} seleccionados`

  return (
    <div className="multi" ref={ref}>
      <button type="button" className={'multi-boton' + (seleccion.length ? ' activo' : '')} onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
        <span>{resumen}</span><span aria-hidden="true">▾</span>
      </button>
      {abierto && (
        <div className="multi-panel">
          <input autoFocus placeholder="Buscar…" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <div className="multi-acciones">
            <button type="button" className="btn-texto" onClick={() => onCambio([])}>{etiquetaTodas}</button>
            <button type="button" className="btn-texto" onClick={() => onCambio(visibles.map((o) => o.id))}>Marcar visibles</button>
          </div>
          <ul>
            {visibles.map((o) => (
              <li key={o.id}>
                <label className="check"><input type="checkbox" checked={marcado(o.id)} onChange={() => alternar(o.id)} /> {o.etiqueta}</label>
              </li>
            ))}
            {visibles.length === 0 && <li className="tenue">Sin coincidencias</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
