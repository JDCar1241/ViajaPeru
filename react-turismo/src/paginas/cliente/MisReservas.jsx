
import { useCallback, useEffect, useState } from 'react';
import { pedir } from '../../servicios/api.js';
import './MisReservas.css';

const moneda = (valor) =>
  new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(Number(valor) || 0);

const fecha = (valor) => {
  if (!valor) return 'Fecha no disponible';

  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return 'Fecha no disponible';

  return d.toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const textoEstado = (estado) => {
  const e = String(estado || '').toLowerCase();

  if (e === 'pagada') return 'Pagada';
  if (e === 'pendiente') return 'Pendiente de pago';
  if (e === 'cancelada') return 'Cancelada';

  return estado || 'Sin estado';
};

const claseEstado = (estado) => {
  const e = String(estado || '').toLowerCase();

  if (e === 'pagada') return 'mc-estado-pagada';
  if (e === 'pendiente') return 'mc-estado-pendiente';
  if (e === 'cancelada') return 'mc-estado-cancelada';

  return 'mc-estado-otro';
};

const nombrePaquete = (r) => {
  const paquete = r.paquete_nombre || r.nombre_paquete || r.paquete;

  if (typeof paquete === 'string') return paquete;

  if (paquete && typeof paquete === 'object') {
    return paquete.nombre || paquete.nombre_paquete || 'Paquete turístico';
  }

  return 'Paquete turístico';
};

export default function MisReservas() {
  const [reservas, setReservas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState('');

  // Estado del saldo a favor
  const [saldo, setSaldo] = useState(null);
  const [errorSaldo, setErrorSaldo] = useState('');
  const [cargandoSaldo, setCargandoSaldo] = useState(true);

  const cargarReservas = useCallback(async () => {
    setEstado('cargando');
    setError('');

    try {
      const respuesta = await pedir('/portal-cliente/reservas');

      const lista = Array.isArray(respuesta)
        ? respuesta
        : respuesta?.reservas;

      if (!Array.isArray(lista)) {
        throw new Error(
          'La respuesta del servidor no tiene el formato esperado.'
        );
      }

      setReservas(lista);
      setEstado('ok');
    } catch (err) {
      setError(err?.message || 'No pudimos cargar tus reservas.');
      setEstado('error');
    }
  }, []);

  // Consultar saldo a favor del cliente
  const cargarSaldo = useCallback(async () => {
    setCargandoSaldo(true);
    setErrorSaldo('');

    try {
      const respuesta = await pedir('/portal-cliente/saldo');

      setSaldo(Number(respuesta?.saldo_disponible) || 0);
    } catch (err) {
      setErrorSaldo(err?.message || 'No pudimos consultar tu saldo.');
    } finally {
      setCargandoSaldo(false);
    }
  }, []);

  useEffect(() => {
    cargarReservas();
    cargarSaldo();
  }, [cargarReservas, cargarSaldo]);

  return (
    <main className="mc-pagina">
      <section className="mc-contenedor">

        <header className="mc-encabezado">
          <div>
            <span className="mc-etiqueta">MI ESPACIO VIAJERO</span>
            <h1>Mis reservas</h1>
            <p>
              Consulta tus viajes, revisa los detalles y gestiona tus pagos
              desde un solo lugar.
            </p>
          </div>

          <div className="mc-icono-viaje" aria-hidden="true">
            <span>✈</span>
          </div>
        </header>

        {/* SALDO A FAVOR */}
        <div className="mc-saldo">
          <div className="mc-saldo-icono">💰</div>

          <div className="mc-saldo-contenido">
            <span className="mc-saldo-etiqueta">MI SALDO A FAVOR</span>

            <h2>
              {cargandoSaldo
                ? 'Consultando...'
                : saldo !== null
                  ? moneda(saldo)
                  : 'No disponible'}
            </h2>

            {errorSaldo ? (
              <div className="mc-saldo-error">
                <span>{errorSaldo}</span>

                <button
                  type="button"
                  onClick={cargarSaldo}
                  disabled={cargandoSaldo}
                >
                  Reintentar
                </button>
              </div>
            ) : (
              <p>
                Disponible para utilizar en tus próximas reservas.
              </p>
            )}
          </div>
        </div>

        <div className="mc-resumen">
          <div className="mc-resumen-texto">
            <span className="mc-resumen-icono">🌎</span>
            <div>
              <strong>Tus próximas aventuras</strong>
              <p>Todo empieza con un nuevo destino.</p>
            </div>
          </div>

          <a className="mc-boton-secundario" href="#/paquetes">
            Explorar paquetes <span>→</span>
          </a>
        </div>

        {estado === 'cargando' && (
          <div className="mc-mensaje">
            <div className="mc-cargando" />
            <strong>Cargando tus reservas...</strong>
            <p>Estamos preparando la información de tus viajes.</p>
          </div>
        )}

        {estado === 'error' && (
          <div className="mc-mensaje mc-mensaje-error">
            <span className="mc-mensaje-icono">!</span>
            <h2>No pudimos cargar tus reservas</h2>
            <p>{error}</p>

            <button
              className="mc-boton-principal"
              onClick={cargarReservas}
              type="button"
            >
              Intentar nuevamente
            </button>
          </div>
        )}

        {estado === 'ok' && reservas.length === 0 && (
          <div className="mc-mensaje mc-vacio">
            <div className="mc-vacio-icono">🧳</div>
            <h2>Aún no tienes reservas</h2>
            <p>
              Cuando reserves un paquete, aparecerá aquí toda la información
              de tu viaje.
            </p>

            <a className="mc-boton-principal" href="#/paquetes">
              Descubrir destinos
            </a>
          </div>
        )}

        {estado === 'ok' && reservas.length > 0 && (
          <>
            <div className="mc-lista-encabezado">
              <div>
                <h2>Tu historial de viajes</h2>
                <p>
                  {reservas.length}{' '}
                  {reservas.length === 1
                    ? 'reserva registrada'
                    : 'reservas registradas'}
                </p>
              </div>
            </div>

            <div className="mc-lista">
              {reservas.map((r) => {
                const pendiente =
                  String(r.estado || '').toLowerCase() === 'pendiente';

                const foto = r.paquete?.foto_url;

                return (
                  <article className="mc-tarjeta" key={r.id}>
                    <div className="mc-tarjeta-superior">

                      <div className="mc-destino-imagen">
                        {foto ? (
                          <img
                            src={foto}
                            alt={nombrePaquete(r)}
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="mc-destino-sin-imagen">
                            Sin imagen
                          </div>
                        )}
                      </div>

                      <div className="mc-destino">
                        <span className="mc-reserva-numero">
                          RESERVA N.º {r.id}
                        </span>

                        <h3>{nombrePaquete(r)}</h3>

                        <span className="mc-fecha">
                          <span>📅</span>
                          {fecha(r.fecha_inicio_viaje || r.fecha_salida)}
                        </span>
                      </div>

                      <span className={`mc-estado ${claseEstado(r.estado)}`}>
                        <span className="mc-estado-punto" />
                        {textoEstado(r.estado)}
                      </span>
                    </div>

                    <div className="mc-tarjeta-detalles">
                      <div className="mc-dato">
                        <span>VIAJEROS</span>
                        <strong>
                          <span>👥</span>
                          {r.num_personas || r.personas || 1}
                        </strong>
                      </div>

                      <div className="mc-dato">
                        <span>MONTO TOTAL</span>
                        <strong className="mc-precio">
                          {moneda(r.total)}
                        </strong>
                      </div>

                      <div className="mc-dato">
                        <span>RESERVADA EL</span>
                        <strong>{fecha(r.creado_en)}</strong>
                      </div>
                    </div>

                    <div className="mc-tarjeta-pie">
                      <span className="mc-pie-texto">
                        {pendiente
                          ? 'Completa tu pago para confirmar tu reserva.'
                          : String(r.estado || '').toLowerCase() === 'pagada'
                            ? `Pago registrado${
                                r.pagada_en
                                  ? ` el ${fecha(r.pagada_en)}`
                                  : ''
                              }.`
                            : 'Consulta la información de tu reserva.'}
                      </span>

                      <a
                        className={`mc-boton-principal ${
                          pendiente ? 'mc-boton-pagar' : ''
                        }`}
                        href={`#/mi-reserva/${r.id}`}
                      >
                        {pendiente ? '💳 Pagar ahora' : 'Ver detalle'}
                        <span>→</span>
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}

        <footer className="mc-pie-pagina">
          <a href="#/mi-cuenta">Mi cuenta</a>
          <span>·</span>
          <a href="#/paquetes">Ver paquetes turísticos</a>
        </footer>

      </section>
    </main>
  );
}
