import { useEffect, useState } from 'react'
import { supabase, hoy, primerDiaMes, fmtFecha, traerTodo, dinero, mensajeError } from '../supabase'
import { Aviso, Campo, Cargando } from '../components/ui'
import useOrden from '../components/useOrden'
import { exportarExcel } from '../excel'
import MultiSelect from '../components/MultiSelect'
import SeccionReporte from '../components/SeccionReporte'
import { nombreReporte, Documento, TablasModelo, VistaDocumento, Firmas } from '../components/Documento'

// ---------- utilidades comunes ----------
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const ANIO = new Date().getFullYear()
const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => d.toLocaleDateString('sv-SE')
const suma = (arr) => arr.reduce((s, x) => s + Number(x || 0), 0)
const r2 = (n) => Math.round(n * 100) / 100

const ingresosDe = (desde, hasta) => traerTodo(() => supabase.from('v_ingresos')
  .select('id,fecha,mes,anio,medio,monto,grupo,grupo_id,hermano_id,nro_sobre,hermano_nombre,hermano_apellidos')
  .gte('fecha', desde).lte('fecha', hasta).order('id'))

const gastosDe = (desde, hasta) => traerTodo(() => supabase.from('v_gastos')
  .select('id,fecha,mes,trimestre,modalidad,monto,factura,concepto,subcuenta_id,nro_subcuenta,subcuenta,nro_cuenta,ministerio,proveedor_id,proveedor,cif_nie')
  .gte('fecha', desde).lte('fecha', hasta).order('id'))

