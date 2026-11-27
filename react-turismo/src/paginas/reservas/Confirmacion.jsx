import { useEffect, useState } from 'react';
import '../../estilos/reservas.css';
import { pedir, ultima } from '../../servicios/api.js';
import { useSesion } from '../../servicios/auth.js';
import { totalReservaDetalle } from '../../utils/moneda.js';
import CuentaRegresiva from '../../componentes/CuentaRegresiva.jsx';

// La salida llega como fecha y hora ISO (en UTC). Cortar los 10 primeros caracteres
// daba el día UTC, que puede ser el día siguiente al de Lima: se formatea en hora de Lima.
const fecha = (v) => {
  if (!v) return 'No especificada';

  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return 'No especificada';

  return d.toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Lima',
  });
};

const nombreDocumento = (tipo) => {
  const nombres = {
    DNI: 'DNI',
    CE: 'Carné de extranjería',
    PASAPORTE: 'Pasaporte',
  };

  return nombres[tipo] || tipo || 'Documento';
};

// La reserva tal como la devuelve el servidor, con los nombres que usa esta página.
const desdeServidor = (d) => ({
  ...d,
  paquete: d.paquete?.nombre || d.paquete,
  fecha: d.fecha_inicio_viaje,
  personas: d.personas || d.num_personas,
});

export default function Confirmacion({ id }) {
  const sesion = useSesion();
  const esCliente = sesion?.usuario?.rol === 'Cliente';

  // Recién creada: los datos ya están en memoria. Si se recargó la página, se piden al servidor.
  const enMemoria =
    ultima.datos && (!id || String(ultima.datos.id) === String(id))
      ? ultima.datos
      : null;

  const [cargada, setCargada] = useState(null);
  const [estado, setEstado] = useState(enMemoria || !id || !sesion ? 'listo' : 'cargando');

  useEffect(() => {
    if (enMemoria || !id || !sesion) return;

    const ctrl = new AbortController();
    const ruta = esCliente ? '/portal-cliente/reservas/' + id : '/reservas/' + id;

    pedir(ruta, { signal: ctrl.signal })
      .then((d) => {
        setCargada(desdeServidor(d));
        setEstado('listo');
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setEstado('error');
      });

    return () => ctrl.abort();
  }, [id, enMemoria, sesion, esCliente]);

  const r = enMemoria || cargada;

  if (estado === 'cargando') {
    return (
      <main className="vp-centro">
        <div className="vp-panel">
          <p>Cargando la reserva…</p>
        </div>
      </main>
    );
  }

  if (!r) {
    return (
      <main className="vp-centro">
        <div className="vp-panel">
          <p>
            {estado === 'error'
              ? 'No pudimos cargar la reserva.'
              : id && !sesion
                ? 'Inicia sesión para ver tu reserva.'
                : 'No hay una reserva reciente.'}
          </p>
          <a
            className="vp-btn"
            href={id && !sesion ? '#/login' : esCliente ? '#/mis-reservas' : '#/paquetes'}
          >
            {id && !sesion ? 'Iniciar sesión' : esCliente ? 'Ver mis reservas' : 'Ir al catálogo'}
          </a>
        </div>
      </main>
    );
  }

  // Al recargar más tarde la reserva puede estar ya pagada o cancelada.
  const pendiente = !r.estado || r.estado === 'Pendiente';

  const codigo = r.codigo || r.id;
  const cliente = r.cliente || {};
  const acompanantes = Array.isArray(r.acompanantes)
    ? r.acompanantes
    : [];

  const tipoDocumento =
    cliente.tipo_documento ||
    cliente.tipoDocumento ||
    'DNI';

  const numeroDocumento =
    cliente.dni ||
    cliente.nro_documento ||
    cliente.numero_documento ||
    '';

  return (
    <main className="vp-centro">
      <article className="vp-ticket">
        <div className="vp-ticket__cuerpo">
          <p className="vp-ok">
            Reserva registrada correctamente
          </p>

          {/* Compra online: plazo para pagar antes de que los cupos se liberen */}
          {pendiente && r.expira_en && (
            <CuentaRegresiva hasta={r.expira_en} texto="Paga tu reserva" />
          )}

          <h1>{r.paquete || 'Reserva de viaje'}</h1>

          <dl>
            <div>
              <dt>Salida</dt>
              <dd>{fecha(r.fecha)}</dd>
            </div>

            <div>
              <dt>Titular</dt>
              <dd>
                {cliente.nombres} {cliente.apellidos}
              </dd>
            </div>

            <div>
              <dt>{nombreDocumento(tipoDocumento)}</dt>
              <dd>{numeroDocumento || 'No especificado'}</dd>
            </div>

            <div>
              <dt>Personas</dt>
              <dd>{r.personas || 1}</dd>
            </div>

            {r.total != null && (
              <div>
                <dt>Total a pagar</dt>
                <dd>{totalReservaDetalle(r)}</dd>
              </div>
            )}
          </dl>

          {acompanantes.length > 0 && (
            <>
              <h2>Acompañantes</h2>

              <ul className="vp-lista">
                {acompanantes.map((a, i) => {
                  const tipo =
                    a.tipo_documento ||
                    a.tipoDocumento ||
                    'DNI';

                  const documento =
                    a.dni ||
                    a.nro_documento ||
                    a.numero_documento ||
                    '';

                  return (
                    <li key={documento || i}>
                      {a.nombres} {a.apellidos}
                      {' · '}
                      {nombreDocumento(tipo)} {documento}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div className="vp-ticket__talon">
          <span>Código de reserva</span>
          <strong>{codigo}</strong>
        </div>
      </article>

      {pendiente ? (
        <p className="aviso aviso--pendiente">
          Tu reserva está <strong>pendiente de pago</strong>.{' '}
          {esCliente
            ? 'Págala ahora para confirmar tus cupos y recibir tu boleta por correo.'
            : 'Cóbrala para confirmar los cupos; el comprobante se enviará al correo del cliente.'}
        </p>
      ) : (
        <p className={'aviso aviso--estado ' + (r.estado === 'Pagada' ? 'aviso--ok' : 'aviso--error')}>
          Esta reserva está <strong>{r.estado === 'Pagada' ? 'pagada' : 'cancelada'}</strong>.
        </p>
      )}

      <p className="vp-fila-botones">
        {!pendiente ? (
          <a
            className="vp-btn"
            href={esCliente ? '#/mi-reserva/' + r.id : '#/cobros'}
          >
            {esCliente ? 'Ver mi reserva' : 'Ir a cobros'}
          </a>
        ) : esCliente ? (
          <>
            <a
              className="vp-btn"
              href={'#/mi-reserva/' + r.id}
            >
              Pagar ahora
            </a>

            <a
              className="vp-btn vp-btn--borde"
              href="#/mis-reservas"
            >
              Ver mis reservas
            </a>
          </>
        ) : (
          <>
            <a
              className="vp-btn"
              href={'#/cobrar/' + r.id}
            >
              Cobrar ahora
            </a>

            <a
              className="vp-btn vp-btn--borde"
              href="#/paquetes"
            >
              Registrar otra reserva
            </a>
          </>
        )}

        <button
          type="button"
          className="vp-btn vp-btn--borde"
          onClick={() => window.print()}
        >
          Imprimir
        </button>
      </p>
    </main>
  );
}
