import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, hoy, fmtFecha, mensajeError } from '../supabase'
import { Aviso, Campo } from '../components/ui'
import Combobox from '../components/Combobox'
import ReporteCulto from '../components/ReporteCulto'

// Sección "Tablón semanal" del módulo de reportes
export default function Tablon({ config }) {
  const [contadores, setContadores] = useState([])
  const [registros, setRegistros] = useState([])
  const [form, setForm] = useState({ fecha: hoy(), turno: new Date().getHours() < 15 ? 'Mañana' : 'Tarde', contador_id: '' })
  const [reporte, setReporte] = useState(null)
  const [msg, setMsg] = useState(null)

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('tablon_semanal').select('id,fecha,turno,contador_id,contadores(nombre)')
      .order('fecha', { ascending: false }).limit(160)
    setRegistros(data || [])
  }, [])

  useEffect(() => {
    supabase.from('contadores').select('id,nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setContadores(data || []))
    cargar()
  }, [cargar])

  // Un renglón por culto (fecha + turno), con todos sus contadores
  const cultos = useMemo(() => {
    const m = new Map()
    for (const r of registros) {
      const k = r.fecha + r.turno
      if (!m.has(k)) m.set(k, { fecha: r.fecha, turno: r.turno, personas: [] })
      const c = m.get(k)
      if (!c.personas.some((p) => p.contador_id === r.contador_id)) c.personas.push({ id: r.id, contador_id: r.contador_id, nombre: r.contadores?.nombre })
    }
    return [...m.values()].sort((a, b) => (b.fecha + (b.turno === 'Tarde' ? 1 : 0)).localeCompare(a.fecha + (a.turno === 'Tarde' ? 1 : 0)))
  }, [registros])

  async function registrar(e) {
    e.preventDefault()
    if (!form.contador_id) return setMsg({ t: 'error', m: 'Elige quién contó.' })
    const ya = registros.some((r) => r.fecha === form.fecha && r.turno === form.turno && r.contador_id === form.contador_id)
    if (ya) return setMsg({ t: 'error', m: 'Esa persona ya está registrada en ese culto.' })
    const { error } = await supabase.from('tablon_semanal').insert(form)
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setMsg({ t: 'ok', m: 'Registrado en el tablón. Puedes añadir a otra persona o ver el reporte.' })
    setForm({ ...form, contador_id: '' })
    cargar()
  }

  return (
    <div>
      <form className="panel fila-campos" onSubmit={registrar}>
        <Aviso tipo={msg?.t} onCerrar={() => setMsg(null)}>{msg?.m}</Aviso>
        <Campo etiqueta="Fecha">
          <input type="date" required value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
        </Campo>
        <Campo etiqueta="Turno">
          <div className="segmentos">
            {['Mañana', 'Tarde'].map((t) => (
              <button key={t} type="button" className={form.turno === t ? 'sel' : ''} onClick={() => setForm({ ...form, turno: t })}>{t}</button>
            ))}
          </div>
        </Campo>
        <Campo etiqueta="Contó">
          <Combobox valor={form.contador_id} onCambio={(v) => setForm({ ...form, contador_id: v })}
            opciones={contadores.map((c) => ({ id: c.id, etiqueta: c.nombre }))} />
        </Campo>
        <div className="botones-fila">
          <button className="btn btn-primario">Registrar</button>
          <button type="button" className="btn btn-suave" onClick={() => setReporte({ fecha: form.fecha, turno: form.turno })}>Ver reporte</button>
        </div>
      </form>

      <div className="tabla-envoltura">
        <table className="tabla">
          <thead><tr><th>Fecha</th><th>Turno</th><th>Contaron</th><th /></tr></thead>
          <tbody>
            {cultos.length === 0 && <tr><td colSpan="4" className="tenue">Todavía no hay cultos registrados en el tablón.</td></tr>}
            {cultos.map((c) => (
              <tr key={c.fecha + c.turno} className="clic" onClick={() => setReporte({ fecha: c.fecha, turno: c.turno })}>
                <td>{fmtFecha(c.fecha)}</td>
                <td>{c.turno}</td>
                <td>
                  <span className="chips">
                    {c.personas.map((p) => (
                      <span key={p.id} className="chip">
                        {p.nombre}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="acciones"><span className="enlace">Ver reporte ›</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reporte && <ReporteCulto {...reporte} config={config} onCerrar={() => setReporte(null)} />}
    </div>
  )
}
