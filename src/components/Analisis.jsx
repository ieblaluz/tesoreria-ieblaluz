import { useEffect, useMemo, useState } from 'react'
import { supabase, dinero, traerTodo, mensajeError } from '../supabase'
import { exportarExcel } from '../excel'
import { nombreReporte } from './Documento'
import { Aviso, Campo, Cargando } from './ui'
import MultiSelect from './MultiSelect'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const ANIO = new Date().getFullYear()
const r2 = (n) => Math.round(n * 100) / 100

function arbol(filas, niveles, d = 0, ruta = '') {
  if (d >= niveles.length) return []
  const n = niveles[d]
  const m = new Map()
  for (const f of filas) {
    const k = n.clave(f)
    if (!m.has(k)) m.set(k, { k, texto: n.texto(f), orden: n.orden ? n.orden(f) : n.texto(f), filas: [] })
    m.get(k).filas.push(f)
  }
  return [...m.values()]
    .sort((a, b) => (typeof a.orden === 'number' ? a.orden - b.orden : String(a.orden).localeCompare(String(b.orden), 'es')))
    .map((g) => {
      const meses = Array(12).fill(0)
      for (const f of g.filas) meses[f.mes - 1] += Number(f.monto)
      const id = `${ruta}/${g.k}`
      return { id, texto: g.texto, nivel: d, meses, total: meses.reduce((s, x) => s + x, 0), hijos: arbol(g.filas, niveles, d + 1, id) }
    })
}
const aplanar = (nodos, out = []) => { for (const n of nodos) { out.push(n); aplanar(n.hijos, out) } return out }

