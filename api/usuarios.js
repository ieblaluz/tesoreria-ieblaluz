// Función de servidor (Vercel): gestión de usuarios. Solo la puede usar un tesorero activo.
import { createClient } from '@supabase/supabase-js'

const DOMINIO = 'tesoreria.example.com'
const PARA_SIEMPRE = '876000h' // 100 años

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

  const url = process.env.VITE_SUPABASE_URL
  const secreta = process.env.SUPABASE_SECRET_KEY
  if (!url || !secreta) return res.status(500).json({ error: 'Falta configurar SUPABASE_SECRET_KEY en Vercel.' })

  const admin = createClient(url, secreta, { auth: { persistSession: false, autoRefreshToken: false } })

  // ¿Quién llama?
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const { data: quien, error: errUser } = await admin.auth.getUser(token)
  if (errUser || !quien?.user) return res.status(401).json({ error: 'Sesión no válida. Vuelve a entrar.' })
  const { data: yo } = await admin.from('perfiles').select('rol,activo,roles(es_admin)').eq('id', quien.user.id).maybeSingle()
  if (!yo || !yo.activo || !yo.roles?.es_admin) return res.status(403).json({ error: 'Solo el administrador puede gestionar usuarios.' })

  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})

  try {
    if (b.accion === 'crear') {
      const usuario = String(b.usuario || '').trim().toLowerCase()
      const nombre = String(b.nombre || '').trim()
      if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) return res.status(400).json({ error: 'El usuario debe tener 3 a 30 caracteres: letras, números, punto, guion.' })
      if (!nombre) return res.status(400).json({ error: 'Escribe el nombre completo.' })
      if (String(b.clave || '').length < 6) return res.status(400).json({ error: 'La clave debe tener al menos 6 caracteres.' })
      const { data: existe } = await admin.from('perfiles').select('id').eq('usuario', usuario).maybeSingle()
      if (existe) return res.status(400).json({ error: `El usuario "${usuario}" ya existe.` })

      const { data, error } = await admin.auth.admin.createUser({
        email: `${usuario}@${DOMINIO}`, password: b.clave, email_confirm: true, user_metadata: { nombre },
      })
      if (error) throw error
      const { data: rolValido } = await admin.from('roles').select('id').eq('id', b.rol || 'contador').maybeSingle()
      const rol = rolValido?.id || 'contador'
      // Opcional: vincularlo a la lista de contadores (reutiliza uno con el mismo nombre)
      let contador_id = null
      if (b.crear_contador) {
        const { data: existente } = await admin.from('contadores').select('id').ilike('nombre', nombre).limit(1)
        if (existente?.length) contador_id = existente[0].id
        else {
          const { data: nuevoC, error: e3 } = await admin.from('contadores').insert({ nombre }).select('id').single()
          if (e3) throw e3
          contador_id = nuevoC.id
        }
      }
      const { error: e2 } = await admin.from('perfiles').update({
        nombre, usuario, rol, ver_historial: !!b.ver_historial, contador_id,
      }).eq('id', data.user.id)
      if (e2) throw e2
      return res.json({ ok: true })
    }

    if (b.accion === 'clave') {
      if (String(b.clave || '').length < 6) return res.status(400).json({ error: 'La clave debe tener al menos 6 caracteres.' })
      const { error } = await admin.auth.admin.updateUserById(b.id, { password: b.clave })
      if (error) throw error
      return res.json({ ok: true })
    }

    if (b.accion === 'activo') {
      if (b.id === quien.user.id) return res.status(400).json({ error: 'No puedes desactivarte a ti mismo.' })
      const { error } = await admin.auth.admin.updateUserById(b.id, { ban_duration: b.activo ? 'none' : PARA_SIEMPRE })
      if (error) throw error
      const { error: e2 } = await admin.from('perfiles').update({ activo: !!b.activo }).eq('id', b.id)
      if (e2) throw e2
      return res.json({ ok: true })
    }

    return res.status(400).json({ error: 'Acción desconocida.' })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error inesperado.' })
  }
}
