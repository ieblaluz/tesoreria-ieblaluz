import { useState } from 'react'
import Tablon from './Tablon'
import Recibos from './Recibos'

// Catálogo de reportes. Para añadir uno nuevo basta con sumarlo a esta lista.
const TODOS = ['tesorero', 'contador']
const SECCIONES = [
  { id: 'tablon', titulo: 'Tablón semanal', icono: '▤', roles: TODOS, C: Tablon,
    descripcion: 'Quién contó en cada culto y el reporte de ingresos del culto para firmar.' },
  { id: 'recibos', titulo: 'Recibo individual de contribuciones', icono: '❏', roles: ['tesorero'], C: Recibos,
    descripcion: 'Aportaciones de cada hermano en un periodo, con su total y la firma del tesorero.' },
]

export default function Reportes(props) {
  const disponibles = SECCIONES.filter((s) => s.roles.includes(props.perfil.rol))
  const [actual, setActual] = useState(disponibles.length === 1 ? disponibles[0].id : null)
  const seccion = disponibles.find((s) => s.id === actual)

  if (!seccion) {
    return (
      <section className="pagina">
        <h1>Reportes</h1>
        <div className="reportes-rejilla">
          {disponibles.map((s) => (
            <button key={s.id} className="reporte-acceso" onClick={() => setActual(s.id)}>
              <span className="reporte-icono" aria-hidden="true">{s.icono}</span>
              <span className="reporte-texto">
                <strong>{s.titulo}</strong>
                <span>{s.descripcion}</span>
              </span>
              <span className="reporte-flecha" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      </section>
    )
  }

  const Seccion = seccion.C
  return (
    <section className="pagina con-tabla">
      {disponibles.length > 1 && (
        <nav className="migas" aria-label="Ruta">
          <button className="btn-texto" onClick={() => setActual(null)}>Reportes</button>
          <span aria-hidden="true">/</span>
          <span>{seccion.titulo}</span>
        </nav>
      )}
      <div className="titulo-accion">
        <h1>{seccion.titulo}</h1>
      </div>
      {disponibles.length > 1 && (
        <div className="pestanas" role="tablist">
          {disponibles.map((s) => (
            <button key={s.id} role="tab" aria-selected={s.id === actual} className={s.id === actual ? 'sel' : ''}
              onClick={() => setActual(s.id)}>{s.titulo}</button>
          ))}
        </div>
      )}
      <p className="tenue seccion-descripcion">{seccion.descripcion}</p>
      <Seccion {...props} />
    </section>
  )
}
