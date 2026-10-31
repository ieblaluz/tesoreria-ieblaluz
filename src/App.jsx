import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { supabase, setMoneda } from './supabase'
import { Cargando } from './components/ui'
import Icono from './components/Iconos'
import EstadoConexion from './components/EstadoConexion'
import Bloqueo from './components/Bloqueo'
import { estaAbierta, marcarAbierta, marcarCerrada, borrarHuella } from './bloqueo'
import { iniciarSincronizacion } from './cola'
import Login from './pages/Login'
const Inicio = lazy(() => import('./pages/Inicio'))
const Caja = lazy(() => import('./pages/Caja'))
const Resumen = lazy(() => import('./pages/Resumen'))
const Ingresos = lazy(() => import('./pages/Ingresos'))
const Gastos = lazy(() => import('./pages/Gastos'))
const Presupuesto = lazy(() => import('./pages/Presupuesto'))
const Catalogos = lazy(() => import('./pages/Catalogos'))
const Usuarios = lazy(() => import('./pages/Usuarios'))
const Configuracion = lazy(() => import('./pages/Configuracion'))
const Perfil = lazy(() => import('./pages/Perfil'))
const Reportes = lazy(() => import('./pages/Reportes'))
const Movimientos = lazy(() => import('./pages/Movimientos'))
const Pagos = lazy(() => import('./pages/Pagos'))

// permiso: módulo de permisos necesario ('admin' = solo administrador; null = todos)
// Descarga de antemano todas las pantallas para que también abran sin conexión
const PRECARGAR = [
  () => import('./pages/Inicio'),
  () => import('./pages/Caja'),
  () => import('./pages/Resumen'),
  () => import('./pages/Ingresos'),
  () => import('./pages/Gastos'),
  () => import('./pages/Presupuesto'),
  () => import('./pages/Catalogos'),
  () => import('./pages/Usuarios'),
  () => import('./pages/Configuracion'),
  () => import('./pages/Perfil'),
  () => import('./pages/Reportes'),
  () => import('./pages/Movimientos'),
  () => import('./pages/Pagos'),
]

