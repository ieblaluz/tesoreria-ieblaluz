import { useEffect, useState } from 'react'
import { supabase, mensajeError } from '../supabase'
import { Aviso, Campo } from '../components/ui'

const MONEDAS = [['EUR', 'Euro (€)'], ['USD', 'Dólar ($)']]
const FONDOS = [['#FFFFFF', 'Blanco'], ['primario', 'Color principal'], ['transparente', 'Transparente']]

// Convierte una imagen en un icono cuadrado PNG del tamaño pedido, centrado y con margen
async function crearIcono(archivo, lado, fondo) {
  const img = await createImageBitmap(archivo)
  const c = document.createElement('canvas')
  c.width = c.height = lado
  const ctx = c.getContext('2d')
  if (fondo !== 'transparente') { ctx.fillStyle = fondo; ctx.fillRect(0, 0, lado, lado) }
  const util = lado * 0.8 // margen de seguridad para iconos redondeados
  const escala = Math.min(util / img.width, util / img.height)
  const w = img.width * escala, h = img.height * escala
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h)
  return new Promise((ok) => c.toBlob(ok, 'image/png'))
}

async function subir(blob, nombre, tipo) {
  const ruta = `${nombre}-${Date.now()}.${tipo === 'image/png' ? 'png' : (nombre.split('.').pop() || 'png')}`
  const { error } = await supabase.storage.from('marca').upload(ruta, blob, { contentType: tipo })
  if (error) throw error
  return supabase.storage.from('marca').getPublicUrl(ruta).data.publicUrl
}

function validarImagen(archivo) {
  if (!archivo.type.startsWith('image/')) return 'El archivo debe ser una imagen (PNG, JPG, SVG o WEBP).'
  if (archivo.size > 3 * 1024 * 1024) return 'La imagen no puede pasar de 3 MB.'
  return ''
}