function SelectorAnio({ valor, onCambio, etiqueta = 'Año' }) {
  const anios = []
  for (let a = ANIO + 1; a >= 2020; a--) anios.push(a)
  return (
    <Campo etiqueta={etiqueta}>
      <select value={valor} onChange={(e) => onCambio(Number(e.target.value))}>
        {anios.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
    </Campo>
  )
}

// Grupos (todos por defecto) y opción de incluir el sobre 0 (saldo inicial)
function useGrupos() {
  const [grupos, setGrupos] = useState([])
  useEffect(() => {
    supabase.from('grupos_ingreso').select('id,nombre').order('nombre').then(({ data }) => setGrupos(data || []))
  }, [])
  return grupos
}
function useHermanos() {
  const [hermanos, setHermanos] = useState([])
  useEffect(() => {
    supabase.from('hermanos').select('id,nro_sobre,nombre,apellidos').order('nro_sobre').then(({ data }) => setHermanos(data || []))
  }, [])
  return hermanos
}
function FiltroIngresos({ grupos, f, setF }) {
  const hermanos = useHermanos()
  return (
    <>
      <Campo etiqueta="Sobres / hermanos">
        <MultiSelect opciones={hermanos.map((h) => ({ id: h.id, etiqueta: `${h.nro_sobre} · ${h.nombre} ${h.apellidos || ''}`.trim() }))}
          seleccion={f.sobres || []} onCambio={(v) => setF({ ...f, sobres: v })} etiquetaTodas="Todos los sobres" />
      </Campo>
      <Campo etiqueta="Grupos">
        <MultiSelect opciones={grupos.map((g) => ({ id: g.id, etiqueta: g.nombre }))} seleccion={f.grupos}
          onCambio={(v) => setF({ ...f, grupos: v })} etiquetaTodas="Todos los grupos" />
      </Campo>
      <label className="check campo-check">
        <input type="checkbox" checked={f.cero} onChange={(e) => setF({ ...f, cero: e.target.checked })} />
        Incluir sobre 0 (saldo inicial)
      </label>
    </>
  )
}
const filtrarIngresos = (filas, f) => filas.filter((x) =>
  (f.cero || Number(x.nro_sobre) !== 0) && (!f.grupos.length || f.grupos.includes(x.grupo_id))
  && (!f.sobres?.length || f.sobres.includes(x.hermano_id)))
const metaSobres = (f) => (f.sobres?.length ? [['Sobres', `${f.sobres.length} seleccionados`]] : [])
const textoGrupos = (f, grupos) => (f.grupos.length
  ? grupos.filter((g) => f.grupos.includes(g.id)).map((g) => g.nombre).join(', ')
  : 'Todos')

// ---------- Informe de ingresos y egresos ----------
export function InformeIngresosEgresos({ config }) {
  const [f, setF] = useState({ desde: primerDiaMes(), hasta: hoy() })
  const mesAnterior = () => {
    const d = new Date()
    setF({ desde: iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), hasta: iso(new Date(d.getFullYear(), d.getMonth(), 0)) })
  }

  async function construir() {
    if (f.desde > f.hasta) throw new Error('La fecha «desde» no puede ser posterior a «hasta».')
    const [{ data: res, error }, ing, gas] = await Promise.all([
      supabase.rpc('resumen_periodo', { p_desde: f.desde, p_hasta: f.hasta }), ingresosDe(f.desde, f.hasta), gastosDe(f.desde, f.hasta)])
    if (error) throw error

    const agrupar = (filas, campoMedio, medio, etiqueta) => {
      const m = new Map()
      for (const x of filas.filter((y) => y[campoMedio] === medio)) m.set(etiqueta(x), (m.get(etiqueta(x)) || 0) + Number(x.monto))
      return [...m.entries()].sort((a, b) => b[1] - a[1])
    }
    const tabla = (subtitulo, cabecera, pares, textoTotal) => ({
      subtitulo, vacio: 'Sin movimientos.', lado: true,
      columnas: [{ t: cabecera, ancho: 30 }, { t: 'Importe', tipo: 'dinero' }],
      filas: [...pares.map(([k, v]) => ({ celdas: [k, r2(v)] })), { celdas: [textoTotal, r2(suma(pares.map((p) => p[1])))], tipo: 'subtotal' }],
    })
    const totalFila = (texto, v) => ({ sinCabecera: true, columnas: [{ t: '', ancho: 44 }, { t: '', tipo: 'dinero' }], filas: [{ celdas: [texto, r2(v)], tipo: 'total' }] })

    const ie = agrupar(ing, 'medio', 'Efectivo', (x) => x.grupo)
    const ib = agrupar(ing, 'medio', 'Banco', (x) => x.grupo)
    const ge = agrupar(gas, 'modalidad', 'Efectivo', (x) => x.subcuenta)
    const gb = agrupar(gas, 'modalidad', 'Banco', (x) => x.subcuenta)
    const tIng = Number(res.ingresos), tGas = Number(res.gastos), inicial = Number(res.saldo_anterior)

    return {
      titulo: 'Informe de ingresos y egresos', hoja: 'Ingresos y egresos',
      archivo: nombreReporte('Informe de Ingresos y Egresos', f.desde, f.hasta),
      meta: [['Fecha inicial', fmtFecha(f.desde)], ['Fecha final', fmtFecha(f.hasta)]],
      tablas: [
        tabla('Ingresos en efectivo', 'Grupo', ie, 'Total ingresos en efectivo'),
        tabla('Ingresos en banco', 'Grupo', ib, 'Total ingresos en banco'),
        totalFila('Total ingresos (efectivo + banco)', tIng),
        tabla('Gastos en efectivo', 'Subcuenta', ge, 'Total gastos en efectivo'),
        tabla('Gastos en banco', 'Subcuenta', gb, 'Total gastos en banco'),
        totalFila('Total gastos (efectivo + banco)', tGas),
        {
          subtitulo: 'Resumen', sinCabecera: true, estrecha: true, columnas: [{ t: '', ancho: 44 }, { t: '', tipo: 'dinero' }],
          filas: [
            { celdas: ['Saldo al inicio del periodo', r2(inicial)] },
            { celdas: ['Total ingresos', r2(tIng)] },
            { celdas: ['Total gastos', r2(-tGas)] },
            { celdas: ['Resultado del periodo (ingresos − gastos)', r2(tIng - tGas)], tipo: 'subtotal' },
            { celdas: ['Saldo al final del periodo', r2(inicial + tIng - tGas)], tipo: 'total' },
          ],
        },
      ],
    }
  }

  return (
    <SeccionReporte construir={construir} config={config}>
      <Campo etiqueta="Desde"><input type="date" required value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></Campo>
      <Campo etiqueta="Hasta"><input type="date" required value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></Campo>
      <div className="atajos campo-check">
        <button type="button" className="btn btn-suave" onClick={() => setF({ desde: primerDiaMes(), hasta: hoy() })}>Este mes</button>
        <button type="button" className="btn btn-suave" onClick={mesAnterior}>Mes anterior</button>
      </div>
    </SeccionReporte>
  )
}

