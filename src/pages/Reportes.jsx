import { useEffect, useState } from 'react'
import { supabase, hoy } from '../supabase'
import { Aviso, Campo } from '../components/ui'
import Combobox from '../components/Combobox'
import ReporteCulto from '../components/ReporteCulto'
import ReciboContribuciones from '../components/ReciboContribuciones'

const inicioAnio = () => `${new Date().getFullYear()}-01-01`

function Tarjeta({ titulo, descripcion, children, onGenerar, puede = true }) {
  return (
    <form className="panel reporte-tarjeta" onSubmit={(e) => { e.preventDefault(); onGenerar() }}>
      <div>
        <h2>{titulo}</h2>
        <p className="tenue">{descripcion}</p>
      </div>
      <div className="reporte-campos">{children}</div>
      <div className="botonera"><span className="espacio" />
        <button className="btn btn-primario" disabled={!puede}>Ver reporte</button>
      </div>
    </form>
  )
}

export default function Reportes({ config }) {
  const [abierto, setAbierto] = useState(null)
  const [hermanos, setHermanos] = useState([])
  const [grupos, setGrupos] = useState([])
  const [culto, setCulto] = useState({ fecha: hoy(), turno: new Date().getHours() < 15 ? 'Mañana' : 'Tarde' })
  const [recibo, setRecibo] = useState({ hermanoId: '', desde: inicioAnio(), hasta: hoy(), grupoId: '' })
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase.from('hermanos').select('id,nro_sobre,nombre,apellidos,activo').order('nro_sobre').then(({ data }) => setHermanos(data || []))
    supabase.from('grupos_ingreso').select('id,nombre').order('nombre').then(({ data }) => setGrupos(data || []))
  }, [])

  function abrirRecibo() {
    if (!recibo.hermanoId) return setMsg('Elige el contribuyente.')
    if (recibo.desde > recibo.hasta) return setMsg('La fecha «desde» no puede ser posterior a «hasta».')
    setMsg(''); setAbierto('recibo')
  }

  return (
    <section className="pagina">
      <h1>Reportes</h1>
      <Aviso onCerrar={() => setMsg('')}>{msg}</Aviso>
      <div className="reportes-rejilla">
        <Tarjeta titulo="Tablón semanal" descripcion="Ingresos de un culto por concepto y medio, con firmas de contadores y tesorero."
          onGenerar={() => setAbierto('culto')}>
          <Campo etiqueta="Fecha"><input type="date" required value={culto.fecha} onChange={(e) => setCulto({ ...culto, fecha: e.target.value })} /></Campo>
          <Campo etiqueta="Turno">
            <select value={culto.turno} onChange={(e) => setCulto({ ...culto, turno: e.target.value })}><option>Mañana</option><option>Tarde</option></select>
          </Campo>
        </Tarjeta>

        <Tarjeta titulo="Recibo individual de contribuciones" descripcion="Aportaciones de un hermano en un periodo, con su total y firma del tesorero."
          onGenerar={abrirRecibo}>
          <Campo etiqueta="Contribuyente" ancho="completo">
            <Combobox valor={recibo.hermanoId} onCambio={(v) => setRecibo({ ...recibo, hermanoId: v })}
              opciones={hermanos.map((h) => ({ id: h.id, etiqueta: `${h.nro_sobre} · ${h.nombre} ${h.apellidos || ''}`.trim(), detalle: h.activo ? '' : 'Desactivado' }))} />
          </Campo>
          <Campo etiqueta="Desde"><input type="date" required value={recibo.desde} onChange={(e) => setRecibo({ ...recibo, desde: e.target.value })} /></Campo>
          <Campo etiqueta="Hasta"><input type="date" required value={recibo.hasta} onChange={(e) => setRecibo({ ...recibo, hasta: e.target.value })} /></Campo>
          <Campo etiqueta="Concepto" ancho="completo">
            <Combobox permitirVacio etiquetaVacio="Todos los conceptos" valor={recibo.grupoId}
              onCambio={(v) => setRecibo({ ...recibo, grupoId: v })} opciones={grupos.map((g) => ({ id: g.id, etiqueta: g.nombre }))} />
          </Campo>
        </Tarjeta>
      </div>

      {abierto === 'culto' && <ReporteCulto {...culto} config={config} onCerrar={() => setAbierto(null)} />}
      {abierto === 'recibo' && <ReciboContribuciones {...recibo} config={config} onCerrar={() => setAbierto(null)} />}
    </section>
  )
}
