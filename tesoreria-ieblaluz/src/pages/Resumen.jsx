import { useCallback, useEffect, useState } from 'react'
import { supabase, dinero, hoy, primerDiaMes, mensajeError } from '../supabase'
import { Aviso, Cargando } from '../components/ui'

function Barras({ titulo, filas, vacio }) {
  const max = Math.max(1, ...filas.map((f) => Number(f.total)))
  return (
    <div className="panel">
      <h2>{titulo}</h2>
      {filas.length === 0 && <p className="tenue">{vacio}</p>}
      <ul className="barras">
        {filas.map((f) => (
          <li key={f.nombre}>
            <span className="barra-nombre">{f.nro ? `${f.nro} · ` : ''}{f.nombre}</span>
            <span className="barra-pista"><span style={{ width: `${(Number(f.total) / max) * 100}%` }} /></span>
            <span className="barra-valor">{dinero(f.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Resumen() {
  const [desde, setDesde] = useState(primerDiaMes())
  const [hasta, setHasta] = useState(hoy())
  const [r, setR] = useState(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    if (!desde || !hasta) return
    const { data, error: e } = await supabase.rpc('resumen_periodo', { p_desde: desde, p_hasta: hasta })
    if (e) return setError(mensajeError(e))
    setError(''); setR(data)
  }, [desde, hasta])
  useEffect(() => { cargar() }, [cargar])

  const atajo = (tipo) => {
    const d = new Date()
    const f = (x) => x.toLocaleDateString('sv-SE')
    if (tipo === 'mes') { setDesde(primerDiaMes()); setHasta(hoy()) }
    if (tipo === 'anterior') {
      setDesde(f(new Date(d.getFullYear(), d.getMonth() - 1, 1)))
      setHasta(f(new Date(d.getFullYear(), d.getMonth(), 0)))
    }
    if (tipo === 'anio') { setDesde(`${d.getFullYear()}-01-01`); setHasta(hoy()) }
  }

  const finPeriodo = r ? Number(r.saldo_anterior) + Number(r.ingresos) - Number(r.gastos) : 0

  return (
    <section className="pagina">
      <h1>Resumen</h1>
      <div className="filtros">
        <label className="campo"><span className="campo-etiqueta">Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label className="campo"><span className="campo-etiqueta">Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        <div className="atajos">
          <button className="btn btn-suave" onClick={() => atajo('mes')}>Este mes</button>
          <button className="btn btn-suave" onClick={() => atajo('anterior')}>Mes anterior</button>
          <button className="btn btn-suave" onClick={() => atajo('anio')}>Este año</button>
        </div>
      </div>
      <Aviso>{error}</Aviso>
      {!r ? <Cargando /> : (
        <>
          <div className="saldo-linea">
            <div><span>Saldo anterior</span><strong>{dinero(r.saldo_anterior)}</strong></div>
            <div className="op">+</div>
            <div><span>Ingresos</span><strong className="pos">{dinero(r.ingresos)}</strong></div>
            <div className="op">−</div>
            <div><span>Gastos</span><strong className="neg">{dinero(r.gastos)}</strong></div>
            <div className="op">=</div>
            <div className="saldo-final"><span>Saldo al final del periodo</span><strong>{dinero(finPeriodo)}</strong></div>
          </div>
          <div className="saldos-hoy">
            <div><span>Saldo total hoy</span><strong>{dinero(r.saldo_actual)}</strong></div>
            <div><span>En efectivo</span><strong>{dinero(r.saldo_efectivo)}</strong></div>
            <div><span>En banco</span><strong>{dinero(r.saldo_banco)}</strong></div>
          </div>
          <div className="rejilla-2">
            <Barras titulo="Ingresos por grupo" filas={r.por_grupo} vacio="Sin ingresos en este periodo." />
            <Barras titulo="Gastos por cuenta" filas={r.por_cuenta} vacio="Sin gastos en este periodo." />
          </div>
        </>
      )}
    </section>
  )
}