// ---------- Ingresos mensuales (por sobre y domingo, sin nombres) ----------
export function IngresosMensuales({ config }) {
  const grupos = useGrupos()
  const hoyD = new Date()
  const [f, setF] = useState({ anio: hoyD.getFullYear(), mes: hoyD.getMonth() + 1, grupos: [], cero: false, entreSemana: 'siguiente' })

  async function construir() {
    const ultimo = new Date(f.anio, f.mes, 0).getDate()
    const desde = `${f.anio}-${pad(f.mes)}-01`, hasta = `${f.anio}-${pad(f.mes)}-${pad(ultimo)}`
    const domingos = []
    for (let d = 1; d <= ultimo; d++) if (new Date(f.anio, f.mes - 1, d).getDay() === 0) domingos.push(iso(new Date(f.anio, f.mes - 1, d)))

    const asignar = (fecha) => {
      const dt = new Date(fecha + 'T12:00:00')
      const dow = dt.getDay()
      if (dow !== 0) dt.setDate(dt.getDate() + (f.entreSemana === 'siguiente' ? 7 - dow : -dow))
      const k = iso(dt)
      if (k < domingos[0]) return 0
      if (k > domingos[domingos.length - 1]) return domingos.length - 1
      return domingos.indexOf(k)
    }

    const ing = filtrarIngresos(await ingresosDe(desde, hasta), f)
    const m = new Map()
    for (const x of ing) {
      const s = Number(x.nro_sobre)
      if (!m.has(s)) m.set(s, domingos.map(() => 0))
      m.get(s)[asignar(x.fecha)] += Number(x.monto)
    }
    const sobres = [...m.keys()].sort((a, b) => a - b)
    const totCol = domingos.map((_, i) => suma(sobres.map((s) => m.get(s)[i])))

    return {
      titulo: 'Ingresos mensuales', hoja: `${MESES_LARGOS[f.mes - 1]} ${f.anio}`,
      archivo: nombreReporte(`Ingresos Mensuales ${MESES_LARGOS[f.mes - 1]}`, desde),
      meta: [['Mes', `${MESES_LARGOS[f.mes - 1]} ${f.anio}`], ['Grupos', textoGrupos(f, grupos)], ...metaSobres(f)],
      tablas: [{
        columnas: [{ t: 'Sobre', tipo: 'texto', ancho: 9 },
          ...domingos.map((d, i) => ({ t: `Semana ${i + 1}\n${fmtFecha(d)}`, tipo: 'dinero' })), { t: 'Total', tipo: 'dinero' }],
        vacio: 'No hay ingresos en este mes.',
        filas: [
          ...sobres.map((s) => ({ celdas: [String(s), ...m.get(s).map(r2), r2(suma(m.get(s)))] })),
          { celdas: ['Totales', ...totCol.map(r2), r2(suma(totCol))], tipo: 'total' },
        ],
      }],
    }
  }

  return (
    <SeccionReporte construir={construir} config={config}
      nota="Solo se muestra el número de sobre, sin nombres, para poder publicarlo. Los ingresos entre semana se suman al domingo elegido.">
      <SelectorAnio valor={f.anio} onCambio={(v) => setF({ ...f, anio: v })} />
      <Campo etiqueta="Mes">
        <select value={f.mes} onChange={(e) => setF({ ...f, mes: Number(e.target.value) })}>
          {MESES_LARGOS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Ingresos entre semana">
        <select value={f.entreSemana} onChange={(e) => setF({ ...f, entreSemana: e.target.value })}>
          <option value="siguiente">Al domingo siguiente</option>
          <option value="anterior">Al domingo anterior</option>
        </select>
      </Campo>
      <FiltroIngresos grupos={grupos} f={f} setF={setF} />
    </SeccionReporte>
  )
}

// ---------- Ingresos anuales (por hermano y mes) ----------
export function IngresosAnuales({ config }) {
  const grupos = useGrupos()
  const [f, setF] = useState({ anio: ANIO, grupos: [], cero: false })

  async function construir() {
    const ing = filtrarIngresos(await ingresosDe(`${f.anio}-01-01`, `${f.anio}-12-31`), f)
    const m = new Map()
    for (const x of ing) {
      if (!m.has(x.hermano_id)) m.set(x.hermano_id, { sobre: Number(x.nro_sobre), nombre: x.hermano_nombre, apellidos: x.hermano_apellidos || '', meses: Array(12).fill(0) })
      m.get(x.hermano_id).meses[x.mes - 1] += Number(x.monto)
    }
    const filas = [...m.values()].sort((a, b) => a.sobre - b.sobre)
    const totMes = MESES.map((_, i) => suma(filas.map((h) => h.meses[i])))
    return {
      titulo: 'Ingresos anuales', hoja: `Ingresos ${f.anio}`, horizontal: true, compacto: true,
      archivo: nombreReporte(`Ingresos Anuales ${f.anio}`),
      meta: [['Año', String(f.anio)], ['Grupos', textoGrupos(f, grupos)], ...metaSobres(f)],
      tablas: [{
        columnas: [{ t: 'Sobre', ancho: 8 }, { t: 'Nombre', ancho: 18 }, { t: 'Apellidos', ancho: 22 },
          ...MESES.map((n) => ({ t: n, tipo: 'dinero', ancho: 11 })), { t: 'Total', tipo: 'dinero' }],
        vacio: 'No hay ingresos en este año.',
        filas: [
          ...filas.map((h) => ({ celdas: [String(h.sobre), h.nombre, h.apellidos, ...h.meses.map(r2), r2(suma(h.meses))] })),
          { celdas: ['Totales', '', '', ...totMes.map(r2), r2(suma(totMes))], tipo: 'total' },
        ],
      }],
    }
  }

  return (
    <SeccionReporte construir={construir} config={config}>
      <SelectorAnio valor={f.anio} onCambio={(v) => setF({ ...f, anio: v })} />
      <FiltroIngresos grupos={grupos} f={f} setF={setF} />
    </SeccionReporte>
  )
}

// ---------- Ingresos de los últimos 3 años ----------
export function IngresosTresAnios({ config }) {
  const grupos = useGrupos()
  const [f, setF] = useState({ anio: ANIO, grupos: [], cero: false })

  async function construir() {
    const anios = [f.anio, f.anio - 1, f.anio - 2]
    const [ingTodos, { data: hs, error }] = await Promise.all([
      ingresosDe(`${f.anio - 2}-01-01`, `${f.anio}-12-31`), supabase.from('hermanos').select('id,dni_nie')])
    if (error) throw error
    const dni = new Map((hs || []).map((h) => [h.id, h.dni_nie || '']))
    const ing = filtrarIngresos(ingTodos, f)
    const m = new Map()
    for (const x of ing) {
      if (!m.has(x.hermano_id)) m.set(x.hermano_id, { sobre: Number(x.nro_sobre), nombre: `${x.hermano_nombre} ${x.hermano_apellidos || ''}`.trim(), dni: dni.get(x.hermano_id) || '', anios: [0, 0, 0] })
      m.get(x.hermano_id).anios[anios.indexOf(Number(x.anio))] += Number(x.monto)
    }
    const filas = [...m.values()].sort((a, b) => a.sobre - b.sobre)
    const tot = [0, 1, 2].map((i) => suma(filas.map((h) => h.anios[i])))
    return {
      titulo: 'Ingresos de los últimos 3 años', hoja: `Ingresos ${anios[2]}-${anios[0]}`,
      archivo: nombreReporte(`Ingresos 3 Años ${anios[2]}-${anios[0]}`),
      meta: [['Años', `${anios[2]} – ${anios[0]}`], ['Grupos', textoGrupos(f, grupos)], ...metaSobres(f)],
      tablas: [{
        columnas: [{ t: 'Sobre', ancho: 8 }, { t: 'Hermano', ancho: 34 }, { t: 'DNI/NIE', ancho: 16 },
          ...anios.map((a) => ({ t: String(a), tipo: 'dinero' })), { t: 'Total', tipo: 'dinero' }],
        vacio: 'No hay ingresos en estos años.',
        filas: [
          ...filas.map((h) => ({ celdas: [String(h.sobre), h.nombre, h.dni, ...h.anios.map(r2), r2(suma(h.anios))] })),
          { celdas: ['Totales', '', '', ...tot.map(r2), r2(suma(tot))], tipo: 'total' },
        ],
      }],
    }
  }

  return (
    <SeccionReporte construir={construir} config={config}>
      <SelectorAnio etiqueta="Hasta el año" valor={f.anio} onCambio={(v) => setF({ ...f, anio: v })} />
      <FiltroIngresos grupos={grupos} f={f} setF={setF} />
    </SeccionReporte>
  )
}

// ---------- Proveedores trimestral ----------
function useCatalogo(tabla, columnas, orden) {
  const [filas, setFilas] = useState([])
  useEffect(() => { supabase.from(tabla).select(columnas).order(orden).then(({ data }) => setFilas(data || [])) }, [tabla, columnas, orden])
  return filas
}
const TRIM = ['I', 'II', 'III', 'IV']

export function ProveedoresTrimestral({ config }) {
  const proveedores = useCatalogo('proveedores', 'id,nombre,cif_nie', 'nombre')
  const [f, setF] = useState({ anio: ANIO, proveedores: [], min: '', max: '', trimestres: [] })

  async function construir() {
    const gas = (await gastosDe(`${f.anio}-01-01`, `${f.anio}-12-31`)).filter((x) => x.proveedor_id)
    const m = new Map()
    for (const x of gas) {
      if (!m.has(x.proveedor_id)) m.set(x.proveedor_id, { id: x.proveedor_id, cif: x.cif_nie || '', nombre: x.proveedor, t: [0, 0, 0, 0] })
      m.get(x.proveedor_id).t[x.trimestre - 1] += Number(x.monto)
    }
    const min = f.min === '' ? null : Number(String(f.min).replace(',', '.'))
    const max = f.max === '' ? null : Number(String(f.max).replace(',', '.'))
    const filas = [...m.values()]
      .filter((p) => !f.proveedores.length || f.proveedores.includes(p.id))
      .filter((p) => { const t = suma(p.t); return (min == null || t >= min) && (max == null || t <= max) })
      .filter((p) => f.trimestres.every((i) => p.t[i] > 0))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    const tot = [0, 1, 2, 3].map((i) => suma(filas.map((p) => p.t[i])))
    const meta = [['Año', String(f.anio)]]
    if (f.proveedores.length) meta.push(['Proveedores', `${f.proveedores.length} seleccionados`])
    if (min != null || max != null) meta.push(['Total entre', `${min ?? 0} € y ${max ?? '…'} €`])
    if (f.trimestres.length) meta.push(['Con gasto en', f.trimestres.map((i) => `${TRIM[i]} trim.`).join(', ')])
    return {
      titulo: 'Proveedores trimestral', hoja: `Proveedores ${f.anio}`, horizontal: true,
      archivo: nombreReporte(`Proveedores Trimestral ${f.anio}`),
      meta,
      tablas: [{
        columnas: [{ t: 'CIF/NIE', ancho: 14 }, { t: 'Proveedor', ancho: 42 },
          { t: 'I trimestre', tipo: 'dinero' }, { t: 'II trimestre', tipo: 'dinero' }, { t: 'III trimestre', tipo: 'dinero' },
          { t: 'IV trimestre', tipo: 'dinero' }, { t: 'Total', tipo: 'dinero' }],
        vacio: 'No hay proveedores con estos filtros.',
        filas: [
          ...filas.map((p) => ({ celdas: [p.cif, p.nombre, ...p.t.map(r2), r2(suma(p.t))] })),
          { celdas: ['Totales', '', ...tot.map(r2), r2(suma(tot))], tipo: 'total' },
        ],
      }],
    }
  }

  const alternarTrim = (i) => setF({ ...f, trimestres: f.trimestres.includes(i) ? f.trimestres.filter((x) => x !== i) : [...f.trimestres, i].sort() })
  return (
    <SeccionReporte construir={construir} config={config} nota="Incluye solo los gastos que tienen proveedor asignado. El rango de montos se aplica al total del año.">
      <SelectorAnio valor={f.anio} onCambio={(v) => setF({ ...f, anio: v })} />
      <Campo etiqueta="Proveedores (nombre o CIF/NIE)">
        <MultiSelect opciones={proveedores.map((p) => ({ id: p.id, etiqueta: `${p.nombre}${p.cif_nie ? ' · ' + p.cif_nie : ''}` }))}
          seleccion={f.proveedores} onCambio={(v) => setF({ ...f, proveedores: v })} etiquetaTodas="Todos" />
      </Campo>
      <Campo etiqueta="Total desde (€)"><input inputMode="decimal" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} placeholder="0" /></Campo>
      <Campo etiqueta="Total hasta (€)"><input inputMode="decimal" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} placeholder="Sin límite" /></Campo>
      <div className="campo">
        <span className="campo-etiqueta">Con gasto en el trimestre</span>
        <div className="segmentos">
          {TRIM.map((t, i) => <button key={t} type="button" className={f.trimestres.includes(i) ? 'sel' : ''} onClick={() => alternarTrim(i)}>{t}</button>)}
        </div>
      </div>
    </SeccionReporte>
  )
}

