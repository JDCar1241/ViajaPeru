import { useEffect, useState } from 'react';
import { obtenerPaquete } from './api';
import { moneda, fecha } from './utils';

export default function Detalle({ id }) {
  const [p, setP] = useState(null);
  const [estado, setEstado] = useState('cargando'); // cargando | ok | error

  useEffect(() => {
    const ctrl = new AbortController();
    setEstado('cargando');
    obtenerPaquete(id, ctrl.signal)
      .then(d => { if (!d) throw new Error('404'); setP(d); setEstado('ok'); })
      .catch(e => { if (e.name !== 'AbortError') setEstado('error'); });
    return () => ctrl.abort();
  }, [id]);

  if (estado === 'cargando') return <div className="skeleton" style={{ height: 420 }} />;
  if (estado === 'error') {
    return (
      <div className="error" role="alert">
        <strong>No encontramos este paquete</strong>
        <p><a href="#/paquetes">Volver al catálogo</a></p>
      </div>
    );
  }

  const itinerario = Array.isArray(p.itinerario) ? p.itinerario : [];
  const salidas = p.salidas || [];

  return (
    <>
      <a href="#/paquetes" className="volver">← Volver al catálogo</a>
      {p.foto_url
        ? <img className="hero" src={p.foto_url} alt={p.nombre} />
        : <div className="hero" role="img" aria-label="Sin foto" />}
      <div className="titulo">
        <h1 style={{ margin: 0 }}>{p.nombre}</h1>
        <strong style={{ fontSize: 30 }}>{moneda(p.costo)}</strong>
      </div>

      <div className="cols">
        <div>
          <section className="panel">
            <h2>Itinerario</h2>
            {itinerario.length ? (
              <ol className="timeline">
                {itinerario.map((i, k) => (
                  <li key={k}><strong>{i.hora}</strong><span>{i.descripcion}</span></li>
                ))}
              </ol>
            ) : <p className="muted">Este paquete aún no tiene itinerario publicado.</p>}
          </section>
          <section className="panel">
            <h2>Aclaraciones</h2>
            <p className="muted" style={{ lineHeight: 1.6, margin: 0 }}>{p.aclaraciones || 'Sin aclaraciones.'}</p>
          </section>
        </div>

        <section className="panel">
          <h2>Salidas programadas</h2>
          {salidas.length ? (
            <div className="scroll">
              <table>
                <thead><tr><th>Fecha de inicio</th><th>Cupos</th><th /></tr></thead>
                <tbody>
                  {salidas.map((s, k) => (
                    <tr key={k}>
                      <td><strong>{fecha(s.fecha_inicio_viaje)}</strong></td>
                      <td>{s.cupos_disponibles}</td>
                      <td><button className="btn" style={{ padding: '8px 14px' }}>Elegir</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted">No hay salidas disponibles por ahora.</p>}
        </section>
      </div>
    </>
  );
}