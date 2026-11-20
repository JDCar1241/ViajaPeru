import { useCallback, useEffect, useState } from 'react';
import './admin.css';
import { pedir } from '../../servicios/api.js';
import { useSesion } from '../../servicios/auth.js';
import { fechaHoraLima, soles } from './fechas.js';

// HU-009 · Listado del catálogo para el Administrador.
export default function AdminPaquetes() {
  const sesion = useSesion();
  const esAdmin = sesion?.usuario?.rol === 'Administrador';

  const [paquetes, setPaquetes] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setError('');
    try {
      const datos = await pedir('/admin/paquetes');
      setPaquetes(Array.isArray(datos) ? datos : []);
      setEstado('listo');
    } catch (e) {
      setError(e.message || 'No pudimos cargar el catálogo.');
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    if (!sesion) { window.location.hash = '#/login'; return; }
    if (esAdmin) cargar();
  }, [sesion, esAdmin, cargar]);

  if (!sesion) return null;
  if (!esAdmin) {
    return <main><div className="error"><strong>Esta sección es solo para administradores.</strong></div></main>;
  }

  const filtro = q.trim().toLowerCase();
  const visibles = filtro
    ? paquetes.filter((p) => `${p.nombre} ${p.destino}`.toLowerCase().includes(filtro))
    : paquetes;

  return (
    <main className="ad-pagina">
      <div className="ad-cabecera">
        <div>
          <h1>Catálogo de paquetes</h1>
          <p className="muted">Crea, edita o retira paquetes y programa sus salidas.</p>
        </div>
        <a className="btn" href="#/admin/paquete/nuevo">Nuevo paquete</a>
      </div>

      <label className="fld ad-buscar">Buscar
        <input type="search" placeholder="Nombre o destino" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>

      {estado === 'cargando' && <div className="skeleton" />}

      {estado === 'error' && (
        <div className="error" role="alert">
          <strong>{error}</strong>
          <p><button className="btn sec" onClick={cargar}>Reintentar</button></p>
        </div>
      )}

      {estado === 'listo' && visibles.length === 0 && (
        <div className="vacio">
          <strong>{paquetes.length ? 'Ningún paquete coincide con la búsqueda' : 'Aún no hay paquetes'}</strong>
          {!paquetes.length && <p className="muted">Crea el primero con "Nuevo paquete".</p>}
        </div>
      )}

      {estado === 'listo' && visibles.length > 0 && (
        <div className="ad-lista">
          {visibles.map((p) => (
            <a key={p.id} className="ad-fila" href={`#/admin/paquete/${p.id}`}>
              {p.foto_url
                ? <img src={p.foto_url} alt="" loading="lazy" />
                : <span className="ad-sinfoto" aria-hidden="true" />}
              <div className="ad-fila__datos">
                <strong>{p.nombre}</strong>
                <span className="muted">{p.destino}</span>
                <span className="ad-meta">
                  {p.salidas_futuras
                    ? `${p.salidas_futuras} salida${p.salidas_futuras === 1 ? '' : 's'} a la venta · próxima ${fechaHoraLima(p.proxima_salida)}`
                    : 'Sin salidas a la venta'}
                </span>
              </div>
              <span className="ad-precio">{soles(p.costo)}</span>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
