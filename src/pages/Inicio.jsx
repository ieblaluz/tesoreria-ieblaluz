import { useEffect, useState } from 'react'
import { supabase, dinero, hoy } from '../supabase'
import Icono from '../components/Iconos'

const saludo = () => {
  const h = new Date().getHours()
  return h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
}

// Pantalla de inicio: accesos a los módulos agrupados
export default function Inicio({ perfil, config, menu, ir, esTesorero }) {
  const [saldos, setSaldos] = useState(null)
  useEffect(() => {
    if (!esTesorero) return
    supabase.rpc('resumen_periodo', { p_desde: hoy(), p_hasta: hoy() }).then(({ data }) => setSaldos(data))
  }, [esTesorero])

  const grupos = []
  for (const m of menu.filter((x) => x.id !== 'inicio')) {
    let g = grupos.find((x) => x.nombre === m.grupo)
    if (!g) grupos.push(g = { nombre: m.grupo, items: [] })
    g.items.push(m)
  }
  const ORDEN = ['Operaciones', 'Control', 'Administración', 'Mi cuenta']
  grupos.sort((a, b) => ORDEN.indexOf(a.nombre) - ORDEN.indexOf(b.nombre))
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

      {grupos.map((g) => (
        <div key={g.nombre} className="inicio-grupo">
          <h2>{g.nombre}</h2>
          <div className="inicio-rejilla">
            {g.items.map((m) => (
              <button key={m.id} className="modulo" onClick={() => ir(m.id)}>
                <span className="modulo-icono"><Icono nombre={m.icono} tam={26} /></span>
                <span className="modulo-texto">
                  <strong>{m.label}</strong>
                  <span>{m.desc}</span>
                </span>
                <Icono nombre="flecha" tam={18} className="modulo-flecha" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
