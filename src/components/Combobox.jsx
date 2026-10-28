import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'

const normal = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// Lista desplegable con búsqueda: escribir para filtrar, flechas para moverse, Enter para elegir, Esc para cancelar.
// opciones: [{ id, etiqueta, detalle? }]
const Combobox = forwardRef(function Combobox(
  { opciones, valor, onCambio, placeholder = 'Escribe para buscar…', vacio = 'Sin coincidencias', onElegido, required, disabled, permitirVacio, etiquetaVacio = 'Ninguno', onNuevo, etiquetaNuevo = 'Añadir nuevo' }, ref
) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [activo, setActivo] = useState(0)
  const refInput = useRef(null)
  const refLista = useRef(null)
  useImperativeHandle(ref, () => ({ focus: () => refInput.current?.focus() }))

  const lista = useMemo(() => (permitirVacio ? [{ id: '', etiqueta: etiquetaVacio }, ...opciones] : opciones), [opciones, permitirVacio, etiquetaVacio])
  const seleccionada = lista.find((o) => o.id === valor)
  const filtradas = useMemo(() => {
    const t = normal(texto.trim())
    const encontradas = t ? lista.filter((o) => normal(`${o.etiqueta} ${o.detalle || ''}`).includes(t)) : lista
    // Opción "+ Añadir nuevo" al principio de la lista (abre el formulario de alta)
    return onNuevo ? [{ id: '__nuevo__', etiqueta: `+ ${etiquetaNuevo}${texto.trim() ? ` «${texto.trim()}»` : ''}`, nuevo: true }, ...encontradas] : encontradas
  }, [texto, lista, onNuevo, etiquetaNuevo])

  useEffect(() => { setActivo(onNuevo && texto.trim() && filtradas.length > 1 ? 1 : 0) }, [texto]) // eslint-disable-line
  useEffect(() => {
    if (!abierto) return
    refLista.current?.querySelector('[data-activo="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activo, abierto])

  function abrir() {
    if (disabled) return
    setTexto('')
    const i = lista.findIndex((o) => o.id === valor)
    const desfase = onNuevo ? 1 : 0
    setAbierto(true)
    setTimeout(() => setActivo(i >= 0 ? i + desfase : desfase), 0)
  }
  function elegir(o) {
    if (o.nuevo) { const t = texto.trim(); setAbierto(false); setTexto(''); return onNuevo(t) }
    onCambio(o.id)
    setAbierto(false); setTexto('')
    onElegido?.(o)
  }
  function tecla(e) {
    if (!abierto && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); return abrir() }
    if (!abierto) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo((a) => Math.min(a + 1, filtradas.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtradas[activo]) elegir(filtradas[activo]) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAbierto(false); setTexto('') }
    else if (e.key === 'Tab') { setAbierto(false); setTexto('') }
  }

  return (
    <div className={'combo' + (abierto ? ' abierto' : '')}>
      <input ref={refInput} role="combobox" aria-expanded={abierto} aria-autocomplete="list" autoComplete="off"
        disabled={disabled} required={required && !valor}
        value={abierto ? texto : seleccionada?.etiqueta || ''}
        placeholder={abierto ? (seleccionada?.etiqueta || placeholder) : placeholder}
        onFocus={abrir} onClick={() => !abierto && abrir()}
        onChange={(e) => { setTexto(e.target.value); if (!abierto) setAbierto(true) }}
        onKeyDown={tecla}
        onBlur={() => { setAbierto(false); setTexto('') }} />
      <span className="combo-flecha" aria-hidden="true">▾</span>
      {abierto && (
        <ul className="combo-lista" role="listbox" ref={refLista}>
          {filtradas.map((o, i) => (
            <li key={o.id || '_vacio'} role="option" aria-selected={o.id === valor} data-activo={i === activo}
              className={(i === activo ? 'activo' : '') + (o.id === valor ? ' elegido' : '') + (o.nuevo ? ' combo-nuevo' : '')}
              onMouseDown={(e) => { e.preventDefault(); elegir(o) }} onMouseEnter={() => setActivo(i)}>
              {o.etiqueta}{o.detalle && <small>{o.detalle}</small>}
            </li>
          ))}
          {filtradas.filter((o) => !o.nuevo).length === 0 && <li className="combo-vacio">{vacio}</li>}
        </ul>
      )}
    </div>
  )
})

export default Combobox