// Tabla dinámica: filas agrupadas por niveles (plegables) y meses en columnas
function TablaDinamica({ filas, niveles, profundidadInicial, titulo, meta, archivo, hoja, config }) {
  const nodos = useMemo(() => arbol(filas, niveles), [filas, niveles])
  const todos = useMemo(() => aplanar(nodos), [nodos])
  const [profundidad, setProfundidad] = useState(profundidadInicial)
  const [abiertos, setAbiertos] = useState(new Set())
  const [exportando, setExportando] = useState(false)
  const [orden, setOrden] = useState(null) // { col: 'texto' | 0..11 | 'total', dir }
  const valorCol = (n, col) => (col === 'texto' ? n.texto : col === 'total' ? n.total : n.meses[col])
  const ordenar = (lista) => {
    if (!orden) return lista
    const r = [...lista].sort((a, b) => {
      const va = valorCol(a, orden.col), vb = valorCol(b, orden.col)
      return typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es', { numeric: true })
    })
    return orden.dir === 'desc' ? r.reverse() : r
  }
  const alternarOrden = (col) => setOrden((o) => (o?.col !== col ? { col, dir: col === 'texto' ? 'asc' : 'desc' } : o.dir === (col === 'texto' ? 'asc' : 'desc') ? { col, dir: col === 'texto' ? 'desc' : 'asc' } : null))
  const flecha = (col) => (orden?.col === col ? <span className="orden-flecha">{orden.dir === 'asc' ? ' ▲' : ' ▼'}</span> : null)

  useEffect(() => {
    setAbiertos(new Set(todos.filter((n) => n.nivel < profundidad - 1).map((n) => n.id)))
  }, [profundidad, todos])

  const alternar = (id) => setAbiertos((s) => { const c = new Set(s); c.has(id) ? c.delete(id) : c.add(id); return c })
  const totMes = MESES.map((_, i) => nodos.reduce((s, n) => s + n.meses[i], 0))
  const total = totMes.reduce((s, x) => s + x, 0)

  const visibles = []
  const recorrer = (lista) => { for (const n of ordenar(lista)) { visibles.push(n); if (abiertos.has(n.id)) recorrer(n.hijos) } }
  recorrer(nodos)

  async function excel() {
    setExportando(true)
    try {
      await exportarExcel({
        titulo, hoja, archivo, meta,
        tablas: [{
          columnas: [{ t: niveles.map((n) => n.etiqueta).join(' / '), ancho: 46 }, ...MESES.map((m) => ({ t: m, tipo: 'dinero', ancho: 12 })), { t: 'Total', tipo: 'dinero' }],
          filas: [
            ...(function aplanarOrdenado(lista, out = []) { for (const n of ordenar(lista)) { out.push(n); aplanarOrdenado(n.hijos, out) } return out })(nodos).map((n) => ({ celdas: [n.texto, ...n.meses.map(r2), r2(n.total)], nivel: n.nivel, tipo: n.hijos.length ? 'grupo' : undefined })),
            { celdas: ['Suma total', ...totMes.map(r2), r2(total)], tipo: 'total' },
          ],
        }],
      }, config)
    } finally { setExportando(false) }
  }

  return (
    <>
      <div className="dinamica-barra">
        <div className="segmentos">
          {niveles.map((n, i) => (
            <button key={n.id} type="button" className={profundidad === i + 1 ? 'sel' : ''} onClick={() => setProfundidad(i + 1)}>
              {i === 0 ? n.etiqueta : `+ ${n.etiqueta}`}
            </button>
          ))}
        </div>
        <span className="tenue">Pulsa una fila con ▸ para desplegarla.</span>
        <span className="espacio" />
        <button className="btn btn-suave" onClick={excel} disabled={exportando || !nodos.length}>{exportando ? 'Generando…' : 'Descargar Excel'}</button>
      </div>
      <div className="tabla-envoltura">
        <table className="tabla dinamica">
          <thead><tr>
            <th className="ordenable" onClick={() => alternarOrden('texto')}>{niveles.map((n) => n.etiqueta).join(' / ')}{flecha('texto')}</th>
            {MESES.map((m, i) => <th key={m} className="num ordenable" onClick={() => alternarOrden(i)}>{m}{flecha(i)}</th>)}
            <th className="num ordenable" onClick={() => alternarOrden('total')}>Total{flecha('total')}</th>
          </tr></thead>
          <tbody>
            {visibles.length === 0 && <tr><td colSpan="14" className="tenue">No hay datos con estos filtros.</td></tr>}
            {visibles.map((n) => {
              const tieneHijos = n.hijos.length > 0
              return (
                <tr key={n.id} className={`din-nivel-${n.nivel}` + (tieneHijos ? ' clic' : '')} onClick={tieneHijos ? () => alternar(n.id) : undefined}>
                  <td style={{ paddingLeft: `${12 + n.nivel * 20}px` }}>
                    <span className="din-flecha">{tieneHijos ? (abiertos.has(n.id) ? '▾' : '▸') : ''}</span>{n.texto}
                  </td>
                  {n.meses.map((v, i) => <td key={i} className="num">{v ? dinero(v) : ''}</td>)}
                  <td className="num din-total">{dinero(n.total)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot><tr><td>Suma total</td>{totMes.map((v, i) => <td key={i} className="num">{v ? dinero(v) : ''}</td>)}<td className="num">{dinero(total)}</td></tr></tfoot>
        </table>
      </div>
    </>
  )
}

function useDatosAnio(vista, select, anio) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    setDatos(null)
    traerTodo(() => supabase.from(vista).select(select).gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`).order('id'))
      .then(setDatos).catch((e) => setError(mensajeError(e)))
  }, [vista, select, anio])
  return [datos, error]
}

const opcionesDe = (datos, clave, texto, orden) => {
  const m = new Map()
  for (const d of datos || []) if (!m.has(clave(d))) m.set(clave(d), { id: clave(d), etiqueta: texto(d), o: orden ? orden(d) : texto(d) })
  return [...m.values()].sort((a, b) => (typeof a.o === 'number' ? a.o - b.o : String(a.o).localeCompare(String(b.o), 'es')))
}
const SelectorAnio = ({ anio, setAnio }) => (
  <Campo etiqueta="Año">
    <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
      {Array.from({ length: ANIO - 2019 }, (_, i) => ANIO + 1 - i).map((a) => <option key={a}>{a}</option>)}
    </select>
  </Campo>
)

// ---------- Análisis de gastos: Cuenta › Subcuenta › Concepto ----------
const NIVELES_GASTOS = [
  { id: 'cuenta', etiqueta: 'Cuenta', clave: (r) => r.cuenta_id, texto: (r) => `${r.nro_cuenta} · ${r.ministerio}`, orden: (r) => r.nro_cuenta },
  { id: 'subcuenta', etiqueta: 'Subcuenta', clave: (r) => r.subcuenta_id, texto: (r) => `${r.nro_subcuenta} · ${r.subcuenta}`, orden: (r) => r.nro_subcuenta },
  { id: 'concepto', etiqueta: 'Concepto', clave: (r) => (r.concepto || '').trim().toLowerCase(), texto: (r) => r.concepto || '(Sin concepto)' },
]
export function AnalisisGastos({ config }) {
  const [anio, setAnio] = useState(ANIO)
  const [f, setF] = useState({ cuentas: [], subcuentas: [], modalidad: '' })
  const [datos, error] = useDatosAnio('v_gastos', 'id,mes,monto,modalidad,concepto,cuenta_id,nro_cuenta,ministerio,subcuenta_id,nro_subcuenta,subcuenta', anio)

  const optCuentas = useMemo(() => opcionesDe(datos, (d) => d.cuenta_id, (d) => `${d.nro_cuenta} · ${d.ministerio}`, (d) => d.nro_cuenta), [datos])
  const optSub = useMemo(() => opcionesDe((datos || []).filter((d) => !f.cuentas.length || f.cuentas.includes(d.cuenta_id)),
    (d) => d.subcuenta_id, (d) => `${d.nro_subcuenta} · ${d.subcuenta}`, (d) => d.nro_subcuenta), [datos, f.cuentas])
  const filas = useMemo(() => (datos || []).filter((d) => (!f.cuentas.length || f.cuentas.includes(d.cuenta_id))
    && (!f.subcuentas.length || f.subcuentas.includes(d.subcuenta_id)) && (!f.modalidad || d.modalidad === f.modalidad)), [datos, f])

  const meta = [['Año', String(anio)]]
  if (f.cuentas.length) meta.push(['Cuentas', optCuentas.filter((o) => f.cuentas.includes(o.id)).map((o) => o.etiqueta).join(', ')])
  if (f.subcuentas.length) meta.push(['Subcuentas', optSub.filter((o) => f.subcuentas.includes(o.id)).map((o) => o.etiqueta).join(', ')])
  if (f.modalidad) meta.push(['Modalidad', f.modalidad])

  return (
    <div className="flex-resto">
      <div className="filtros">
        <SelectorAnio anio={anio} setAnio={setAnio} />
        <Campo etiqueta="Cuentas"><MultiSelect opciones={optCuentas} seleccion={f.cuentas} onCambio={(v) => setF({ ...f, cuentas: v, subcuentas: [] })} etiquetaTodas="Todas" /></Campo>
        <Campo etiqueta="Subcuentas"><MultiSelect opciones={optSub} seleccion={f.subcuentas} onCambio={(v) => setF({ ...f, subcuentas: v })} etiquetaTodas="Todas" /></Campo>
        <Campo etiqueta="Modalidad">
          <select value={f.modalidad} onChange={(e) => setF({ ...f, modalidad: e.target.value })}><option value="">Todas</option><option>Efectivo</option><option>Banco</option></select>
        </Campo>
      </div>
      <Aviso>{error}</Aviso>
      {!datos ? <Cargando /> : (
        <TablaDinamica filas={filas} niveles={NIVELES_GASTOS} profundidadInicial={2} config={config}
          titulo="Informe de gastos" hoja={`Gastos ${anio}`} meta={meta} archivo={nombreReporte(`Informe de Gastos ${anio}`)} />
      )}
    </div>
  )
}

// ---------- Análisis de ingresos: Medio › Grupo › Hermano ----------
const NIVELES_INGRESOS = [
  { id: 'medio', etiqueta: 'Medio', clave: (r) => r.medio, texto: (r) => r.medio },
  { id: 'grupo', etiqueta: 'Grupo', clave: (r) => r.grupo_id, texto: (r) => r.grupo },
  { id: 'hermano', etiqueta: 'Hermano', clave: (r) => r.hermano_id, texto: (r) => `${r.nro_sobre} · ${r.hermano_nombre} ${r.hermano_apellidos || ''}`.trim(), orden: (r) => Number(r.nro_sobre) },
]
export function AnalisisIngresos({ config }) {
  const [anio, setAnio] = useState(ANIO)
  const [f, setF] = useState({ medio: '', grupos: [], pagadores: [] })
  const [datos, error] = useDatosAnio('v_ingresos', 'id,mes,monto,medio,grupo,grupo_id,hermano_id,nro_sobre,hermano_nombre,hermano_apellidos,pagador_id,pagador', anio)
  const optPagadores = useMemo(() => opcionesDe((datos || []).filter((d) => d.pagador_id), (d) => d.pagador_id, (d) => d.pagador), [datos])

  const optGrupos = useMemo(() => opcionesDe(datos, (d) => d.grupo_id, (d) => d.grupo), [datos])
  const filas = useMemo(() => (datos || []).filter((d) => (!f.medio || d.medio === f.medio)
    && (!f.grupos.length || f.grupos.includes(d.grupo_id))
    && (!f.pagadores.length || f.pagadores.includes(d.pagador_id))), [datos, f])

  const meta = [['Año', String(anio)]]
  if (f.medio) meta.push(['Medio', f.medio])
  if (f.grupos.length) meta.push(['Grupos', optGrupos.filter((o) => f.grupos.includes(o.id)).map((o) => o.etiqueta).join(', ')])
  if (f.pagadores.length) meta.push(['Pagado por', optPagadores.filter((o) => f.pagadores.includes(o.id)).map((o) => o.etiqueta).join(', ')])

  return (
    <div className="flex-resto">
      <div className="filtros">
        <SelectorAnio anio={anio} setAnio={setAnio} />
        <Campo etiqueta="Medio">
          <select value={f.medio} onChange={(e) => setF({ ...f, medio: e.target.value })}><option value="">Todos</option><option>Efectivo</option><option>Banco</option></select>
        </Campo>
        <Campo etiqueta="Grupos"><MultiSelect opciones={optGrupos} seleccion={f.grupos} onCambio={(v) => setF({ ...f, grupos: v })} etiquetaTodas="Todos" /></Campo>
        <Campo etiqueta="Pagado por"><MultiSelect opciones={optPagadores} seleccion={f.pagadores} onCambio={(v) => setF({ ...f, pagadores: v })} etiquetaTodas="Todos" /></Campo>
      </div>
      <Aviso>{error}</Aviso>
      {!datos ? <Cargando /> : (
        <TablaDinamica filas={filas} niveles={NIVELES_INGRESOS} profundidadInicial={2} config={config}
          titulo="Informe de ingresos" hoja={`Ingresos ${anio}`} meta={meta} archivo={nombreReporte(`Informe de Ingresos ${anio}`)} />
      )}
    </div>
  )
}
