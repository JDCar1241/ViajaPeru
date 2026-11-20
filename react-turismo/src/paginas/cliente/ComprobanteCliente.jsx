
import { useEffect, useState } from 'react';
import { pedir, pedirArchivo } from '../../servicios/api.js';
import './ComprobanteCliente.css';

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

  const comprador = comprobante.comprador;

  return (
    <main className="cc-contenedor">
      <a href={`#/mi-reserva/${id}`} className="cc-volver">
        ← Volver a mi reserva
      </a>

      <section className="cc-documento">
        <div className="cc-cabecera">
          <span className="cc-etiqueta">VIAJAPERU</span>
          <h1>
            {/* El Backend guarda 'Boleta' o 'Factura' (con mayúscula) */}
            {String(comprobante.tipo).toLowerCase() === 'factura' ? 'FACTURA' : 'BOLETA DE VENTA'}
          </h1>
          <strong>
            {numeroCompleto(comprobante)}
          </strong>
        </div>

        <div className="cc-estado">
          <span>✓</span>
          Comprobante emitido
        </div>

        <div className="cc-datos">
          <div>
            <small>Número de reserva</small>
            <strong>#{comprobante.reserva_id}</strong>
          </div>

          <div>
            <small>Fecha de emisión</small>
            <strong>
              {comprobante.emitido_en
                ? new Date(comprobante.emitido_en).toLocaleString('es-PE', { timeZone: 'America/Lima' })
                : 'No disponible'}
            </strong>
          </div>

          <div>
            <small>Tipo de comprobante</small>
            <strong>{comprobante.tipo}</strong>
          </div>
        </div>

        {comprador && (
          <div className="cc-comprador">
            <h3>Datos del comprador</h3>

            <p><strong>Nombre:</strong> {comprador.nombre || 'No disponible'}</p>
            <p>
              <strong>Documento:</strong>{' '}
              {comprador.tipo_documento || ''} {comprador.numero_documento || ''}
            </p>
            {comprador.direccion && (
              <p><strong>Dirección:</strong> {comprador.direccion}</p>
            )}
          </div>
        )}

        <div className="cc-total">
          <span>TOTAL</span>
          <strong>
            S/ {Number(comprobante.total || 0).toLocaleString('es-PE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </strong>
        </div>

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
