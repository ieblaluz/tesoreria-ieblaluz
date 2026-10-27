import Tablon from './Tablon'
import Recibos from './Recibos'
import { InformeIngresosEgresos, IngresosMensuales, IngresosAnuales, IngresosTresAnios, ProveedoresTrimestral, PresupuestoAnual } from './ReportesFinancieros'

// Catálogo de reportes. Para añadir uno nuevo basta con sumarlo a esta lista.
const SECCIONES = [
  { id: 'tablon', titulo: 'Tablón semanal', icono: '▤', permiso: 'reportes_tablon', C: Tablon,
    descripcion: 'Quién contó en cada culto y el reporte de ingresos del culto para firmar.' },
  { id: 'recibos', titulo: 'Recibo individual de contribuciones', icono: '❏', permiso: 'reportes', C: Recibos,
    descripcion: 'Aportaciones de cada hermano en un periodo, con su total y la firma del tesorero.' },
  { id: 'ingresos-egresos', titulo: 'Informe de ingresos y egresos', icono: '⇅', permiso: 'reportes', C: InformeIngresosEgresos,
    descripcion: 'Ingresos por grupo y gastos por subcuenta de un periodo, separados por efectivo y banco, con saldos.' },
  { id: 'mensuales', titulo: 'Ingresos mensuales', icono: '▦', permiso: 'reportes', C: IngresosMensuales,
    descripcion: 'Aportaciones de un mes por número de sobre y domingo, sin nombres, para publicar.' },
  { id: 'anuales', titulo: 'Ingresos anuales', icono: '▥', permiso: 'reportes', C: IngresosAnuales,
    descripcion: 'Aportaciones de cada hermano mes a mes durante un año.' },
  { id: 'tres-anios', titulo: 'Ingresos de los últimos 3 años', icono: '▧', permiso: 'reportes', C: IngresosTresAnios,
    descripcion: 'Total aportado por cada hermano en cada uno de los tres últimos años, con DNI/NIE.' },
  { id: 'proveedores', titulo: 'Proveedores trimestral', icono: '▨', permiso: 'reportes', C: ProveedoresTrimestral,
    descripcion: 'Gastos por proveedor en cada trimestre del año.' },
  { id: 'presupuesto', titulo: 'Presupuesto anual', icono: '◫', permiso: 'reportes', C: PresupuestoAnual,
    descripcion: 'Gastos de cada subcuenta por mes frente a lo presupuestado, con su saldo.' },
]

export default function Reportes(props) {
  const disponibles = SECCIONES.filter((s) => props.puede(s.permiso))
  // La sección elegida forma parte de la ruta (#reportes/recibos), así "atrás" vuelve al listado
  const actual = props.sub || (disponibles.length === 1 ? disponibles[0].id : null)
  const setActual = (id) => props.ir('reportes', id)
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