// ---------- Reporte individual de proveedor ----------
export function ReporteProveedor({ config }) {
  const inicio = `${ANIO}-01-01`
  const [f, setF] = useState({ desde: inicio, hasta: hoy(), texto: '' })
  const [filas, setFilas] = useState(null)
  const [modelo, setModelo] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!f.desde || !f.hasta || f.desde > f.hasta) return
    setFilas(null)
    gastosDe(f.desde, f.hasta).then((gas) => {
      const m = new Map()
      for (const x of gas.filter((g) => g.proveedor_id)) {
        if (!m.has(x.proveedor_id)) m.set(x.proveedor_id, { id: x.proveedor_id, nombre: x.proveedor, cif: x.cif_nie || '', n: 0, total: 0, gastos: [] })
        const p = m.get(x.proveedor_id); p.n += 1; p.total += Number(x.monto); p.gastos.push(x)
      }
      setFilas([...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))); setError('')
    }).catch((e) => setError(mensajeError(e)))
  }, [f.desde, f.hasta])

  const visibles = (filas || []).filter((p) => !f.texto.trim() || `${p.nombre} ${p.cif}`.toLowerCase().includes(f.texto.trim().toLowerCase()))
  const [ordenadas, th] = useOrden(visibles)

  function abrir(p) {
    const gastos = [...p.gastos].sort((a, b) => a.fecha.localeCompare(b.fecha))
    const porSub = new Map()
    for (const g of gastos) {
      const k = `${g.nro_cuenta} · ${g.ministerio} → ${g.nro_subcuenta} · ${g.subcuenta}`
      porSub.set(k, (porSub.get(k) || 0) + Number(g.monto))
    }
    setModelo({
      titulo: 'Reporte individual de proveedor', hoja: 'Proveedor',
      archivo: nombreReporte(`Proveedor - ${p.nombre}`, f.desde, f.hasta),
      meta: [['Proveedor', p.nombre], ['CIF/NIE', p.cif || '—'], ['Periodo', `${fmtFecha(f.desde)} – ${fmtFecha(f.hasta)}`]],
      tablas: [
        {
          columnas: [{ t: 'Fecha', ancho: 11 }, { t: 'Factura', ancho: 14 }, { t: 'Cuenta / subcuenta', ancho: 34 }, { t: 'Concepto', ancho: 34 },
            { t: 'Modalidad', ancho: 10 }, { t: 'Importe', tipo: 'dinero' }],
          filas: [
            ...gastos.map((g) => ({ celdas: [fmtFecha(g.fecha), g.factura || '', `${g.nro_subcuenta} · ${g.subcuenta}`, g.concepto || '', g.modalidad, r2(Number(g.monto))] })),
            { celdas: [`Total (${gastos.length} ${gastos.length === 1 ? 'gasto' : 'gastos'})`, '', '', '', '', r2(p.total)], tipo: 'total' },
          ],
        },
        {
          subtitulo: 'Resumen por cuenta y subcuenta', estrecha: true,
          columnas: [{ t: 'Cuenta → subcuenta', ancho: 46 }, { t: 'Importe', tipo: 'dinero' }],
          filas: [...[...porSub.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ celdas: [k, r2(v)] }))],
        },
      ],
    })
  }

  return (
    <div className="flex-resto">
      <div className="filtros">
        <Campo etiqueta="Desde"><input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></Campo>
        <Campo etiqueta="Hasta"><input type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></Campo>
        <Campo etiqueta="Buscar"><input value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} placeholder="Proveedor o CIF/NIE…" /></Campo>
      </div>
      <Aviso>{f.desde > f.hasta ? 'La fecha «desde» no puede ser posterior a «hasta».' : error}</Aviso>
      <p className="tenue nota">Proveedores con gastos en el periodo. Pulsa uno para ver su reporte con el detalle y las cuentas relacionadas.</p>
      {!filas ? <Cargando /> : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead><tr>{th('cif', 'CIF/NIE')}{th('nombre', 'Proveedor')}{th('n', 'Gastos', 'num')}{th('total', 'Total', 'num')}<th /></tr></thead>
            <tbody>
              {ordenadas.length === 0 && <tr><td colSpan="5" className="tenue">No hay gastos con proveedor en este periodo.</td></tr>}
              {ordenadas.map((p) => (
                <tr key={p.id} className="clic" onClick={() => abrir(p)}>
                  <td>{p.cif}</td><td>{p.nombre}</td><td className="num">{p.n}</td><td className="num">{dinero(p.total)}</td>
                  <td className="acciones"><span className="enlace">Ver reporte ›</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan="3">{ordenadas.length} proveedores</td><td className="num">{dinero(suma(ordenadas.map((p) => p.total)))}</td><td /></tr></tfoot>
          </table>
        </div>
      )}
      {modelo && (
        <VistaDocumento titulo={modelo.titulo} archivo={modelo.archivo} listo onCerrar={() => setModelo(null)} onExcel={() => exportarExcel(modelo, config)}>
          <Documento config={config} titulo={modelo.titulo} meta={modelo.meta}>
            <TablasModelo modelo={modelo} />
            <Firmas firmantes={[{ nombre: config?.tesorero_nombre, rol: 'Tesorero(a)' }]} />
          </Documento>
        </VistaDocumento>
      )}
    </div>
  )
}

