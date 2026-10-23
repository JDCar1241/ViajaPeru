import { useEffect, useState } from 'react';
import { listarPaquetes } from './api';
import { moneda, cupos } from './utils';

const POR_PAGINA = 9; // se envía como limit; offset = (pagina - 1) * limit
const INICIAL = { lugar: '', fecha_desde: '', fecha_hasta: '', orden: 'costo|asc' };

function Tarjeta({ p }) {
  return (
    <article className="card">
      {p.foto_url
        ? <img src={p.foto_url} alt={p.nombre} loading="lazy" />
        : <div className="ph" role="img" aria-label="Sin foto" />}
      <div className="body">
        <h3>{p.nombre}</h3>
        <span className="pill">{cupos(p.cupos_disponibles)}</span>
        <div className="pie">
          <span className="precio">{moneda(p.costo)}</span>
          <a className="btn" href={`#/paquete/${p.id}`}>Ver detalle</a>
        </div>
      </div>
    </article>
  );
}

export default function Catalogo() {
  const q = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const inicial = { ...INICIAL, lugar: q.get('lugar') || '', fecha_desde: q.get('fecha_desde') || '', fecha_hasta: q.get('fecha_hasta') || '' };
  const [borrador, setBorrador] = useState(inicial); // lo que el usuario escribe
  const [filtros, setFiltros] = useState(inicial);   // lo que se envió al Back
  const [pagina, setPagina] = useState(1);
  const [lista, setLista] = useState(null);          // null = cargando
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    const [ordenar_por, orden] = filtros.orden.split('|');
    setLista(null);
    setError(false);
    listarPaquetes({
      lugar: filtros.lugar, fecha_desde: filtros.fecha_desde, fecha_hasta: filtros.fecha_hasta,
      ordenar_por, orden, limit: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA,
    }, ctrl.signal)
      .then(setLista)
      .catch(e => { if (e.name !== 'AbortError') setError(true); });
    return () => ctrl.abort();
  }, [filtros, pagina, intento]);

  const cambiar = e => setBorrador({ ...borrador, [e.target.name]: e.target.value });
  const buscar = e => { e.preventDefault(); setPagina(1); setFiltros(borrador); };

  return (
    <>
      <h1>Encuentra tu próximo viaje</h1>
      <p className="muted" style={{ margin: 0 }}>Solo mostramos salidas activas y futuras.</p>

      <form className="filtros" onSubmit={buscar} role="search">
        <label className="fld lg">Lugar
          <input name="lugar" type="text" placeholder="Ej. Tarapoto" value={borrador.lugar} onChange={cambiar} />
        </label>
        <label className="fld">Fecha desde
          <input name="fecha_desde" type="date" value={borrador.fecha_desde} onChange={cambiar} />
        </label>
        <label className="fld">Fecha hasta
          <input name="fecha_hasta" type="date" value={borrador.fecha_hasta} onChange={cambiar} />
        </label>
        <label className="fld">Ordenar por
          <select name="orden" value={borrador.orden} onChange={cambiar}>
            <option value="costo|asc">Precio (menor a mayor)</option>
            <option value="costo|desc">Precio (mayor a menor)</option>
            <option value="capacidad|desc">Mayor capacidad</option>
          </select>
        </label>
        <button className="btn" type="submit">Buscar</button>
      </form>

      <div aria-live="polite" style={{ marginTop: 28 }}>
        {error && (
          <div className="error" role="alert">
            <strong>No pudimos cargar los paquetes</strong>
            <p className="muted">Revisa tu conexión e inténtalo de nuevo.</p>
            <button className="btn" onClick={() => setIntento(n => n + 1)}>Reintentar</button>
          </div>
        )}

        {!error && lista === null && (
          <div className="grid">{[1, 2, 3].map(i => <div key={i} className="skeleton" />)}</div>
        )}

        {!error && lista && lista.length === 0 && ( // el Back responde [] con 200 OK
          <div className="vacio">
            <strong>No se encontraron paquetes para esta búsqueda</strong>
            <p className="muted">Prueba con otro lugar u otras fechas.</p>
          </div>
        )}

        {!error && lista && lista.length > 0 && (
          <>
            <div className="grid">{lista.map(p => <Tarjeta key={p.id} p={p} />)}</div>
            <nav className="paginacion" aria-label="Paginación">
              <button className="btn sec" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
              <span>Página {pagina}</span>
              <button className="btn sec" disabled={lista.length < POR_PAGINA} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
            </nav>
          </>
        )}
      </div>
    </>
  );
}