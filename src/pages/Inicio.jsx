import { useEffect, useState } from 'react'
import { supabase, dinero, hoy } from '../supabase'
import Icono from '../components/Iconos'
import { leerEstado, suscribir } from '../offline'

const saludo = () => {
  const h = new Date().getHours()
  return h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
}

// Pantalla de inicio: un acceso por módulo, con su color
export default function Inicio({ perfil, config, menu, ir, puede }) {
  const [saldos, setSaldos] = useState(null)
  const verSaldos = puede('resumen')
  useEffect(() => {
    if (!verSaldos) return
    supabase.rpc('resumen_periodo', { p_desde: hoy(), p_hasta: hoy() }).then(({ data }) => setSaldos(data))
  }, [verSaldos])

  // Avisos en las tarjetas
  const [avisos, setAvisos] = useState({})
  const [conexion, setConexion] = useState(leerEstado)
  useEffect(() => suscribir(setConexion), [])
  useEffect(() => {
    if (puede('gastos')) {
      supabase.from('gastos').select('id').is('fecha_pago', null)
        .then(({ data }) => setAvisos((a) => ({ ...a, gastos: data?.length || 0 })), () => {})
    }
    if (puede('presupuesto')) {
      supabase.from('v_presupuesto').select('id').eq('anio', new Date().getFullYear()).lt('diferencia', 0)
        .then(({ data }) => setAvisos((a) => ({ ...a, presupuesto: data?.length || 0 })), () => {})
    }
  }, []) // eslint-disable-line
  const avisoDe = (id) => {
    if (id === 'gastos' && avisos.gastos) return `${avisos.gastos} por pagar`
    if (id === 'presupuesto' && avisos.presupuesto) return `${avisos.presupuesto} ${avisos.presupuesto === 1 ? 'subcuenta excedida' : 'subcuentas excedidas'}`
    if (id === 'caja' && conexion.pendientes) return `${conexion.pendientes} sin enviar`
    return null
  }

  const primerNombre = (perfil.nombre || '').split(' ')[0]

  return (
    <section className="pagina inicio">
      <header className="inicio-cab">
        <div>
          <p className="inicio-saludo">{saludo()}, {primerNombre}</p>
          <h1>{config?.nombre_app || 'Tesorería'}</h1>
          <p className="tenue">{config?.nombre_iglesia}</p>
        </div>
        {saldos && (
          <div className="inicio-saldos">
            <div className="principal"><span>Saldo total</span><strong>{dinero(saldos.saldo_actual)}</strong></div>
            <div><span>Efectivo</span><strong>{dinero(saldos.saldo_efectivo)}</strong></div>
            <div><span>Banco</span><strong>{dinero(saldos.saldo_banco)}</strong></div>
          </div>
        )}
      </header>

      <div className="inicio-rejilla">
        {menu.filter((m) => m.id !== 'inicio').map((m) => (
          <button key={m.id} className="modulo" onClick={() => ir(m.id)} style={{ '--color-modulo': m.color }}>
            {avisoDe(m.id) && <span className="modulo-aviso"><span aria-hidden="true">⚠</span> {avisoDe(m.id)}</span>}
            <span className="modulo-icono"><Icono nombre={m.icono} tam={24} /></span>
            <strong>{m.label}</strong>
            <span className="modulo-desc">{m.desc}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