// ---------- Presupuesto anual ----------
export function PresupuestoAnual({ config }) {
  const cuentas = useCatalogo('cuentas', 'id,nro,ministerio', 'nro')
  const subcuentas = useCatalogo('subcuentas', 'id,nro,nombre,cuenta_id', 'nro')
  const [f, setF] = useState({ anio: ANIO, cuentas: [], subcuentas: [] })
  const anio = f.anio

  async function construir() {
    const [{ data: pres, error }, gas] = await Promise.all([
      supabase.from('v_presupuesto').select('subcuenta_id,monto,nro_cuenta,ministerio,nro_subcuenta,subcuenta').eq('anio', anio),
      gastosDe(`${anio}-01-01`, `${anio}-12-31`)])
    if (error) throw error
    const m = new Map()
    const fila = (x) => {
      if (!m.has(x.subcuenta_id)) m.set(x.subcuenta_id, { cta: x.nro_cuenta, ministerio: x.ministerio, sub: x.nro_subcuenta, nombre: x.subcuenta, meses: Array(12).fill(0), pre: 0 })
      return m.get(x.subcuenta_id)
    }
    for (const p of pres || []) fila(p).pre += Number(p.monto)
    for (const g of gas) fila(g).meses[g.mes - 1] += Number(g.monto)
    const ctasSel = cuentas.filter((c) => f.cuentas.includes(c.id)).map((c) => c.nro)
    const subSel = subcuentas.filter((x) => f.subcuentas.includes(x.id)).map((x) => x.nro)
    const filas = [...m.values()]
      .filter((x) => (!ctasSel.length || ctasSel.includes(x.cta)) && (!subSel.length || subSel.includes(x.sub)))
      .sort((a, b) => a.cta - b.cta || a.sub - b.sub)
    const totMes = MESES.map((_, i) => suma(filas.map((x) => x.meses[i])))
    const totG = suma(totMes), totP = suma(filas.map((x) => x.pre))
    return {
      titulo: 'Presupuesto anual', hoja: `Presupuesto ${anio}`, horizontal: true, compacto: true,
      archivo: nombreReporte(`Presupuesto ${anio}`),
      meta: [['Año', String(anio)], ...(ctasSel.length ? [['Cuentas', ctasSel.join(', ')]] : []), ...(subSel.length ? [['Subcuentas', subSel.join(', ')]] : [])],
      tablas: [{
        columnas: [{ t: 'Cta', ancho: 6 }, { t: 'Ministerio', ancho: 26 }, { t: 'Subcta', ancho: 7 }, { t: 'Subcuenta', ancho: 30 },
          ...MESES.map((n) => ({ t: n, tipo: 'dinero', ancho: 11 })),
          { t: 'Total gastos', tipo: 'dinero' }, { t: 'Presupuesto', tipo: 'dinero' }, { t: 'Saldo', tipo: 'dinero' }],
        vacio: 'No hay presupuesto ni gastos en este año.',
        filas: [
          ...filas.map((x) => {
            const g = suma(x.meses)
            return { celdas: [String(x.cta), x.ministerio, String(x.sub), x.nombre, ...x.meses.map(r2), r2(g), r2(x.pre), r2(x.pre - g)] }
          }),
          { celdas: ['Totales', '', '', '', ...totMes.map(r2), r2(totG), r2(totP), r2(totP - totG)], tipo: 'total' },
        ],
      }],
    }
  }

  return (
    <SeccionReporte construir={construir} config={config} nota="Saldo = presupuesto − gastos. Un saldo negativo indica que se superó lo presupuestado.">
      <SelectorAnio valor={anio} onCambio={(v) => setF({ ...f, anio: v })} />
      <Campo etiqueta="Cuentas">
        <MultiSelect opciones={cuentas.map((c) => ({ id: c.id, etiqueta: `${c.nro} · ${c.ministerio}` }))} seleccion={f.cuentas}
          onCambio={(v) => setF({ ...f, cuentas: v, subcuentas: [] })} etiquetaTodas="Todas" />
      </Campo>
      <Campo etiqueta="Subcuentas">
        <MultiSelect opciones={subcuentas.filter((x) => !f.cuentas.length || f.cuentas.includes(x.cuenta_id)).map((x) => ({ id: x.id, etiqueta: `${x.nro} · ${x.nombre}` }))}
          seleccion={f.subcuentas} onCambio={(v) => setF({ ...f, subcuentas: v })} etiquetaTodas="Todas" />
      </Campo>
    </SeccionReporte>
  )
}
