// Iconos de línea propios (24×24, trazo fino) para el menú y el inicio
const T = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }

const TRAZOS = {
  inicio: <><path d="M3.5 10.5 12 4l8.5 6.5" /><path d="M5.5 9v10.5h13V9" /><path d="M10 19.5v-5h4v5" /></>,
  resumen: <><path d="M4 20h16" /><rect x="5.5" y="11" width="3" height="6.5" rx=".8" /><rect x="10.5" y="6.5" width="3" height="11" rx=".8" /><rect x="15.5" y="9" width="3" height="8.5" rx=".8" /></>,
  caja: <><rect x="3.5" y="7" width="17" height="11" rx="2" /><circle cx="12" cy="12.5" r="2.6" /><path d="M6.5 10h.01M17.5 15h.01" /><path d="M7 4.5h10" /></>,
  ingresos: <><path d="M12 3.5v10" /><path d="m8 9.5 4 4 4-4" /><path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  gastos: <><path d="M12 13.5v-10" /><path d="m8 7.5 4-4 4 4" /><path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  movimientos: <><path d="M4 8h14" /><path d="m15 4.5 3.5 3.5L15 11.5" /><path d="M20 16H6" /><path d="M9 12.5 5.5 16 9 19.5" /></>,
  presupuesto: <><path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12z" /><path d="M15 3.8a8.5 8.5 0 0 1 5.2 5.2H15z" /></>,
  reportes: <><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z" /><path d="M14 3.5V8h4" /><path d="M8.5 12.5h7M8.5 16h5" /></>,
  catalogos: <><path d="M5 4.5h11a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2z" /><path d="M5 17.5a2 2 0 0 1 2-2h11" /><path d="M9 8.5h5" /></>,
  usuarios: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M15.5 5.8a3 3 0 0 1 0 5.4" /><path d="M17 14.3a5.5 5.5 0 0 1 3.5 4.7" /></>,
  configuracion: <><path d="M4 7h9M17 7h3" /><circle cx="15" cy="7" r="2" /><path d="M4 17h3M11 17h9" /><circle cx="9" cy="17" r="2" /><path d="M4 12h12M19.5 12h.5" /></>,
  perfil: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  mas: <><circle cx="6" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18" cy="12" r="1.2" /></>,
  salir: <><path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4" /><path d="M10 16l-4-4 4-4" /><path d="M6 12h9" /></>,
  flecha: <path d="m9 6 6 6-6 6" />,
  calendario: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /><path d="M8 13h2M14 13h2M8 16.5h2" /></>,
  editar: <><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" /><path d="m14.5 7.5 3 3" /></>,
  candado: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
}

export default function Icono({ nombre, tam = 22, className }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" {...T} className={className} aria-hidden="true">
      {TRAZOS[nombre]}
    </svg>
  )
}
