import { useEffect, useState } from 'react'
import { leerEstado, suscribir } from '../offline'
import { sincronizar } from '../cola'

// Franja informativa: sin conexión, pendientes de enviar o envío en curso
export default function EstadoConexion() {
  const [e, setE] = useState(leerEstado)
  useEffect(() => suscribir(setE), [])
  if (e.online && !e.pendientes && !e.enviando) return null

  let texto, clase = 'estado-conexion'
  if (!e.online) {
    clase += ' offline'
    texto = <>Sin conexión · Puedes registrar ingresos en la caja; se enviarán solos al volver internet.
      {e.pendientes > 0 && <b> {e.pendientes} pendiente{e.pendientes === 1 ? '' : 's'} de enviar.</b>} Las demás pantallas muestran los últimos datos guardados.</>
  } else if (e.enviando) {
    texto = <>Enviando {e.pendientes} registro{e.pendientes === 1 ? '' : 's'} guardado{e.pendientes === 1 ? '' : 's'} sin conexión…</>
  } else {
    clase += e.conError ? ' error' : ''
    texto = e.conError
      ? <>{e.conError} registro{e.conError === 1 ? '' : 's'} no se pudo enviar. Ábrelo en la caja (marcado en rojo) para revisarlo.</>
      : <>{e.pendientes} registro{e.pendientes === 1 ? '' : 's'} pendiente{e.pendientes === 1 ? '' : 's'} de enviar.</>
  }
  return (
    <div className={clase} role="status">
      <span>{texto}</span>
      {e.online && e.pendientes > 0 && !e.enviando && <button className="btn-texto" onClick={() => sincronizar()}>Enviar ahora</button>}
    </div>
  )
}
