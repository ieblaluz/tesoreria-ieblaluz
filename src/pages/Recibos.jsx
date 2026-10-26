import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, dinero, hoy, traerTodo, mensajeError } from '../supabase'
import { Aviso, Campo, Cargando } from '../components/ui'
import Combobox from '../components/Combobox'
import ReciboContribuciones from '../components/ReciboContribuciones'

const inicioAnio = () => `${new Date().getFullYear()}-01-01`

// Sección "Recibo individual de contribuciones" del módulo de reportes
export default function Recibos({ config }) {
  const [grupos, setGrupos] = useState([])
  const [f, setF] = useState({ desde: inicioAnio(), hasta: hoy(), grupoId: '', texto: '' })
  const [filas, setFilas] = useState(null)
  const [recibo, setRecibo] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('grupos_ingreso').select('id,nombre').order('nombre').then(({ data }) => setGrupos(data || []))
  }, [])

  const cargar = useCallback(async () => {
    if (!f.desde || !f.hasta || f.desde > f.hasta) return
    setFilas(null)
    try {
      const datos = await traerTodo(() => {
        let q = supabase.from('v_ingresos').select('id,hermano_id,nro_sobre,hermano_nombre,hermano_apellidos,monto')
          .gte('fecha', f.desde).lte('fecha', f.hasta)
        if (f.grupoId) q = q.eq('grupo_id', f.grupoId)
        return q.order('id')
      })
      const m = new Map()
      for (const d of datos) {
        const h = m.get(d.hermano_id) || { id: d.hermano_id, sobre: d.nro_sobre, nombre: `${d.hermano_nombre} ${d.hermano_apellidos || ''}`.trim(), n: 0, total: 0 }
        h.n += 1; h.total += Number(d.monto)
        m.set(d.hermano_id, h)
      }
      setFilas([...m.values()].sort((a, b) => a.sobre - b.sobre)); setError('')
    } catch (e) { setError(mensajeError(e)) }
  }, [f.desde, f.hasta, f.grupoId])
  useEffect(() => { cargar() }, [cargar])

  const visibles = useMemo(() => {
    const t = f.texto.trim().toLowerCase()
    return (filas || []).filter((h) => !t || `${h.sobre} ${h.nombre}`.toLowerCase().includes(t))
  }, [filas, f.texto])
  const total = visibles.reduce((s, h) => s + h.total, 0)

  return (
    <div className="flex-resto">
      <div className="filtros">
        <Campo etiqueta="Desde"><input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></Campo>
        <Campo etiqueta="Hasta"><input type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></Campo>
        <Campo etiqueta="Concepto">
          <Combobox permitirVacio etiquetaVacio="Todos los conceptos" valor={f.grupoId}
            onCambio={(v) => setF({ ...f, grupoId: v })} opciones={grupos.map((g) => ({ id: g.id, etiqueta: g.nombre }))} />
        </Campo>
        <Campo etiqueta="Buscar"><input value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} placeholder="Sobre o nombre…" /></Campo>
      </div>
      <Aviso>{f.desde > f.hasta ? 'La fecha «desde» no puede ser posterior a «hasta».' : error}</Aviso>
      <p className="tenue nota">Contribuyentes con aportaciones en el periodo. Pulsa uno para ver e imprimir su recibo.</p>

      {!filas ? <Cargando /> : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead><tr><th>Sobre</th><th>Contribuyente</th><th className="num">Aportaciones</th><th className="num">Total</th><th /></tr></thead>
            <tbody>
              {visibles.length === 0 && <tr><td colSpan="5" className="tenue">No hay aportaciones con estos filtros.</td></tr>}
              {visibles.map((h) => (
                <tr key={h.id} className="clic" onClick={() => setRecibo(h.id)}>
                  <td>{h.sobre}</td><td>{h.nombre}</td>
                  <td className="num">{h.n}</td><td className="num">{dinero(h.total)}</td>
                  <td className="acciones"><span className="enlace">Ver recibo ›</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan="3">{visibles.length} contribuyentes</td><td className="num">{dinero(total)}</td><td /></tr></tfoot>
          </table>
        </div>
      )}
      {recibo && (
        <ReciboContribuciones hermanoId={recibo} desde={f.desde} hasta={f.hasta} grupoId={f.grupoId}
          config={config} onCerrar={() => setRecibo(null)} />
      )}
    </div>
  )
}
