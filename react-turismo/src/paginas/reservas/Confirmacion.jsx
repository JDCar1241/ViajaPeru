
import '../../estilos/reservas.css';
import { ultima } from '../../servicios/api.js';
import { useSesion } from '../../servicios/auth.js';
import { soles } from '../../utils/moneda.js';

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

export default function Confirmacion() {
  const sesion = useSesion();
  const esCliente = sesion?.usuario?.rol === 'Cliente';

  const r = ultima.datos;

  if (!r) {
    return (
      <main className="vp-centro">
        <div className="vp-panel">
          <p>No hay una reserva reciente.</p>
          <a className="vp-btn" href="#/paquetes">
            Ir al catálogo
          </a>
        </div>
      </main>
    );
  }

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
                <dd>{soles(r.total)}</dd>
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

      <p className="aviso aviso--pendiente">
        Tu reserva está <strong>pendiente de pago</strong>.{' '}
        {esCliente
          ? 'Págala ahora para confirmar tus cupos y recibir tu boleta por correo.'
          : 'Cóbrala para confirmar los cupos; el comprobante se enviará al correo del cliente.'}
      </p>

      <p className="vp-fila-botones">
        {esCliente ? (
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
