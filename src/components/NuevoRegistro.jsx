import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { CATALOGOS, Formulario } from '../pages/Catalogos'

// Rellena el formulario con lo que el usuario ya había escrito en la búsqueda
function inicialDesde(catalogo, texto, extra) {
  const t = (texto || '').trim()
  const base = { ...extra }
  if (!t) return base
  if (catalogo === 'hermanos') return /^\d+$/.test(t) ? { ...base, nro_sobre: Number(t) } : { ...base, nombre: t }
  if (catalogo === 'cuentas') return /^\d+$/.test(t) ? { ...base, nro: Number(t) } : { ...base, ministerio: t }
  if (catalogo === 'subcuentas') return /^\d+$/.test(t) ? { ...base, nro: Number(t) } : { ...base, nombre: t }
  return { ...base, nombre: t }
}

// Alta rápida de un elemento de catálogo desde cualquier lista de búsqueda.
// onCreado(fila) recibe el registro ya guardado para seleccionarlo.
export default function NuevoRegistro({ catalogo, texto, extra, onCreado, onCerrar }) {
  const def = CATALOGOS.find((c) => c.id === catalogo)
  const [refs, setRefs] = useState({})
  useEffect(() => {
    def.campos.filter((c) => c.t === 'ref').forEach((c) =>
      supabase.from(c.ref).select('*').order('nro').then(({ data }) => setRefs((r) => ({ ...r, [c.ref]: data || [] }))))
  }, [def])
  return (
    <Formulario def={def} inicial={inicialDesde(catalogo, texto, extra)} refs={refs}
      onCerrar={onCerrar} onGuardado={(_m, fila) => { onCreado(fila); onCerrar() }} />
  )
}
