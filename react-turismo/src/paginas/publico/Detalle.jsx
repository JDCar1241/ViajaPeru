
import { useEffect, useState } from 'react';
import { obtenerPaquete, obtenerTipoCambio } from '../../servicios/api';
import { moneda, fecha } from '../../utils/utils';
import './Detalle.css';

export default function Detalle({ id }) {
  const [p, setP] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [tipoCambio, setTipoCambio] = useState(null);

  // Obtener los datos del paquete.
  useEffect(() => {
    const ctrl = new AbortController();

    setEstado('cargando');
    setP(null);

    obtenerPaquete(id, ctrl.signal)
      .then(d => {
        if (!d) throw new Error('404');
        setP(d);
        setEstado('ok');
      })
      .catch(e => {
        if (e.name !== 'AbortError') {
          setEstado('error');
        }
      });

    return () => ctrl.abort();
  }, [id]);

  // Obtener el tipo de cambio configurado en el backend.
  useEffect(() => {
    const ctrl = new AbortController();

    setTipoCambio(null);

    obtenerTipoCambio(ctrl.signal)
      .then(data => {
        const tc = Number(data?.usd);

        if (Number.isFinite(tc) && tc >= 1 && tc <= 20) {
          setTipoCambio(tc);
        }
      })
      .catch(e => {
        if (e.name !== 'AbortError') {
          console.error('No se pudo obtener el tipo de cambio:', e);
        }
      });

    return () => ctrl.abort();
  }, []);

  if (estado === 'cargando') {
    return <div className="skeleton" style={{ height: 420 }} />;
  }

  if (estado === 'error') {
    return (
      <div className="error" role="alert">
        <strong>No encontramos este paquete</strong>
        <p>
          <a href="#/paquetes">Volver al catálogo</a>
        </p>
      </div>
    );
  }

  const itinerario = Array.isArray(p.itinerario) ? p.itinerario : [];
  const salidas = Array.isArray(p.salidas) ? p.salidas : [];

  const precio = Number(p.costo);

  const precioDolares =
    tipoCambio && Number.isFinite(precio) && precio >= 0
      ? new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(precio / tipoCambio)
      : null;

  const elegir = (s) => {
    window.location.hash = `#/reservar/${id}/${s.id}`;
  };

  const disponible = (s) =>
    s.estado === 'Activa' && Number(s.cupos_disponibles) > 0;

  return (
    <main className="detalle-page">
      <a href="#/paquetes" className="volver">
        ← Volver al catálogo
      </a>

      <section className="detalle-portada">
        {p.foto_url ? (
          <img
            className="hero"
            src={p.foto_url}
            alt={p.nombre}
          />
        ) : (
          <div className="hero detalle-sin-foto">
            Imagen no disponible
          </div>
        )}
      </section>

      <section className="titulo detalle-titulo">
        <div>
          <span className="detalle-etiqueta">
            DESCUBRE VIAJAPERÚ
          </span>

          <h1>{p.nombre}</h1>

          <p className="muted">
            Conoce todos los detalles de este paquete turístico.
          </p>
        </div>

        <div className="detalle-precio">
          <small>Precio por persona</small>

          <strong>{moneda(p.costo)}</strong>

          {precioDolares ? (
            <span className="detalle-precio-usd">
              {precioDolares}
            </span>
          ) : (
            <span className="detalle-tipo-cambio">
              Precio en dólares no disponible
            </span>
          )}

          {tipoCambio && (
            <small className="detalle-tipo-cambio-info">
              Tipo de cambio: S/ {tipoCambio.toFixed(2)} por dólar
            </small>
          )}
        </div>
      </section>

      <div className="cols detalle-cols">
        <div>
          <section className="panel detalle-panel">
            <div className="detalle-titulo-seccion">
              <span>01</span>
              <h2>Itinerario del viaje</h2>
            </div>

            {itinerario.length ? (
              <ol className="timeline">
                {itinerario.map((i, k) => (
                  <li key={k}>
                    <strong>{i.hora}</strong>
                    <span>{i.descripcion}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">
                Este paquete aún no tiene itinerario publicado.
              </p>
            )}
          </section>

          <section className="panel detalle-panel">
            <div className="detalle-titulo-seccion">
              <span>02</span>
              <h2>Información importante</h2>
            </div>

            <p className="muted detalle-aclaraciones">
              {p.aclaraciones || 'Sin aclaraciones.'}
            </p>
          </section>
        </div>

        <section className="panel detalle-panel detalle-salidas">
          <div className="detalle-titulo-seccion">
            <span>03</span>
            <h2>Salidas programadas</h2>
          </div>

          <p className="muted detalle-descripcion">
            Selecciona la fecha que prefieras para comenzar tu viaje.
          </p>

          {salidas.length ? (
            <div className="detalle-lista-salidas">
              {salidas.map((s, k) => {
                const activa = disponible(s);

                return (
                  <article
                    className="detalle-salida"
                    key={s.id ?? k}
                  >
                    <div className="detalle-salida-info">
                      <small>Fecha de inicio</small>

                      <strong>
                        {fecha(s.fecha_inicio_viaje)}
                      </strong>

                      <span
                        className={
                          activa
                            ? 'detalle-cupos'
                            : 'detalle-agotado'
                        }
                      >
                        {activa
                          ? `${s.cupos_disponibles} cupos disponibles`
                          : 'Sin disponibilidad'}
                      </span>
                    </div>

                    <button
                      className="btn detalle-btn"
                      disabled={!activa}
                      onClick={() => elegir(s)}
                      aria-label={`Elegir la salida del ${fecha(s.fecha_inicio_viaje)}`}
                    >
                      {activa ? 'Reservar' : 'Agotado'}
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="muted detalle-vacio">
              No hay salidas disponibles por ahora.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
