
import { useEffect, useState } from 'react';
import { pedir, pedirArchivo } from '../../servicios/api.js';
import './ComprobanteCliente.css';
import VistaComprobante from '../../componentes/VistaComprobante.jsx';
import Icono from '../../componentes/Icono.jsx';

const numeroCompleto = (c) => `${c.serie}-${String(c.numero).padStart(8, '0')}`;

export default function ComprobanteCliente({ id }) {
  const [comprobante, setComprobante] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [descargando, setDescargando] = useState(false);
  const [errorPdf, setErrorPdf] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function cargar() {
      try {
        setCargando(true);
        setError('');

        const data = await pedir(
          `/portal-cliente/reservas/${id}/comprobante`,
          { signal: controller.signal }
        );

        setComprobante(data);
      } catch (e) {
        if (e.name === 'AbortError') return;

        if (e.estado === 404) {
          setError('Esta reserva todavía no tiene un comprobante emitido.');
        } else {
          setError(e.message || 'No se pudo cargar el comprobante.');
        }
      } finally {
        if (!controller.signal.aborted) setCargando(false);
      }
    }

    cargar();

    return () => controller.abort();
  }, [id]);

  async function descargarPDF() {
    try {
      setDescargando(true);
      setErrorPdf('');

      const blob = await pedirArchivo(
        `/portal-cliente/comprobantes/${comprobante.id}/pdf`
      );

      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');

      enlace.href = url;
      enlace.download = `${numeroCompleto(comprobante)}.pdf`;

      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();

      // Revocar al instante puede cortar la descarga en Firefox y Safari.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setErrorPdf(e.message || 'No se pudo descargar el PDF.');
    } finally {
      setDescargando(false);
    }
  }

  if (cargando) {
    return <main className="cc-contenedor">Cargando comprobante...</main>;
  }

  if (error) {
    return (
      <main className="cc-contenedor">
        <a href={`#/mi-reserva/${id}`} className="cc-volver">
          ← Volver a mi reserva
        </a>
        <div className="cc-mensaje">
          <h2>Comprobante no disponible</h2>
          <p>{error}</p>
        </div>
      </main>
    );
  }

  if (!comprobante) return null;


  return (
    <main className="cc-contenedor">
      <a href={`#/mi-reserva/${id}`} className="cc-volver">
        ← Volver a mi reserva
      </a>

      <section className="cc-documento">
        <div className="cc-estado">
          <span><Icono nombre="check" tamano={16} /></span>
          Comprobante emitido
        </div>

        {/* Mismos datos que el PDF: los arma el Backend (representacion-comprobante.js) */}
        <VistaComprobante r={comprobante.representacion} totalSoles={comprobante.total} />

        <button
          type="button"
          className="cc-descargar"
          onClick={descargarPDF}
          disabled={descargando}
        >
          {descargando ? 'Descargando...' : 'Descargar comprobante PDF'}
        </button>

        {errorPdf && (
          <p className="cc-error" role="alert">{errorPdf}</p>
        )}
      </section>
    </main>
  );
}
