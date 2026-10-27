import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, setMoneda } from './supabase'
import { Cargando } from './components/ui'
import Icono from './components/Iconos'
import Login from './pages/Login'
import Inicio from './pages/Inicio'
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
const T = ['tesorero']
// barra: aparece en la barra superior · admin: en el menú de usuario · movil: pestaña inferior en el móvil
const MENU = [
  { id: 'inicio', label: 'Inicio', icono: 'inicio', roles: TODOS, C: Inicio, barra: true, movil: true },
  { id: 'resumen', label: 'Resumen', icono: 'resumen', roles: T, C: Resumen, barra: true, grupo: 'Control', desc: 'Saldos del periodo e ingresos y gastos de un vistazo' },
  { id: 'caja', label: 'Registrar ingresos', corto: 'Registrar', icono: 'caja', roles: TODOS, C: Caja, barra: true, movil: true, grupo: 'Operaciones', desc: 'Caja del culto: sobres, montos y contadores' },
  { id: 'ingresos', label: 'Ingresos', icono: 'ingresos', roles: T, C: Ingresos, barra: true, movil: true, grupo: 'Operaciones', desc: 'Registros y análisis de los ingresos' },
  { id: 'gastos', label: 'Gastos', icono: 'gastos', roles: T, C: Gastos, barra: true, movil: true, grupo: 'Operaciones', desc: 'Registros y análisis de los gastos' },
  { id: 'movimientos', label: 'Caja y banco', icono: 'movimientos', roles: T, C: Movimientos, barra: true, grupo: 'Operaciones', desc: 'Depósitos y reintegros entre efectivo y banco' },
  { id: 'presupuesto', label: 'Presupuesto', icono: 'presupuesto', roles: T, C: Presupuesto, barra: true, grupo: 'Control', desc: 'Presupuestado frente a ejecutado por subcuenta' },
  { id: 'reportes', label: 'Reportes', icono: 'reportes', roles: TODOS, C: Reportes, barra: true, grupo: 'Control', desc: 'Tablón, recibos, informes y exportación a Excel' },
  { id: 'catalogos', label: 'Catálogos', icono: 'catalogos', roles: T, C: Catalogos, barra: true, grupo: 'Administración', desc: 'Hermanos, proveedores, cuentas y más' },
  { id: 'usuarios', label: 'Usuarios', icono: 'usuarios', roles: T, C: Usuarios, admin: true, grupo: 'Administración', desc: 'Accesos, roles y claves' },
  { id: 'configuracion', label: 'Configuración', icono: 'configuracion', roles: T, C: Configuracion, admin: true, grupo: 'Administración', desc: 'Logos, colores, firmas y opciones' },
  { id: 'perfil', label: 'Mi perfil', icono: 'perfil', roles: TODOS, C: Perfil, admin: true, grupo: 'Mi cuenta', desc: 'Tus datos y cambio de clave' },
]

// La ruta vive en el #: "#reportes/recibos" → pagina "reportes", sub "recibos"
const leerRuta = () => {
  const [pagina = 'inicio', sub = null] = decodeURIComponent(window.location.hash.slice(1)).split('/')
  return { pagina: pagina || 'inicio', sub }
}

