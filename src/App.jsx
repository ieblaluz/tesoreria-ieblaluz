import { useCallback, useEffect, useState } from 'react'
import { supabase, setMoneda } from './supabase'
import { Cargando } from './components/ui'
import Login from './pages/Login'
import Caja from './pages/Caja'
import Resumen from './pages/Resumen'
import Ingresos from './pages/Ingresos'
import Gastos from './pages/Gastos'
import Presupuesto from './pages/Presupuesto'
import Catalogos from './pages/Catalogos'
import Usuarios from './pages/Usuarios'
import Configuracion from './pages/Configuracion'
import Perfil from './pages/Perfil'
import Reportes from './pages/Reportes'
import Movimientos from './pages/Movimientos'

const TODOS = ['tesorero', 'contador']
const MENU = [
  { id: 'resumen', label: 'Resumen', roles: ['tesorero'], C: Resumen },
  { id: 'caja', label: 'Registrar ingresos', roles: TODOS, C: Caja },
  { id: 'ingresos', label: 'Ingresos', roles: ['tesorero'], C: Ingresos },
  { id: 'gastos', label: 'Gastos', roles: ['tesorero'], C: Gastos },
  { id: 'movimientos', label: 'Caja y banco', roles: ['tesorero'], C: Movimientos },
  { id: 'presupuesto', label: 'Presupuesto', roles: ['tesorero'], C: Presupuesto },
  { id: 'reportes', label: 'Reportes', roles: TODOS, C: Reportes },
  { id: 'catalogos', label: 'Catálogos', roles: ['tesorero'], C: Catalogos, separador: true },
  { id: 'usuarios', label: 'Usuarios', roles: ['tesorero'], C: Usuarios },
  { id: 'configuracion', label: 'Configuración', roles: ['tesorero'], C: Configuracion },
  { id: 'perfil', label: 'Mi perfil', roles: TODOS, C: Perfil, separador: true },
]

export default function App() {
  const [sesion, setSesion] = useState(undefined)
  const [perfil, setPerfil] = useState(null)
  const [config, setConfig] = useState(null)
  const [pagina, setPagina] = useState(null)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [avisoLogin, setAvisoLogin] = useState('')

  const cargarConfig = useCallback(async () => {
    const { data } = await supabase.from('configuracion').select('*').eq('id', 1).maybeSingle()
    if (!data) return
    setConfig(data)
    setMoneda(data.moneda)
    document.documentElement.style.setProperty('--primario', data.color_primario || '#1F3A5F')
    document.title = `${data.nombre_app} · ${data.nombre_iglesia}`
    const icono = data.icono_192_url || '/icon-192.png'
    document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((l) => { l.href = icono })
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', data.color_primario || '#1F3A5F')
  }, [])

  useEffect(() => {
    cargarConfig()
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s))
    return () => subscription.unsubscribe()
  }, [cargarConfig])

  const uid = sesion?.user?.id
  useEffect(() => {
    if (!uid) { setPerfil(null); setPagina(null); return }
    supabase.from('perfiles').select('*').eq('id', uid).maybeSingle().then(({ data }) => {
      if (!data || !data.activo) {
        setAvisoLogin('Tu usuario está desactivado. Habla con el tesorero.')
        supabase.auth.signOut()
        return
      }
      setPerfil(data)
      setPagina((p) => p || (data.rol === 'tesorero' ? 'resumen' : 'caja'))
    })
  }, [uid])

  if (sesion === undefined) return <Cargando />
  if (!sesion) return <Login config={config} aviso={avisoLogin} limpiarAviso={() => setAvisoLogin('')} />
  if (!perfil) return <Cargando />

  const menu = MENU.filter((m) => m.roles.includes(perfil.rol))
  const actual = menu.find((m) => m.id === pagina) || menu[0]
  const Pagina = actual.C
  const ir = (id) => { setPagina(id); setMenuAbierto(false); window.scrollTo(0, 0) }

  return (
    <div className="marco">
      <header className="barra-movil">
        <button className="btn-icono claro" onClick={() => setMenuAbierto(true)} aria-label="Abrir menú">☰</button>
        <span>{actual.label}</span>
      </header>

      <aside className={'lateral' + (menuAbierto ? ' abierto' : '')}>
        <div className="marca">
          <img src={config?.icono_192_url || '/icon-192.png'} alt="" />
          <div>
            <strong>{config?.nombre_app || 'Tesorería'}</strong>
            <small>{config?.nombre_iglesia}</small>
          </div>
        </div>
        <nav>
          {menu.map((m) => (
            <div key={m.id}>
              {m.separador && <hr />}
              <button className={'nav-item' + (m.id === actual.id ? ' activo' : '')} onClick={() => ir(m.id)}>
                {m.label}
              </button>
            </div>
          ))}
        </nav>
        <div className="usuario-actual">
          <span>{perfil.nombre}</span>
          <small>{perfil.rol === 'tesorero' ? 'Tesorero' : 'Contador'}</small>
          <button className="btn-texto claro" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
        </div>
      </aside>
      {menuAbierto && <div className="velo" onClick={() => setMenuAbierto(false)} />}

      <main className="contenido">
        <Pagina perfil={perfil} config={config} recargarConfig={cargarConfig} ir={ir}
          esTesorero={perfil.rol === 'tesorero'} />
      </main>
    </div>
  )
}
