import { useState } from 'react'
import { mensajeError } from '../supabase'
import { exportarExcel } from '../excel'
import { Aviso } from './ui'
import { Documento, TablasModelo, VistaDocumento } from './Documento'

// Sección de reporte con filtros: "Ver reporte" (vista previa e impresión) y "Descargar Excel".
// construir(): devuelve el modelo del reporte con los filtros actuales.
export default function SeccionReporte({ children, construir, config, nota }) {
  const [modelo, setModelo] = useState(null)
  const [ocupado, setOcupado] = useState('')
  const [error, setError] = useState('')

  async function generar(modo) {
    setOcupado(modo); setError('')
    try {
      const m = await construir()
      if (modo === 'ver') setModelo(m)
      else await exportarExcel(m, config)
    } catch (e) { setError(mensajeError(e)) }
    setOcupado('')
  }

  return (
    <div className="flex-resto">
      <form className="panel reporte-filtros" onSubmit={(e) => { e.preventDefault(); generar('ver') }}>
        <div className="reporte-filtros-campos">{children}</div>
        {nota && <p className="tenue nota">{nota}</p>}
        <Aviso onCerrar={() => setError('')}>{error}</Aviso>
        <div className="botonera">
          <span className="espacio" />
          <button type="button" className="btn btn-suave" disabled={!!ocupado} onClick={() => generar('excel')}>
            {ocupado === 'excel' ? 'Generando…' : 'Descargar Excel'}
          </button>
          <button className="btn btn-primario" disabled={!!ocupado}>{ocupado === 'ver' ? 'Preparando…' : 'Ver reporte'}</button>
        </div>
      </form>
      {modelo && (
        <VistaDocumento titulo={modelo.titulo} archivo={modelo.archivo} horizontal={modelo.horizontal} listo
          onCerrar={() => setModelo(null)} onExcel={() => exportarExcel(modelo, config)}>
          <Documento config={config} titulo={modelo.titulo} meta={modelo.meta}>
            <TablasModelo modelo={modelo} />
            {modelo.pie && <p className="doc-nota">{modelo.pie}</p>}
          </Documento>
        </VistaDocumento>
      )}
    </div>
  )
}
