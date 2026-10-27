import { useEffect, useState } from 'react'
import { supabase, hoy, primerDiaMes, fmtFecha, traerTodo } from '../supabase'
import { Campo } from '../components/ui'
import MultiSelect from '../components/MultiSelect'
import SeccionReporte from '../components/SeccionReporte'
import { nombreReporte } from '../components/Documento'

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
  .select('id,fecha,mes,trimestre,modalidad,monto,subcuenta_id,nro_subcuenta,subcuenta,nro_cuenta,ministerio,proveedor_id,proveedor,cif_nie')
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
function FiltroIngresos({ grupos, f, setF }) {
  return (
    <>
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
  (f.cero || Number(x.nro_sobre) !== 0) && (!f.grupos.length || f.grupos.includes(x.grupo_id)))
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
      subtitulo, vacio: 'Sin movimientos.',
      columnas: [{ t: cabecera, ancho: 44 }, { t: 'Importe', tipo: 'dinero' }],
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
          subtitulo: 'Resumen', sinCabecera: true, columnas: [{ t: '', ancho: 44 }, { t: '', tipo: 'dinero' }],
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
      meta: [['Mes', `${MESES_LARGOS[f.mes - 1]} ${f.anio}`], ['Grupos', textoGrupos(f, grupos)]],
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
      meta: [['Año', String(f.anio)], ['Grupos', textoGrupos(f, grupos)]],
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
      meta: [['Años', `${anios[2]} – ${anios[0]}`], ['Grupos', textoGrupos(f, grupos)]],
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
export function ProveedoresTrimestral({ config }) {
  const [anio, setAnio] = useState(ANIO)

  async function construir() {
    const gas = (await gastosDe(`${anio}-01-01`, `${anio}-12-31`)).filter((x) => x.proveedor_id)
    const m = new Map()
    for (const x of gas) {
      if (!m.has(x.proveedor_id)) m.set(x.proveedor_id, { cif: x.cif_nie || '', nombre: x.proveedor, t: [0, 0, 0, 0] })
      m.get(x.proveedor_id).t[x.trimestre - 1] += Number(x.monto)
    }
    const filas = [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    const tot = [0, 1, 2, 3].map((i) => suma(filas.map((p) => p.t[i])))
    return {
      titulo: 'Proveedores trimestral', hoja: `Proveedores ${anio}`, horizontal: true,
      archivo: nombreReporte(`Proveedores Trimestral ${anio}`),
      meta: [['Año', String(anio)]],
      tablas: [{
        columnas: [{ t: 'CIF/NIE', ancho: 14 }, { t: 'Proveedor', ancho: 42 },
          { t: 'I trimestre', tipo: 'dinero' }, { t: 'II trimestre', tipo: 'dinero' }, { t: 'III trimestre', tipo: 'dinero' },
          { t: 'IV trimestre', tipo: 'dinero' }, { t: 'Total', tipo: 'dinero' }],
        vacio: 'No hay gastos con proveedor en este año.',
        filas: [
          ...filas.map((p) => ({ celdas: [p.cif, p.nombre, ...p.t.map(r2), r2(suma(p.t))] })),
          { celdas: ['Totales', '', ...tot.map(r2), r2(suma(tot))], tipo: 'total' },
        ],
      }],
    }
  }

  return (
    <SeccionReporte construir={construir} config={config} nota="Incluye solo los gastos que tienen proveedor asignado.">
      <SelectorAnio valor={anio} onCambio={setAnio} />
    </SeccionReporte>
  )
}

// ---------- Presupuesto anual ----------
export function PresupuestoAnual({ config }) {
  const [anio, setAnio] = useState(ANIO)

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
    const filas = [...m.values()].sort((a, b) => a.cta - b.cta || a.sub - b.sub)
    const totMes = MESES.map((_, i) => suma(filas.map((x) => x.meses[i])))
    const totG = suma(totMes), totP = suma(filas.map((x) => x.pre))
    return {
      titulo: 'Presupuesto anual', hoja: `Presupuesto ${anio}`, horizontal: true, compacto: true,
      archivo: nombreReporte(`Presupuesto ${anio}`),
      meta: [['Año', String(anio)]],
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
      <SelectorAnio valor={anio} onCambio={setAnio} />
    </SeccionReporte>
  )
}
