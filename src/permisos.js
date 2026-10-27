// Permisos que se pueden asignar a cada rol (el rol administrador los tiene todos)
export const PERMISOS = [
  { id: 'resumen', nombre: 'Resumen y saldos', desc: 'Ver el resumen del periodo y los saldos de efectivo y banco' },
  { id: 'caja', nombre: 'Registrar ingresos', desc: 'Usar la caja del culto para anotar sobres y montos' },
  { id: 'ingresos', nombre: 'Ver todos los ingresos', desc: 'Consultar el historial completo y el análisis de ingresos' },
  { id: 'ingresos_editar', nombre: 'Editar ingresos', desc: 'Crear, corregir y borrar cualquier ingreso' },
  { id: 'gastos', nombre: 'Gastos', desc: 'Ver, registrar, editar y analizar gastos' },
  { id: 'movimientos', nombre: 'Caja y banco', desc: 'Registrar depósitos y reintegros' },
  { id: 'presupuesto', nombre: 'Presupuesto', desc: 'Ver y modificar el presupuesto anual' },
  { id: 'reportes_tablon', nombre: 'Reporte del tablón', desc: 'Anotar quién contó e imprimir el reporte del culto' },
  { id: 'reportes', nombre: 'Demás reportes', desc: 'Recibos, informes de ingresos y egresos, anuales, proveedores…' },
  { id: 'catalogos', nombre: 'Catálogos', desc: 'Crear y modificar hermanos, proveedores, cuentas, grupos…' },
]
