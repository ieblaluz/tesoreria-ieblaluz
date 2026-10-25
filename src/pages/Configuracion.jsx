import { useState } from 'react'
import { supabase, mensajeError } from '../supabase'
import { Aviso, Campo } from '../components/ui'

const MONEDAS = [['EUR', 'Euro (€)'], ['USD', 'Dólar ($)']]

export default function Configuracion({ config, recargarConfig }) {
  const [form, setForm] = useState({
    nombre_iglesia: config?.nombre_iglesia || '', nombre_app: config?.nombre_app || '',
    color_primario: config?.color_primario || '#1F3A5F', moneda: config?.moneda || 'EUR',
    contador_borra_mismo_dia: config?.contador_borra_mismo_dia ?? true,
  })
  const [msg, setMsg] = useState(null)
  const [subiendo, setSubiendo] = useState(false)

  async function guardar(e) {
    e.preventDefault()
    const { error } = await supabase.from('configuracion')
      .update({ ...form, actualizado_en: new Date().toISOString() }).eq('id', 1)
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    await recargarConfig()
    setMsg({ t: 'ok', m: 'Configuración guardada.' })
  }

  async function subirLogo(e) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    if (!archivo.type.startsWith('image/')) return setMsg({ t: 'error', m: 'El logo debe ser una imagen (PNG, JPG, SVG).' })
    if (archivo.size > 2 * 1024 * 1024) return setMsg({ t: 'error', m: 'El logo no puede pasar de 2 MB.' })
    setSubiendo(true)
    const ext = archivo.name.split('.').pop().toLowerCase()
    const ruta = `logo-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('marca').upload(ruta, archivo, { contentType: archivo.type })
    if (error) { setSubiendo(false); return setMsg({ t: 'error', m: mensajeError(error) }) }
    const { data } = supabase.storage.from('marca').getPublicUrl(ruta)
    const { error: e2 } = await supabase.from('configuracion').update({ logo_url: data.publicUrl }).eq('id', 1)
    setSubiendo(false)
    if (e2) return setMsg({ t: 'error', m: mensajeError(e2) })
    await recargarConfig()
    setMsg({ t: 'ok', m: 'Logo actualizado.' })
  }

  async function quitarLogo() {
    await supabase.from('configuracion').update({ logo_url: null }).eq('id', 1)
    await recargarConfig()
  }

  return (
    <section className="pagina estrecha">
      <h1>Configuración</h1>
      <Aviso tipo={msg?.t} onCerrar={() => setMsg(null)}>{msg?.m}</Aviso>

      <div className="panel">
        <h2>Logo</h2>
        <div className="logo-config">
          <img src={config?.logo_url || '/icon-192.png'} alt="Logo actual" />
          <div>
            <label className="btn btn-suave">
              {subiendo ? 'Subiendo…' : 'Cambiar logo'}
              <input type="file" accept="image/*" hidden onChange={subirLogo} disabled={subiendo} />
            </label>
            {config?.logo_url && <button className="btn-texto" onClick={quitarLogo}>Usar el icono por defecto</button>}
            <p className="tenue">Se muestra en el menú y en la pantalla de entrada. Mejor cuadrado y en PNG.</p>
          </div>
        </div>
      </div>

      <form className="panel formulario" onSubmit={guardar}>
        <h2 className="campo-completo">General</h2>
        <Campo etiqueta="Nombre de la iglesia" ancho="completo">
          <input required value={form.nombre_iglesia} onChange={(e) => setForm({ ...form, nombre_iglesia: e.target.value })} />
        </Campo>
        <Campo etiqueta="Nombre de la app">
          <input required value={form.nombre_app} onChange={(e) => setForm({ ...form, nombre_app: e.target.value })} />
        </Campo>
        <Campo etiqueta="Moneda">
          <select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })}>
            {MONEDAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Color principal">
          <div className="color-fila">
            <input type="color" value={form.color_primario} onChange={(e) => setForm({ ...form, color_primario: e.target.value })} />
            <code>{form.color_primario}</code>
          </div>
        </Campo>
        <label className="check campo-completo">
          <input type="checkbox" checked={form.contador_borra_mismo_dia}
            onChange={(e) => setForm({ ...form, contador_borra_mismo_dia: e.target.checked })} />
          Los contadores pueden borrar los ingresos que registraron hoy (para corregir errores al momento)
        </label>
        <div className="botonera"><span className="espacio" /><button className="btn btn-primario">Guardar configuración</button></div>
      </form>
    </section>
  )
}
