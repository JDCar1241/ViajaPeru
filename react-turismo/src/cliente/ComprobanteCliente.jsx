
import { useEffect, useState } from 'react';
import { pedir } from '../api.js';
import { getSesion } from '../auth.js';
import './ComprobanteCliente.css';

export default function ComprobanteCliente({ id }) {
  const [comprobante, setComprobante] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [descargando, setDescargando] = useState(false);

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

      const sesion = getSesion();

      if (!sesion?.token) {
        throw new Error('Tu sesión ha vencido. Inicia sesión nuevamente.');
      }

      const BASE = (import.meta.env.VITE_API_URL || '/api')
        .replace(/\/paquetes\/?$/, '')
        .replace(/\/$/, '');

      const respuesta = await fetch(
        `${BASE}/portal-cliente/comprobantes/${comprobante.id}/pdf`,
        {
          headers: {
            Authorization: `Bearer ${sesion.token}`,
          },
        }
      );

      if (!respuesta.ok) {
        const data = await respuesta.json().catch(() => ({}));
        throw new Error(data.mensaje || data.error || 'No se pudo descargar el PDF.');
      }

      const blob = await respuesta.blob();
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');

      enlace.href = url;
      enlace.download = `comprobante-${comprobante.id}.pdf`;

      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();

      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message);
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
            {comprobante.tipo === 'factura' ? 'FACTURA' : 'BOLETA DE VENTA'}
          </h1>
          <strong>
            {comprobante.serie}-{comprobante.numero}
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
                ? new Date(comprobante.emitido_en).toLocaleString('es-PE')
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
      </section>
    </main>
  );
}
