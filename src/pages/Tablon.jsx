import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, hoy, fmtFecha, traerTodo, mensajeError } from '../supabase'
import { Aviso, Campo, Cargando } from '../components/ui'
import ReporteCulto from '../components/ReporteCulto'
import useOrden from '../components/useOrden'

const haceTresMeses = () => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toLocaleDateString('sv-SE') }

// Sección "Tablón semanal" del módulo de reportes: consulta de cultos (solo filtros, sin edición)
export default function Tablon({ config }) {
  const [f, setF] = useState({ desde: haceTresMeses(), hasta: hoy(), turno: '', persona: '' })
  const [registros, setRegistros] = useState(null)
  const [reporte, setReporte] = useState(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    if (!f.desde || !f.hasta || f.desde > f.hasta) return
    try {
      const datos = await traerTodo(() => {
        let q = supabase.from('tablon_semanal').select('id,fecha,turno,contador_id,nombre_libre,creado_en,contadores(nombre)')
          .gte('fecha', f.desde).lte('fecha', f.hasta)
        if (f.turno) q = q.eq('turno', f.turno)
        return q.order('fecha', { ascending: false }).order('creado_en')
      })
      setRegistros(datos); setError('')
    } catch (e) { setError(mensajeError(e)) }
  }, [f.desde, f.hasta, f.turno])
  useEffect(() => { cargar() }, [cargar])

  // Un renglón por culto (fecha + turno), con todas las personas que contaron
  const cultos = useMemo(() => {
    const m = new Map()
    for (const r of registros || []) {
      const k = r.fecha + r.turno
      if (!m.has(k)) m.set(k, { fecha: r.fecha, turno: r.turno, personas: [] })
      const nombre = r.contadores?.nombre || r.nombre_libre
      const c = m.get(k)
      if (!c.personas.some((p) => p.nombre === nombre)) c.personas.push({ id: r.id, nombre, ayudante: !r.contador_id })
    }
    const t = f.persona.trim().toLowerCase()
    return [...m.values()]
      .filter((c) => !t || c.personas.some((p) => p.nombre.toLowerCase().includes(t)))
      .sort((a, b) => (b.fecha + (b.turno === 'Tarde' ? 1 : 0)).localeCompare(a.fecha + (a.turno === 'Tarde' ? 1 : 0)))
  }, [registros, f.persona])
  const [ordenadas, th] = useOrden(cultos, { contaron: (c) => c.personas.map((p) => p.nombre).join(', ') })

  return (
    <div className="flex-resto">
      <div className="filtros">
        <Campo etiqueta="Desde"><input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></Campo>
        <Campo etiqueta="Hasta"><input type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></Campo>
        <Campo etiqueta="Turno">
          <select value={f.turno} onChange={(e) => setF({ ...f, turno: e.target.value })}>
            <option value="">Todos</option><option>Mañana</option><option>Tarde</option>
          </select>
        </Campo>
        <Campo etiqueta="Persona"><input value={f.persona} onChange={(e) => setF({ ...f, persona: e.target.value })} placeholder="Quién contó…" /></Campo>
      </div>
      <Aviso>{f.desde > f.hasta ? 'La fecha «desde» no puede ser posterior a «hasta».' : error}</Aviso>
      <p className="tenue nota">Las personas que contaron se anotan desde Registrar ingresos. Pulsa un culto para ver e imprimir su reporte.</p>

      {!registros ? <Cargando /> : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead><tr>{th('fecha', 'Fecha')}{th('turno', 'Turno')}{th('contaron', 'Contaron')}<th /></tr></thead>
            <tbody>
              {cultos.length === 0 && <tr><td colSpan="4" className="tenue">No hay cultos con estos filtros.</td></tr>}
              {ordenadas.map((c) => (
                <tr key={c.fecha + c.turno} className="clic" onClick={() => setReporte({ fecha: c.fecha, turno: c.turno })}>
                  <td>{fmtFecha(c.fecha)}</td>
                  <td>{c.turno}</td>
                  <td>
                    <span className="chips">
                      {c.personas.map((p) => (
                        <span key={p.id} className={'chip' + (p.ayudante ? ' chip-ayudante' : '')} title={p.ayudante ? 'Ayudante' : 'Contador'}>{p.nombre}</span>
                      ))}
                    </span>
                  </td>
                  <td className="acciones"><span className="enlace">Ver reporte ›</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan="4">{cultos.length} cultos</td></tr></tfoot>
          </table>
        </div>
      )}
      {reporte && <ReporteCulto {...reporte} config={config} onCerrar={() => setReporte(null)} />}
    </div>
  )
}
