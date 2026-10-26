// Manifiesto de la app instalable, con el nombre, color e icono de Configuración
export default async function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_KEY
  let c = {}
  try {
    const r = await fetch(`${url}/rest/v1/configuracion?id=eq.1&select=nombre_app,nombre_iglesia,color_primario,icono_192_url,icono_512_url`,
      { headers: { apikey: key } })
    const filas = await r.json()
    if (Array.isArray(filas) && filas[0]) c = filas[0]
  } catch { /* se usan los valores por defecto */ }

  const i192 = c.icono_192_url || '/icon-192.png'
  const i512 = c.icono_512_url || '/icon-512.png'
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300')
  res.status(200).send(JSON.stringify({
    name: `${c.nombre_app || 'Tesorería'} · ${c.nombre_iglesia || 'IEB La Luz'}`,
    short_name: c.nombre_app || 'Tesorería',
    start_url: '/',
    display: 'standalone',
    background_color: '#F6F7F9',
    theme_color: c.color_primario || '#1F3A5F',
    lang: 'es',
    icons: [
      { src: i192, sizes: '192x192', type: 'image/png' },
      { src: i512, sizes: '512x512', type: 'image/png' },
      { src: i512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }))
}
