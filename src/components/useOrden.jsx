import { useMemo, useState } from 'react'

const comparar = (a, b) => {
  const va = a ?? '', vb = b ?? ''
  if (va === '' && vb !== '') return 1
  if (vb === '' && va !== '') return -1
  const na = typeof va === 'number' ? va : Number(va), nb = typeof vb === 'number' ? vb : Number(vb)
  if (va !== '' && vb !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
  return String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' })
}

// Ordenar una tabla pulsando su cabecera: 1.er clic ascendente, 2.º descendente, 3.º sin ordenar.
// valores: { clave: (fila) => valor } para columnas calculadas; si no, se usa fila[clave].
export default function useOrden(filas, valores = {}) {
  const [orden, setOrden] = useState(null)
  const ordenadas = useMemo(() => {
    if (!orden || !filas) return filas
    const v = valores[orden.clave] || ((f) => f[orden.clave])
    const r = [...filas].sort((a, b) => comparar(v(a), v(b)))
    return orden.dir === 'desc' ? r.reverse() : r
  }, [filas, orden]) // eslint-disable-line

  const alternar = (clave) => setOrden((o) => (o?.clave !== clave ? { clave, dir: 'asc' } : o.dir === 'asc' ? { clave, dir: 'desc' } : null))

  // th(clave, etiqueta, className): cabecera clicable
  const th = (clave, etiqueta, className = '') => (
    <th key={clave} className={className + ' ordenable'} onClick={() => alternar(clave)}
      aria-sort={orden?.clave === clave ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      {etiqueta}<span className="orden-flecha">{orden?.clave === clave ? (orden.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
    </th>
  )
  return [ordenadas, th]
}
