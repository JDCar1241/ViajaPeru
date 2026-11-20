import { useCallback, useEffect, useState } from 'react';
import './guia.css';
import { pedir } from '../../servicios/api.js';
import { useSesion } from '../../servicios/auth.js';

// HU-011 · El Guía ve solo las salidas que tiene asignadas, de hoy o de las fechas elegidas.
const ROLES = ['Guia', 'Administrador'];
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }); // YYYY-MM-DD

// Hoy + 2 meses (YYYY-MM-DD). Si el día no existe en ese mes (31 de diciembre -> febrero),
// se usa el último día del mes.
const dentroDeDosMeses = () => {
  const [a, m, d] = hoy().split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(a, m + 2, 0)).getUTCDate();
  return new Date(Date.UTC(a, m + 1, Math.min(d, ultimoDia))).toISOString().slice(0, 10);
};

const fechaHora = (v) =>
  new Date(v).toLocaleString('es-PE', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima',
  });

export default function MisSalidas() {
  const sesion = useSesion();
  const rol = sesion?.usuario?.rol;

  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(dentroDeDosMeses); // por defecto: los próximos 2 meses
  const [salidas, setSalidas] = useState([]);
  const [estado, setEstado] = useState('cargando'); // cargando | listo | error
  const [error, setError] = useState('');

  const cargar = useCallback(async (d, h) => {
    setEstado('cargando');
    setError('');
    try {
      const datos = await pedir(`/guia/salidas?desde=${d}&hasta=${h}`);
      setSalidas(Array.isArray(datos) ? datos : []);
      setEstado('listo');
    } catch (e) {
      setError(e.message || 'No pudimos cargar tus salidas.');
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    if (!sesion) { window.location.hash = '#/login'; return; }
    if (ROLES.includes(rol)) cargar(hoy(), dentroDeDosMeses());
  }, [sesion, rol, cargar]);

  if (!sesion) return null;
  if (!ROLES.includes(rol)) {
    return <main><div className="error"><strong>Esta sección es solo para guías turísticos.</strong></div></main>;
  }

  const buscar = (e) => {
    e.preventDefault();
    cargar(desde, hasta < desde ? desde : hasta);
  };

  const soloHoy = () => {
    setDesde(hoy());
    setHasta(hoy());
    cargar(hoy(), hoy());
  };

  const proximosDosMeses = () => {
    setDesde(hoy());
    setHasta(dentroDeDosMeses());
    cargar(hoy(), dentroDeDosMeses());
  };

  return (
    <main className="gu-pagina">
      <h1>{rol === 'Administrador' ? 'Salidas programadas' : 'Mis salidas'}</h1>
      <p className="muted">
        {rol === 'Administrador'
          ? 'Todas las salidas del rango elegido y su asistencia.'
          : 'Salidas que tienes asignadas. Elige una para registrar la asistencia.'}
      </p>

      <form className="gu-filtros" onSubmit={buscar}>
        <label className="fld">Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} required />
        </label>
        <label className="fld">Hasta
          <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} required />
        </label>
        <button className="btn" type="submit">Ver salidas</button>
        <button className="btn sec" type="button" onClick={soloHoy}>Hoy</button>
        <button className="btn sec" type="button" onClick={proximosDosMeses}>Próximos 2 meses</button>
      </form>

      {estado === 'cargando' && <div className="skeleton" />}

      {estado === 'error' && (
        <div className="error" role="alert">
          <strong>{error}</strong>
          <p><button className="btn sec" onClick={() => cargar(desde, hasta)}>Reintentar</button></p>
        </div>
      )}

      {estado === 'listo' && salidas.length === 0 && (
        <div className="vacio">
          <strong>No tienes salidas asignadas en estas fechas</strong>
          <p className="muted">Prueba con otro rango de fechas.</p>
        </div>
      )}

      {estado === 'listo' && salidas.length > 0 && (
        <div className="gu-salidas">
          {salidas.map((s) => {
            const completo = s.esperados > 0 && s.abordados >= s.esperados;
            return (
              <a key={s.id} className="gu-salida" href={`#/guia/salida/${s.id}`}>
                <div>
                  <span className="gu-fecha">{fechaHora(s.fecha_inicio_viaje)}</span>
                  <strong>{s.paquete?.nombre}</strong>
                  <span className="muted">{s.paquete?.destino}</span>
                  {rol === 'Administrador' && (
                    <span className="gu-guia">Guía: {s.guia?.nombre || 'sin asignar'}</span>
                  )}
                </div>
                <span className={'gu-contador' + (completo ? ' gu-contador--ok' : '')}>
                  {s.abordados}/{s.esperados}
                  <small>abordados</small>
                </span>
              </a>
            );
          })}
        </div>
      )}
    </main>
  );
}