export default function Configuracion({ config, recargarConfig }) {
  const [form, setForm] = useState({
    nombre_iglesia: config?.nombre_iglesia || '', nombre_app: config?.nombre_app || '',
    color_primario: config?.color_primario || '#1F3A5F', moneda: config?.moneda || 'EUR',
    contador_borra_mismo_dia: config?.contador_borra_mismo_dia ?? true,
    tesorero_nombre: config?.tesorero_nombre || '',
    logo_reporte_alto: config?.logo_reporte_alto || 60,
    reporte_mostrar_nombre: config?.reporte_mostrar_nombre ?? true,
  })
  const [fondoIcono, setFondoIcono] = useState('#FFFFFF')
  const [tesoreros, setTesoreros] = useState([])
  const [msg, setMsg] = useState(null)
  const [subiendo, setSubiendo] = useState('')

  useEffect(() => {
    supabase.from('perfiles').select('nombre').eq('rol', 'tesorero').eq('activo', true).order('nombre')
      .then(({ data }) => setTesoreros(data || []))
  }, [])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function guardar(e) {
    e?.preventDefault()
    const datos = { ...form, logo_reporte_alto: Number(form.logo_reporte_alto), tesorero_nombre: form.tesorero_nombre.trim() || null,
      actualizado_en: new Date().toISOString() }
    const { error } = await supabase.from('configuracion').update(datos).eq('id', 1)
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    await recargarConfig()
    setMsg({ t: 'ok', m: 'Configuración guardada.' })
  }

  async function subirIcono(e) {
    const archivo = e.target.files?.[0]; e.target.value = ''
    if (!archivo) return
    const err = validarImagen(archivo); if (err) return setMsg({ t: 'error', m: err })
    setSubiendo('icono')
    try {
      const fondo = fondoIcono === 'primario' ? form.color_primario : fondoIcono
      const [b192, b512] = await Promise.all([crearIcono(archivo, 192, fondo), crearIcono(archivo, 512, fondo)])
      const [u192, u512] = await Promise.all([subir(b192, 'icono-192', 'image/png'), subir(b512, 'icono-512', 'image/png')])
      const { error } = await supabase.from('configuracion').update({ icono_192_url: u192, icono_512_url: u512 }).eq('id', 1)
      if (error) throw error
      await recargarConfig()
      setMsg({ t: 'ok', m: 'Icono de la app actualizado.' })
    } catch (er) { setMsg({ t: 'error', m: mensajeError(er) }) }
    setSubiendo('')
  }

  async function subirLogoReporte(e) {
    const archivo = e.target.files?.[0]; e.target.value = ''
    if (!archivo) return
    const err = validarImagen(archivo); if (err) return setMsg({ t: 'error', m: err })
    setSubiendo('reporte')
    try {
      const ext = archivo.name.split('.').pop().toLowerCase()
      const ruta = `logo-reporte-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('marca').upload(ruta, archivo, { contentType: archivo.type })
      if (error) throw error
      const url = supabase.storage.from('marca').getPublicUrl(ruta).data.publicUrl
      const { error: e2 } = await supabase.from('configuracion').update({ logo_reporte_url: url }).eq('id', 1)
      if (e2) throw e2
      await recargarConfig()
      setMsg({ t: 'ok', m: 'Logo de los reportes actualizado.' })
    } catch (er) { setMsg({ t: 'error', m: mensajeError(er) }) }
    setSubiendo('')
  }

  async function quitar(campos, texto) {
    const { error } = await supabase.from('configuracion').update(campos).eq('id', 1)
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    await recargarConfig(); setMsg({ t: 'ok', m: texto })
  }

  return (
    <section className="pagina estrecha">
      <h1>Configuración</h1>
      <Aviso tipo={msg?.t} onCerrar={() => setMsg(null)}>{msg?.m}</Aviso>

      <div className="panel">
        <h2>Icono de la app</h2>
        <p className="tenue">Se usa en el menú, la pantalla de entrada, la pestaña del navegador y al instalar la app en el móvil u ordenador. Mejor una imagen cuadrada y sencilla, como el símbolo sin texto.</p>
        <div className="logo-config">
          <img className="icono-muestra" src={config?.icono_192_url || '/icon-192.png'} alt="Icono actual" />
          <div className="logo-acciones">
            <Campo etiqueta="Fondo del icono">
              <select value={fondoIcono} onChange={(e) => setFondoIcono(e.target.value)}>
                {FONDOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Campo>
            <div>
              <label className="btn btn-suave">
                {subiendo === 'icono' ? 'Subiendo…' : 'Subir icono'}
                <input type="file" accept="image/*" hidden onChange={subirIcono} disabled={!!subiendo} />
              </label>
              {config?.icono_192_url && (
                <button className="btn-texto" onClick={() => quitar({ icono_192_url: null, icono_512_url: null }, 'Se usa el icono por defecto.')}>
                  Usar el icono por defecto
                </button>
              )}
            </div>
          </div>
        </div>
        <p className="tenue nota">Si la app ya estaba instalada, puede tardar en mostrar el icono nuevo; si no cambia, desinstálala y vuelve a instalarla.</p>
      </div>

      <div className="panel">
        <h2>Logo de los reportes</h2>
        <p className="tenue">Aparece en la cabecera de los reportes impresos. Puede ser horizontal, con el nombre incluido.</p>
        <div className="logo-acciones fila">
          <label className="btn btn-suave">
            {subiendo === 'reporte' ? 'Subiendo…' : config?.logo_reporte_url ? 'Cambiar logo' : 'Subir logo'}
            <input type="file" accept="image/*" hidden onChange={subirLogoReporte} disabled={!!subiendo} />
          </label>
          {config?.logo_reporte_url && (
            <button className="btn-texto" onClick={() => quitar({ logo_reporte_url: null }, 'Logo de los reportes quitado.')}>Quitar logo</button>
          )}
        </div>
        <div className="formulario ajuste-logo">
          <Campo etiqueta={`Tamaño del logo: ${form.logo_reporte_alto} px de alto`}>
            <input type="range" min="24" max="140" step="2" value={form.logo_reporte_alto} onChange={set('logo_reporte_alto')} />
          </Campo>
          <label className="check">
            <input type="checkbox" checked={form.reporte_mostrar_nombre} onChange={set('reporte_mostrar_nombre')} />
            Mostrar el nombre de la iglesia junto al logo
          </label>
        </div>
        <div className="vista-fondo vista-mini">
          <div className="vista-hoja">
            <div className="doc">
              <header className="doc-cab">
                <div className="doc-entidad">
                  {config?.logo_reporte_url && <img className="doc-logo" src={config.logo_reporte_url} alt="" style={{ height: `${form.logo_reporte_alto}px` }} />}
                  {form.reporte_mostrar_nombre && (
                    <div><div className="doc-iglesia">{form.nombre_iglesia}</div><div className="doc-area">{form.nombre_app}</div></div>
                  )}
                </div>
                <dl className="doc-meta"><div><dt>Fecha</dt><dd>18/10/2026</dd></div><div><dt>Turno</dt><dd>Mañana</dd></div></dl>
              </header>
            </div>
          </div>
        </div>
        <p className="tenue nota">Así se verá la cabecera. Pulsa «Guardar configuración» para aplicar el tamaño.</p>
      </div>

      <form className="panel formulario" onSubmit={guardar}>
        <h2 className="campo-completo">General</h2>
        <Campo etiqueta="Nombre de la iglesia" ancho="completo">
          <input required value={form.nombre_iglesia} onChange={set('nombre_iglesia')} />
        </Campo>
        <Campo etiqueta="Nombre de la app">
          <input required value={form.nombre_app} onChange={set('nombre_app')} />
        </Campo>
        <Campo etiqueta="Moneda">
          <select value={form.moneda} onChange={set('moneda')}>
            {MONEDAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Tesorero(a) que firma los reportes" ayuda="Elige de la lista o escribe el nombre." ancho="completo">
          <input list="lista-tesoreros" value={form.tesorero_nombre} onChange={set('tesorero_nombre')} />
          <datalist id="lista-tesoreros">{tesoreros.map((t) => <option key={t.nombre} value={t.nombre} />)}</datalist>
        </Campo>
        <Campo etiqueta="Color principal">
          <div className="color-fila">
            <input type="color" value={form.color_primario} onChange={set('color_primario')} />
            <code>{form.color_primario}</code>
          </div>
        </Campo>
        <label className="check campo-completo">
          <input type="checkbox" checked={form.contador_borra_mismo_dia} onChange={set('contador_borra_mismo_dia')} />
          Los contadores pueden borrar los ingresos que registraron hoy (para corregir errores al momento)
        </label>
        <div className="botonera"><span className="espacio" /><button className="btn btn-primario">Guardar configuración</button></div>
      </form>
    </section>
  )
}
