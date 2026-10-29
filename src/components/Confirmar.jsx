import { useRef, useState } from 'react'
import { Modal } from './ui'

// Confirmación destacada que aparece encima de la ventana actual.
// const [confirmar, dialogo] = useConfirmar()
// const ok = await confirmar({ titulo, mensaje, textoSi, peligro, pin })  → false | true | { pin }
export default function useConfirmar() {
  const [pregunta, setPregunta] = useState(null)
  const [pin, setPin] = useState('')
  const resolver = useRef(null)

  const confirmar = (opciones) => new Promise((res) => {
    resolver.current = res
    setPin('')
    setPregunta(opciones)
  })
  const responder = (valor) => {
    setPregunta(null)
    resolver.current?.(valor)
  }

  const dialogo = pregunta && (
    <Modal titulo={pregunta.titulo || '¿Estás seguro?'} onCerrar={() => responder(false)} clase={'confirmacion' + (pregunta.peligro ? ' peligro' : '')} ancho="460px">
      <form onSubmit={(e) => { e.preventDefault(); if (pregunta.pin && !pin) return; responder(pregunta.pin ? { pin } : true) }}>
        <div className="confirmacion-cuerpo">
          <span className="confirmacion-icono" aria-hidden="true">{pregunta.peligro ? '!' : '?'}</span>
          <div>{pregunta.mensaje}</div>
        </div>
        {pregunta.pin && (
          <label className="campo confirmacion-pin">
            <span className="campo-etiqueta">PIN de autorización del tesorero</span>
            <input type="password" inputMode="numeric" autoComplete="off" autoFocus value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="••••" />
          </label>
        )}
        <div className="botonera">
          <span className="espacio" />
          <button type="button" className="btn btn-suave" autoFocus={!pregunta.pin} onClick={() => responder(false)}>Cancelar</button>
          <button className={'btn ' + (pregunta.peligro ? 'btn-peligro-lleno' : 'btn-primario')} disabled={pregunta.pin && !pin}>
            {pregunta.textoSi || 'Sí, continuar'}
          </button>
        </div>
      </form>
    </Modal>
  )
  return [confirmar, dialogo]
}
