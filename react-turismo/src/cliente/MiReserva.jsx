
import { useCallback, useEffect, useState } from 'react';
import { pedir } from '../api.js';
import { useSesion } from '../auth.js';
import './MiReserva.css';

const CULQI_KEY = import.meta.env.VITE_CULQI_PUBLIC_KEY;

function moneda(valor, tipo = 'PEN') {
  return Number(valor || 0).toLocaleString('es-PE', {
    style: 'currency',
    currency: tipo,
  });
}

function dolares(centimos) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(centimos / 100);
}

function fecha(valor) {
  if (!valor) return 'Por confirmar';

  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return valor;

  return d.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function estadoTexto(estado) {
  const estados = {
    pendiente: 'Pendiente de pago',
    pagada: 'Pagada',
    confirmado: 'Confirmada',
    cancelada: 'Cancelada',
    anulada: 'Anulada',
  };

  return estados[String(estado || '').toLowerCase()] || estado || 'Sin estado';
}

// Culqi se utiliza exclusivamente para pagos con tarjeta.
function pedirToken({ monto, moneda: tipoMoneda, email }) {
  return new Promise((resolve, reject) => {
    if (!window.CulqiCheckout) {
      reject(new Error('No cargó el formulario de Culqi. Recarga la página.'));
      return;
    }

    if (!CULQI_KEY) {
      reject(new Error('Falta VITE_CULQI_PUBLIC_KEY en el .env del frontend.'));
      return;
    }

    const culqi = new window.CulqiCheckout(CULQI_KEY, {
      settings: {
        title: 'ViajaPeru',
        currency: tipoMoneda,
        amount: monto,
      },
      client: { email },
      options: {
        lang: 'es',
        paymentMethods: {
          tarjeta: true,
          yape: false,
        },
      },
    });

    culqi.culqi = () => {
      if (culqi.token) {
        const token = culqi.token.id;

        if (typeof culqi.close === 'function') {
          culqi.close();
        }

        resolve(token);
      } else if (culqi.error) {
        const mensaje =
          culqi.error.user_message || 'No se pudo procesar el pago.';

        if (typeof culqi.close === 'function') {
          culqi.close();
        }

        reject(new Error(mensaje));
      }
    };

    culqi.open();
  });
}

function Info({ icono, titulo, valor }) {
  return (
    <div className="mr-info">
      <span className="mr-info-icono">{icono}</span>
      <div>
        <span className="mr-info-titulo">{titulo}</span>
        <strong>{valor || 'No disponible'}</strong>
      </div>
    </div>
  );
}

export default function MiReserva() {
  const sesion = useSesion();

  const id = window.location.hash.match(/^#\/mi-reserva\/(\d+)/)?.[1];

  const [reserva, setReserva] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const [metodoPago, setMetodoPago] = useState('Tarjeta');
  const [monedaPago, setMonedaPago] = useState('PEN');

  const [tipoCambio, setTipoCambio] = useState(null);
  const [cargandoCambio, setCargandoCambio] = useState(true);

  const [pagando, setPagando] = useState(false);
  const [esperandoTarjeta, setEsperandoTarjeta] = useState(false);
  const [correo, setCorreo] = useState('');

  const cargarReserva = useCallback(async () => {
    if (!id) {
      setError('El número de reserva no es válido.');
      setEstado('error');
      return false;
    }

    setEstado('cargando');
    setError('');

    try {
      const respuesta = await pedir(`/portal-cliente/reservas/${id}`);
      const datos = respuesta?.reserva || respuesta;

      if (!datos || typeof datos !== 'object') {
        throw new Error('No se encontró la reserva.');
      }

      setReserva(datos);

      setCorreo(
        datos.cliente?.correo ||
        datos.correo ||
        sesion?.usuario?.correo ||
        ''
      );

      setEstado('ok');
      return true;
    } catch (e) {
      setError(e.message || 'No se pudo cargar el detalle de la reserva.');
      setEstado('error');
      return false;
    }
  }, [id, sesion]);

  useEffect(() => {
    if (sesion) cargarReserva();
  }, [sesion, cargarReserva]);

  useEffect(() => {
    if (!sesion || !id) return;

    let activo = true;

    pedir(`/portal-cliente/reservas/${id}/tipo-cambio`)
      .then((d) => {
        if (activo) setTipoCambio(Number(d.tipo_cambio) || null);
      })
      .catch(() => {
        if (activo) setTipoCambio(null);
      })
      .finally(() => {
        if (activo) setCargandoCambio(false);
      });

    return () => {
      activo = false;
    };
  }, [sesion, id]);

  if (!sesion) {
    return (
      <main className="mr-pagina">
        <section className="mr-mensaje">
          <h2>Inicia sesión</h2>
          <p>Debes iniciar sesión para consultar tu reserva.</p>
          <a className="mr-boton" href="#/login">Iniciar sesión</a>
        </section>
      </main>
    );
  }

  const totalSoles = Math.round(Number(reserva?.total || 0) * 100);

  const totalDolares = tipoCambio
    ? Math.round(totalSoles / tipoCambio)
    : 0;

  const montoMostrado = monedaPago === 'USD'
    ? dolares(totalDolares)
    : moneda(totalSoles / 100);

  const pendiente =
    String(reserva?.estado || '').toLowerCase() === 'pendiente';

  function seleccionarMetodo(metodo) {
    setMetodoPago(metodo);
    setError('');
    setMensaje('');

    // Yape funcionará únicamente en soles.
    if (metodo === 'Yape') {
      setMonedaPago('PEN');
    }
  }

  function seleccionarMoneda(monedaSeleccionada) {
    if (metodoPago !== 'Tarjeta') return;

    if (monedaSeleccionada === 'USD' && !tipoCambio) {
      setError('No hay un tipo de cambio disponible.');
      return;
    }

    setMonedaPago(monedaSeleccionada);
    setError('');
    setMensaje('');
  }

  async function pagar() {
    setError('');
    setMensaje('');

    if (!reserva || !pendiente) {
      setError('Esta reserva ya no está pendiente de pago.');
      return;
    }

    if (metodoPago === 'Yape') {
      setError('Yape estará disponible próximamente. Todavía no se ha configurado tu QR personal.');
      return;
    }

    if (!correo.trim() || !/^\S+@\S+\.\S+$/.test(correo.trim())) {
      setError('Ingresa un correo electrónico válido para el pago.');
      return;
    }

    if (!CULQI_KEY) {
      setError('No está configurada la llave pública de Culqi.');
      return;
    }

    try {
      setEsperandoTarjeta(true);

      let montoFinal = totalSoles;

      if (monedaPago === 'USD') {
        const cambio = await pedir(
          `/portal-cliente/reservas/${id}/tipo-cambio`
        );

        const tcActual = Number(cambio.usd);

        if (!tcActual || !Number.isFinite(tcActual)) {
          throw new Error('No se pudo obtener un tipo de cambio válido.');
        }

        setTipoCambio(tcActual);
        montoFinal = Math.round(totalSoles / tcActual);

        if (montoFinal <= 0) {
          throw new Error('El importe convertido a dólares no es válido.');
        }
      }

      const token = await pedirToken({
        monto: montoFinal,
        moneda: monedaPago,
        email: correo.trim(),
      });

      setEsperandoTarjeta(false);
      setPagando(true);

      const respuesta = await pedir(
        `/portal-cliente/reservas/${id}/pagar`,
        {
          method: 'POST',
          body: JSON.stringify({
            token,
            moneda: monedaPago,
          }),
        }
      );

      setMensaje(
        `¡Pago realizado correctamente! ${
          respuesta?.mensaje || 'Tu reserva está pagada.'
        }`
      );

      await cargarReserva();
    } catch (e) {
      setError(
        e.message ||
        'No pudimos procesar el pago. Verifica el estado antes de volver a intentarlo.'
      );
    } finally {
      setPagando(false);
      setEsperandoTarjeta(false);
    }
  }

  const nombrePaquete =
    reserva?.paquete?.nombre ||
    reserva?.paquete_nombre ||
    reserva?.nombre_paquete ||
    'Paquete turístico';

  const fotoPaquete = reserva?.paquete?.foto_url;

  return (
    <main className="mr-pagina">
      <div className="mr-contenedor">

        <div className="mr-regresar">
          <a href="#/mis-reservas">← Volver a mis reservas</a>
          <span>VIAJAPERÚ / DETALLE DE RESERVA</span>
        </div>

        {estado === 'cargando' && (
          <div className="mr-mensaje">
            <div className="mr-spinner" />
            <h2>Cargando tu reserva...</h2>
            <p>Estamos preparando los detalles de tu viaje.</p>
          </div>
        )}

        {estado === 'error' && (
          <div className="mr-mensaje">
            <h2>No pudimos cargar la reserva</h2>
            <p>{error}</p>
            <button className="mr-boton" onClick={cargarReserva}>
              Intentar nuevamente
            </button>
          </div>
        )}

        {estado === 'ok' && reserva && (
          <>
            <header className="mr-encabezado">
              <div>
                <span className="mr-etiqueta">TU PRÓXIMA AVENTURA</span>
                <h1>Detalle de reserva</h1>
                <p>Consulta toda la información de tu experiencia de viaje.</p>
              </div>

              <span className={`mr-estado ${
                pendiente ? 'mr-pendiente' : 'mr-pagada'
              }`}>
                <span />
                {estadoTexto(reserva.estado)}
              </span>
            </header>

            <section className="mr-destino">
              {fotoPaquete ? (
                <img
                  className="mr-foto"
                  src={fotoPaquete}
                  alt={nombrePaquete}
                />
              ) : (
                <div className="mr-foto-vacia">Imagen no disponible</div>
              )}

              <div className="mr-destino-info">
                <span className="mr-etiqueta">TU DESTINO</span>
                <h2>{nombrePaquete}</h2>
                <p>
                  Código de reserva:{' '}
                  <strong>
                    {reserva.codigo || `VP-${String(reserva.id || id).padStart(6, '0')}`}
                  </strong>
                </p>
              </div>
            </section>

            <div className="mr-columnas">
              <div className="mr-columna-principal">

                <section className="mr-seccion">
                  <div className="mr-titulo-seccion">
                    <h2>Información de tu viaje</h2>
                    <p>Detalles principales de tu reserva</p>
                  </div>

                  <div className="mr-info-grid">
                    <Info
                      icono="📅"
                      titulo="Fecha del viaje"
                      valor={fecha(
                        reserva.fecha_inicio_viaje || reserva.fecha_salida
                      )}
                    />

                    <Info
                      icono="👥"
                      titulo="Cantidad de viajeros"
                      valor={reserva.num_personas || reserva.personas || 1}
                    />

                    <Info
                      icono="🧾"
                      titulo="Fecha de reserva"
                      valor={fecha(reserva.creado_en)}
                    />

                    <Info
                      icono="💳"
                      titulo="Fecha de pago"
                      valor={
                        reserva.pagada_en
                          ? fecha(reserva.pagada_en)
                          : 'Pendiente'
                      }
                    />
                  </div>
                </section>

                {Array.isArray(reserva.acompanantes) &&
                  reserva.acompanantes.length > 0 && (
                    <section className="mr-seccion">
                      <div className="mr-titulo-seccion">
                        <h2>Viajeros y acompañantes</h2>
                        <p>Personas incluidas en esta reserva</p>
                      </div>

                      <div className="mr-acompanantes">
                        {reserva.acompanantes.map((persona, i) => (
                          <div className="mr-persona" key={persona.id || i}>
                            <span className="mr-avatar">
                              {(persona.nombres || persona.nombre || 'A')
                                .charAt(0)
                                .toUpperCase()}
                            </span>

                            <div>
                              <strong>
                                {persona.nombres || persona.nombre || 'Acompañante'}{' '}
                                {persona.apellidos || ''}
                              </strong>
                              <span>Viajero {i + 1}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
              </div>

              <aside className="mr-resumen-pago">
                <span className="mr-etiqueta">RESUMEN ECONÓMICO</span>
                <h2>Resumen de tu reserva</h2>

                <div className="mr-total-linea">
                  <span>Importe total</span>
                  <strong>{moneda(reserva.total)}</strong>
                </div>

                <div className="mr-total-linea">
                  <span>Estado</span>
                  <strong>{estadoTexto(reserva.estado)}</strong>
                </div>

                <div className="mr-total-destacado">
                  <span>Total de la reserva</span>
                  <strong>{moneda(reserva.total)}</strong>
                  <small>Importe base en soles peruanos</small>
                </div>

                {pendiente ? (
                  <div className="mr-pago">
                    <h3>Realiza tu pago</h3>
                    <p>Selecciona tu medio de pago y moneda.</p>

                    <label>Medio de pago</label>

                    <div className="mr-opciones">
                      <button
                        type="button"
                        className={`mr-opcion ${metodoPago === 'Tarjeta' ? 'mr-opcion-activa' : ''}`}
                        onClick={() => seleccionarMetodo('Tarjeta')}
                        disabled={pagando || esperandoTarjeta}
                        aria-pressed={metodoPago === 'Tarjeta'}
                      >
                        <span>💳</span>
                        <strong>Tarjeta</strong>
                        <small>Pago seguro con Culqi</small>
                      </button>

                      <button
                        type="button"
                        className={`mr-opcion ${metodoPago === 'Yape' ? 'mr-opcion-activa' : ''}`}
                        onClick={() => seleccionarMetodo('Yape')}
                        disabled={pagando || esperandoTarjeta}
                        aria-pressed={metodoPago === 'Yape'}
                      >
                        <span>📱</span>
                        <strong>Yape</strong>
                        <small>Próximamente</small>
                      </button>
                    </div>

                    {metodoPago === 'Tarjeta' && (
                      <>
                        <label>Moneda de pago</label>

                        <div className="mr-opciones mr-monedas">
                          <button
                            type="button"
                            className={`mr-opcion mr-opcion-moneda ${monedaPago === 'PEN' ? 'mr-opcion-activa' : ''}`}
                            onClick={() => seleccionarMoneda('PEN')}
                            disabled={pagando || esperandoTarjeta}
                            aria-pressed={monedaPago === 'PEN'}
                          >
                            <strong>S/ PEN</strong>
                            <small>Soles peruanos</small>
                          </button>

                          <button
                            type="button"
                            className={`mr-opcion mr-opcion-moneda ${monedaPago === 'USD' ? 'mr-opcion-activa' : ''}`}
                            onClick={() => seleccionarMoneda('USD')}
                            disabled={
                              pagando ||
                              esperandoTarjeta ||
                              !tipoCambio ||
                              cargandoCambio
                            }
                            aria-pressed={monedaPago === 'USD'}
                          >
                            <strong>US$ USD</strong>
                            <small>Dólares</small>
                          </button>
                        </div>

                        {monedaPago === 'USD' && (
                          <div className="mr-cambio">
                            {tipoCambio
                              ? `Tipo de cambio: S/ ${tipoCambio.toFixed(2)} por US$ 1`
                              : 'No hay tipo de cambio disponible.'}
                          </div>
                        )}

                        <div className="mr-cobro">
                          <span>Importe a cobrar</span>
                          <strong>{montoMostrado}</strong>
                        </div>

                        <label htmlFor="mr-correo">Correo electrónico</label>
                        <input
                          id="mr-correo"
                          type="email"
                          value={correo}
                          onChange={(e) => setCorreo(e.target.value)}
                          placeholder="cliente@correo.com"
                          disabled={pagando || esperandoTarjeta}
                        />

                        <button
                          type="button"
                          className="mr-boton mr-boton-pagar"
                          onClick={pagar}
                          disabled={
                            pagando ||
                            esperandoTarjeta ||
                            (monedaPago === 'USD' &&
                              (!tipoCambio || cargandoCambio))
                          }
                        >
                          {esperandoTarjeta
                            ? 'Esperando la tarjeta...'
                            : pagando
                              ? 'Procesando pago...'
                              : 'Pagar con tarjeta →'}
                        </button>

                        <small className="mr-seguridad">
                          🔒 Pago con tarjeta procesado de forma segura mediante Culqi.
                        </small>
                      </>
                    )}

                    {metodoPago === 'Yape' && (
                      <div className="mr-aviso-yape">
                        <span>📱</span>
                        <strong>Yape estará disponible próximamente</strong>
                        <p>
                          Estamos preparando esta opción para que puedas
                          pagar directamente mediante tu QR personal.
                        </p>
                        <small>
                          Por ahora puedes pagar tu reserva con tarjeta.
                        </small>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mr-pago-completo">
                    <span>✓</span>
                    <strong>Reserva pagada</strong>
                    <p>Tu pago ha sido registrado correctamente.</p>
                    <a
                            href={`#/mi-comprobante/${id}`}
                            className="mr-boton-comprobante"
                            >
                            Ver mi comprobante
                        </a>
                  </div>
                )}
              </aside>
            </div>

            {mensaje && (
              <div className="mr-alerta mr-alerta-exito" role="status">
                {mensaje}
              </div>
            )}

            {error && (
              <div className="mr-alerta mr-alerta-error" role="alert">
                {error}
              </div>
            )}

            <footer className="mr-footer">
              <a href="#/mis-reservas">← Regresar a mis reservas</a>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