export default function App() {
  const [sesion, setSesion] = useState(undefined)
  const [perfil, setPerfil] = useState(null)
  const [config, setConfig] = useState(null)
  const [ruta, setRuta] = useState(leerRuta)
  const [masAbierto, setMasAbierto] = useState(false)
  const [usuarioAbierto, setUsuarioAbierto] = useState(false)
  const [avisoLogin, setAvisoLogin] = useState('')
  const refUsuario = useRef(null)

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

  // Botón "atrás" del navegador o del móvil: vuelve a la pantalla anterior
  useEffect(() => {
    const alVolver = () => { setRuta(leerRuta()); setMasAbierto(false); setUsuarioAbierto(false) }
    window.addEventListener('popstate', alVolver)
    return () => window.removeEventListener('popstate', alVolver)
  }, [])

  useEffect(() => {
    if (!usuarioAbierto) return
    const fuera = (e) => { if (!refUsuario.current?.contains(e.target)) setUsuarioAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [usuarioAbierto])

  const uid = sesion?.user?.id
  useEffect(() => {
    if (!uid) { setPerfil(null); return }
    supabase.from('perfiles').select('*').eq('id', uid).maybeSingle().then(({ data }) => {
      if (!data || !data.activo) {
        setAvisoLogin('Tu usuario está desactivado. Habla con el tesorero.')
        supabase.auth.signOut()
        return
      }
      setPerfil(data)
    })
  }, [uid])

  const ir = useCallback((pagina, sub = null) => {
    const destino = '#' + pagina + (sub ? '/' + sub : '')
    setMasAbierto(false); setUsuarioAbierto(false)
    if (window.history.state?.hoja) window.history.replaceState(null, '', destino)
    else if (window.location.hash !== destino) window.history.pushState(null, '', destino)
    setRuta({ pagina, sub })
    window.scrollTo(0, 0)
  }, [])

  if (sesion === undefined) return <Cargando />
  if (!sesion) return <Login config={config} aviso={avisoLogin} limpiarAviso={() => setAvisoLogin('')} />
  if (!perfil) return <Cargando />

  const esTesorero = perfil.rol === 'tesorero'
  const menu = MENU.filter((m) => m.roles.includes(perfil.rol))
  const actual = menu.find((m) => m.id === ruta.pagina) || menu[0]
  const Pagina = actual.C
  const enBarra = menu.filter((m) => m.barra)
  const enAdmin = menu.filter((m) => m.admin)
  const pestanas = menu.filter((m) => m.movil)
  // La hoja "Más" también se cierra con el botón atrás del móvil
  const abrirHoja = () => { window.history.pushState({ hoja: true }, '', window.location.href); setMasAbierto(true) }
  const cerrarHoja = () => { if (window.history.state?.hoja) window.history.back(); else setMasAbierto(false) }
  const salir = () => { window.history.replaceState(null, '', '#inicio'); supabase.auth.signOut() }
  const logo = config?.icono_192_url || '/icon-192.png'

  return (
    <div className="marco">
      <header className="barra-superior">
        <button className="marca" onClick={() => ir('inicio')} aria-label="Ir al inicio">
          <img src={logo} alt="" />
          <span><strong>{config?.nombre_app || 'Tesorería'}</strong><small>{config?.nombre_iglesia}</small></span>
        </button>
        <nav className="nav-superior" aria-label="Módulos">
          {enBarra.map((m) => (
            <button key={m.id} className={'nav-item' + (m.id === actual.id ? ' activo' : '')} onClick={() => ir(m.id)} title={m.label}>
              <Icono nombre={m.icono} tam={19} /><span>{m.corto || m.label}</span>
            </button>
          ))}
        </nav>
        <div className="usuario-menu" ref={refUsuario}>
          <button className={'usuario-boton' + (enAdmin.some((m) => m.id === actual.id) ? ' activo' : '')} onClick={() => setUsuarioAbierto(!usuarioAbierto)} aria-expanded={usuarioAbierto}>
            <span className="avatar">{(perfil.nombre || '?').charAt(0).toUpperCase()}</span>
            <span className="usuario-nombre">{perfil.nombre}<small>{esTesorero ? 'Tesorero' : 'Contador'}</small></span>
          </button>
          {usuarioAbierto && (
            <div className="usuario-panel">
              {enAdmin.map((m) => (
                <button key={m.id} onClick={() => ir(m.id)}><Icono nombre={m.icono} tam={18} />{m.label}</button>
              ))}
              <hr />
              <button onClick={salir}><Icono nombre="salir" tam={18} />Cerrar sesión</button>
            </div>
          )}
        </div>
        <span className="titulo-movil">{actual.id === 'inicio' ? (config?.nombre_app || 'Tesorería') : actual.label}</span>
      </header>

      <main className="contenido">
        <Pagina perfil={perfil} config={config} recargarConfig={cargarConfig} ir={ir} sub={ruta.sub}
          menu={menu} esTesorero={esTesorero} />
      </main>

      <nav className="barra-inferior" aria-label="Navegación">
        {pestanas.map((m) => (
          <button key={m.id} className={m.id === actual.id ? 'activo' : ''} onClick={() => ir(m.id)}>
            <Icono nombre={m.icono} tam={23} /><span>{m.corto || m.label}</span>
          </button>
        ))}
        <button className={masAbierto ? 'activo' : ''} onClick={() => (masAbierto ? cerrarHoja() : abrirHoja())}>
          <Icono nombre="mas" tam={23} /><span>Más</span>
        </button>
      </nav>

      {masAbierto && (
        <div className="hoja-fondo" onClick={cerrarHoja}>
          <div className="hoja" onClick={(e) => e.stopPropagation()}>
            <div className="hoja-asa" />
            <div className="hoja-usuario"><span className="avatar">{(perfil.nombre || '?').charAt(0).toUpperCase()}</span>
              <span>{perfil.nombre}<small>{esTesorero ? 'Tesorero' : 'Contador'}</small></span></div>
            <div className="hoja-rejilla">
              {menu.filter((m) => !m.movil).map((m) => (
                <button key={m.id} className={m.id === actual.id ? 'activo' : ''} onClick={() => ir(m.id)}>
                  <Icono nombre={m.icono} tam={24} /><span>{m.corto || m.label}</span>
                </button>
              ))}
              <button onClick={salir}><Icono nombre="salir" tam={24} /><span>Salir</span></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
