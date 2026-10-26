import { useCallback, useEffect, useState } from 'react'
import { supabase, hoy, fmtFecha, mensajeError } from '../supabase'
import { Aviso, Campo } from '../components/ui'
import ReporteCulto from '../components/ReporteCulto'

export default function Tablon({ esTesorero, config }) {
  const [reporte, setReporte] = useState(null)
  const [contadores, setContadores] = useState([])
  const [lista, setLista] = useState([])
  const [form, setForm] = useState({ fecha: hoy(), turno: new Date().getHours() < 15 ? 'Mañana' : 'Tarde', contador_id: '' })
  const [msg, setMsg] = useState(null)

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('tablon_semanal').select('*, contadores(nombre)')
      .order('fecha', { ascending: false }).order('turno').limit(40)
    setLista(data || [])
  }, [])

  useEffect(() => {
    supabase.from('contadores').select('id,nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setContadores(data || []))
    cargar()
  }, [cargar])

  async function guardar(e) {
    e.preventDefault()
    if (!form.contador_id) return setMsg({ t: 'error', m: 'Elige quién contó.' })
    const { error } = await supabase.from('tablon_semanal').insert(form)
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setMsg({ t: 'ok', m: 'Registrado en el tablón.' })
    cargar()
  }

  async function borrar(t) {
    if (!confirm('¿Borrar este registro del tablón?')) return
    const { error } = await supabase.from('tablon_semanal').delete().eq('id', t.id)
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    cargar()
  }

  return (
    <section className="pagina estrecha">
      <h1>Tablón del culto</h1>
      <p className="tenue">Registra quién contó el dinero de cada culto. Si contaron varias personas, regístralas una a una. Pulsa un culto de la lista para ver e imprimir su reporte.</p>
      <form className="panel fila-campos" onSubmit={guardar}>
        <Aviso tipo={msg?.t} onCerrar={() => setMsg(null)}>{msg?.m}</Aviso>
        <Campo etiqueta="Fecha">
          <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
        </Campo>
        <Campo etiqueta="Turno">
          <select value={form.turno} onChange={(e) => setForm({ ...form, turno: e.target.value })}>
            <option>Mañana</option><option>Tarde</option>
          </select>
        </Campo>
        <Campo etiqueta="Contó">
          <select value={form.contador_id} onChange={(e) => setForm({ ...form, contador_id: e.target.value })}>
            <option value="">Elige…</option>
            {contadores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
        <button className="btn btn-primario">Registrar</button>
        <button type="button" className="btn btn-suave" onClick={() => setReporte({ fecha: form.fecha, turno: form.turno })}>Ver reporte</button>
      </form>

      <table className="tabla">
        <thead><tr><th>Fecha</th><th>Turno</th><th>Contó</th>{esTesorero && <th />}</tr></thead>
        <tbody>
          {lista.map((t) => (
            <tr key={t.id} className="clic" onClick={() => setReporte({ fecha: t.fecha, turno: t.turno })}>
              <td>{fmtFecha(t.fecha)}</td><td>{t.turno}</td><td>{t.contadores?.nombre}</td>
              {esTesorero && <td className="acciones" onClick={(e) => e.stopPropagation()}><button className="btn-texto peligro" onClick={() => borrar(t)}>Borrar</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
      {reporte && <ReporteCulto {...reporte} config={config} onCerrar={() => setReporte(null)} />}
    </section>
  )
}