// barra: aparece en la barra superior y en las pestañas del móvil · cuenta: en el menú de usuario
const MENU = [
  { id: 'inicio', label: 'Inicio', icono: 'inicio', permiso: null, C: Inicio, barra: true },
  { id: 'resumen', label: 'Resumen', icono: 'resumen', permiso: 'resumen', C: Resumen, barra: true, color: '#6D4FC2', desc: 'Saldos del periodo y movimientos de un vistazo' },
  { id: 'caja', label: 'Registrar ingresos', corto: 'Registrar', icono: 'caja', permiso: 'caja', C: Caja, barra: true, color: '#B7791F', desc: 'Caja del culto: sobres y montos' },
  { id: 'ingresos', label: 'Ingresos', icono: 'ingresos', permiso: ['ingresos', 'ingresos_editar'], C: Ingresos, color: '#2F855A', desc: 'Registros y análisis' },
  { id: 'gastos', label: 'Gastos', icono: 'gastos', permiso: 'gastos', C: Gastos, color: '#C05621', desc: 'Registros y análisis' },
  { id: 'movimientos', label: 'Caja y banco', icono: 'movimientos', permiso: 'movimientos', C: Movimientos, color: '#2B6CB0', desc: 'Depósitos y reintegros' },
  { id: 'pagos', label: 'Calendario de pagos', icono: 'calendario', permiso: 'gastos', C: Pagos, color: '#B42318', desc: 'Pagos a proveedores y vencimientos' },
  { id: 'presupuesto', label: 'Presupuesto', icono: 'presupuesto', permiso: 'presupuesto', C: Presupuesto, color: '#0F766E', desc: 'Presupuestado frente a ejecutado' },
  { id: 'reportes', label: 'Reportes', icono: 'reportes', permiso: ['reportes', 'reportes_tablon'], C: Reportes, color: '#4C51BF', desc: 'Tablón, recibos, informes y Excel' },
  { id: 'catalogos', label: 'Catálogos', icono: 'catalogos', permiso: 'catalogos', C: Catalogos, color: '#8B5E1A', desc: 'Hermanos, proveedores, cuentas…' },
  { id: 'usuarios', label: 'Usuarios', icono: 'usuarios', permiso: 'admin', C: Usuarios, cuenta: true, color: '#B83280', desc: 'Accesos, roles y permisos' },
  { id: 'configuracion', label: 'Configuración', icono: 'configuracion', permiso: 'admin', C: Configuracion, cuenta: true, color: '#475467', desc: 'Logos, colores y firmas' },
  { id: 'perfil', label: 'Mi perfil', icono: 'perfil', permiso: null, C: Perfil, cuenta: true, color: '#2C7A7B', desc: 'Tus datos y tu clave' },
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
  const [rol, setRol] = useState(null)
  const [permisos, setPermisos] = useState([])
  const refUsuario = useRef(null)
  // Bloqueo de seguridad: null (abierta) | 'reapertura' (se cerró el navegador) | 'inactividad'
  const [bloqueo, setBloqueo] = useState(() => (estaAbierta() ? null : 'reapertura'))
  const ultimaActividad = useRef(Date.now())
  const hayUsuario = useRef(false)
  const irAInicio = () => { window.history.replaceState(null, '', '#inicio'); setRuta({ pagina: 'inicio', sub: null }) }

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
    supabase.auth.getSession().then(({ data }) => { hayUsuario.current = !!data.session; setSesion(data.session) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, s) => {
      // Al iniciar sesión (no al recargar la página) siempre se empieza en Inicio
      if (evento === 'SIGNED_IN' && !hayUsuario.current) { irAInicio(); setBloqueo(null); ultimaActividad.current = Date.now() }
      hayUsuario.current = !!s
      setSesion(s)
    })
    return () => subscription.unsubscribe()
  }, [cargarConfig])

  // Sin conexión: envío automático de lo pendiente
  useEffect(() => { iniciarSincronizacion() }, [])

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

  // Vigila la inactividad: tras X minutos sin tocar la app, se bloquea
  const minutosBloqueo = config?.minutos_bloqueo || 30
  useEffect(() => {
    if (!sesion) return
    const actividad = () => { ultimaActividad.current = Date.now() }
    const comprobar = () => {
      if (!bloqueo && Date.now() - ultimaActividad.current > minutosBloqueo * 60000) { marcarCerrada(); setBloqueo('inactividad') }
    }
    const eventos = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']
    eventos.forEach((ev) => window.addEventListener(ev, actividad, { passive: true }))
    document.addEventListener('visibilitychange', comprobar)
    const t = setInterval(comprobar, 20000)
    return () => { eventos.forEach((ev) => window.removeEventListener(ev, actividad)); document.removeEventListener('visibilitychange', comprobar); clearInterval(t) }
  }, [sesion, bloqueo, minutosBloqueo])

  const uid = sesion?.user?.id
  useEffect(() => {
    setRol(null); setPermisos([])
    if (!uid) { setPerfil(null); return }
    supabase.from('perfiles').select('*').eq('id', uid).maybeSingle().then(({ data }) => {
      if (!data || !data.activo) {
        setAvisoLogin('Tu usuario está desactivado. Habla con el tesorero.')
        supabase.auth.signOut()
        return
      }
      setPerfil(data)
      // Con conexión, deja preparadas las pantallas y los datos de la caja para poder usarlas sin internet
      if (navigator.onLine) {
        setTimeout(() => {
          PRECARGAR.forEach((cargar) => cargar().catch(() => {}))
          import('./pages/Caja').then((m) => m.precargarDatosCaja?.()).catch(() => {})
        }, 1500)
      }
      supabase.from('roles').select('*').eq('id', data.rol).maybeSingle().then(({ data: r }) => setRol(r || { id: data.rol, nombre: data.rol }))
      supabase.from('permisos').select('modulo').eq('rol_id', data.rol).then(({ data: p }) => setPermisos((p || []).map((x) => x.modulo)))
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
  if (!perfil || !rol) return <Cargando />

  const esTesorero = !!rol.es_admin
  const puede = (m) => esTesorero || (m !== 'admin' && permisos.includes(m))
  const permitido = (p) => p == null || (Array.isArray(p) ? p.some(puede) : puede(p))
  const menu = MENU.filter((m) => permitido(m.permiso))
  const nombreRol = rol.nombre
  const actual = menu.find((m) => m.id === ruta.pagina) || menu[0]
  const Pagina = actual.C
  const enBarra = menu.filter((m) => m.barra)
  const enAdmin = menu.filter((m) => m.cuenta)
  const pestanas = menu.filter((m) => m.barra)
  // La hoja "Más" también se cierra con el botón atrás del móvil
  const abrirHoja = () => { window.history.pushState({ hoja: true }, '', window.location.href); setMasAbierto(true) }
  const cerrarHoja = () => { if (window.history.state?.hoja) window.history.back(); else setMasAbierto(false) }
  const salir = () => { irAInicio(); setMasAbierto(false); setUsuarioAbierto(false); marcarCerrada(); borrarHuella(); setBloqueo(null); supabase.auth.signOut() }
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
            <span className="usuario-nombre">{perfil.nombre}<small>{nombreRol}</small></span>
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

      {bloqueo && (
        <Bloqueo perfil={perfil} config={config} sesion={sesion} motivo={bloqueo} onSalir={salir}
          onDesbloquear={() => { marcarAbierta(); ultimaActividad.current = Date.now(); setBloqueo(null) }} />
      )}
      <EstadoConexion />
      <main className="contenido">
        <Suspense fallback={<Cargando />}>
          <Pagina perfil={perfil} config={config} recargarConfig={cargarConfig} ir={ir} sub={ruta.sub}
            menu={menu} esTesorero={esTesorero} puede={puede} nombreRol={nombreRol} />
        </Suspense>
      </main>

      <nav className="barra-inferior" aria-label="Navegación">
        {pestanas.map((m) => (
          <button key={m.id} className={m.id === actual.id ? 'activo' : ''} onClick={() => ir(m.id)}>
            <Icono nombre={m.icono} tam={23} /><span>{m.corto || m.label}</span>
          </button>
        ))}
        <button className={masAbierto ? 'activo' : ''} onClick={() => (masAbierto ? cerrarHoja() : abrirHoja())}>
          <Icono nombre="perfil" tam={23} /><span>Cuenta</span>
        </button>
      </nav>

      {masAbierto && (
        <div className="hoja-fondo" onClick={cerrarHoja}>
          <div className="hoja" onClick={(e) => e.stopPropagation()}>
            <div className="hoja-asa" />
            <div className="hoja-usuario"><span className="avatar">{(perfil.nombre || '?').charAt(0).toUpperCase()}</span>
              <span>{perfil.nombre}<small>{nombreRol}</small></span></div>
            <div className="hoja-rejilla">
              {enAdmin.map((m) => (
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
