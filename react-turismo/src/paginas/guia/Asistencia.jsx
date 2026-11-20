import { useCallback, useEffect, useRef, useState } from 'react';
import './guia.css';
import { pedir } from '../../servicios/api.js';
import { useSesion } from '../../servicios/auth.js';

// HU-011 · Lista de pasajeros de una salida y check-in en el punto de encuentro.
// - Contador esperados vs. abordados que cambia al instante al marcar.
// - Cada marca se guarda en la base en ese momento.
// - La lista se vuelve a leer cada 10 s para ver lo que marquen otros guías.
const ROLES = ['Guia', 'Administrador'];
const REFRESCO_MS = 10_000;

const claveDe = (p) => `${p.reserva_id}:${p.acompanante_id ?? 'T'}`;

// Sin tildes y en minúsculas, para buscar "pérez" escribiendo "perez"
const normal = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const hora = (v) =>
  new Date(v).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });

export default function Asistencia({ id }) {
  const sesion = useSesion();
  const rol = sesion?.usuario?.rol;

  const [pasajeros, setPasajeros] = useState([]);
  const [estado, setEstado] = useState('cargando'); // cargando | listo | error
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState({}); // clave -> true mientras se guarda
  const guardandoRef = useRef({});

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setEstado('cargando');
    try {
      const datos = await pedir(`/guia/salidas/${id}/pasajeros`);
      const lista = Array.isArray(datos) ? datos : [];

      // No pisar una marca que todavía se está guardando
      setPasajeros((previos) => {
        const enCurso = guardandoRef.current;
        if (!Object.keys(enCurso).length) return lista;
        const porClave = Object.fromEntries(previos.map((p) => [claveDe(p), p]));
        return lista.map((p) => (enCurso[claveDe(p)] ? porClave[claveDe(p)] || p : p));
      });
      setEstado('listo');
      setError('');
    } catch (e) {
      if (!silencioso) {
        setError(e.message || 'No pudimos cargar la lista de pasajeros.');
        setEstado('error');
      }
    }
  }, [id]);

  useEffect(() => {
    if (!sesion) { window.location.hash = '#/login'; return; }
    if (!ROLES.includes(rol)) return;

    cargar();
    const reloj = setInterval(() => {
      if (document.visibilityState === 'visible') cargar(true);
    }, REFRESCO_MS);
    return () => clearInterval(reloj);
  }, [sesion, rol, cargar]);

  if (!sesion) return null;
  if (!ROLES.includes(rol)) {
    return <main><div className="error"><strong>Esta sección es solo para guías turísticos.</strong></div></main>;
  }

  async function marcar(p) {
    const clave = claveDe(p);
    if (guardandoRef.current[clave]) return;

    const presente = !p.asistencia_en;
    const antes = p.asistencia_en;

    // Cambio inmediato en pantalla (el contador se actualiza al instante)
    guardandoRef.current = { ...guardandoRef.current, [clave]: true };
    setGuardando(guardandoRef.current);
    setAviso('');
    setPasajeros((lista) => lista.map((x) => (
      claveDe(x) === clave ? { ...x, asistencia_en: presente ? new Date().toISOString() : null } : x
    )));

    try {
      const r = await pedir(`/guia/salidas/${id}/asistencia`, {
        method: 'POST',
        body: JSON.stringify({
          reserva_id: p.reserva_id,
          acompanante_id: p.acompanante_id,
          presente,
        }),
      });
      // Hora real guardada por la base
      setPasajeros((lista) => lista.map((x) => (
        claveDe(x) === clave ? { ...x, asistencia_en: r?.asistencia_en ?? null } : x
      )));
    } catch (e) {
      // Si no se guardó, se deshace en pantalla
      setPasajeros((lista) => lista.map((x) => (claveDe(x) === clave ? { ...x, asistencia_en: antes } : x)));
      setAviso(`No se guardó la asistencia de ${p.nombres} ${p.apellidos}: ${e.message || 'inténtalo de nuevo.'}`);
    } finally {
      const { [clave]: _, ...resto } = guardandoRef.current;
      guardandoRef.current = resto;
      setGuardando(resto);
    }
  }

  const esperados = pasajeros.length;
  const abordados = pasajeros.filter((p) => p.asistencia_en).length;
  const porcentaje = esperados ? Math.round((abordados / esperados) * 100) : 0;

  const q = normal(busqueda.trim());
  const visibles = q
    ? pasajeros.filter((p) =>
        normal(p.numero_documento).includes(q) ||
        normal(p.apellidos).includes(q) ||
        normal(p.nombres).includes(q) ||
        normal(p.titular).includes(q))
    : pasajeros;

  return (
    <main className="gu-pagina">
      <a className="volver" href="#/guia">← Mis salidas</a>
      <h1>Asistencia de pasajeros</h1>

      {estado === 'cargando' && <div className="skeleton" />}

      {estado === 'error' && (
        <div className="error" role="alert">
          <strong>{error}</strong>
          <p><button className="btn sec" onClick={() => cargar()}>Reintentar</button></p>
        </div>
      )}

      {estado === 'listo' && (
        <>
          <section className="gu-resumen" aria-live="polite">
            <div className="gu-resumen__cifras">
              <div><strong>{esperados}</strong><span>Esperados</span></div>
              <div><strong>{abordados}</strong><span>Abordados</span></div>
              <div><strong>{esperados - abordados}</strong><span>Pendientes</span></div>
            </div>
            <div className="gu-barra" role="progressbar" aria-valuemin={0} aria-valuemax={esperados} aria-valuenow={abordados}>
              <i style={{ width: `${porcentaje}%` }} />
            </div>
          </section>

          <label className="fld gu-buscador">Buscar pasajero
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="DNI o apellido"
              inputMode="search"
              autoComplete="off"
            />
          </label>

          {aviso && <p className="cb-error" role="alert">{aviso}</p>}

          {esperados === 0 && (
            <div className="vacio">
              <strong>Esta salida aún no tiene pasajeros con reserva pagada</strong>
            </div>
          )}

          {esperados > 0 && visibles.length === 0 && (
            <div className="vacio"><strong>No hay pasajeros que coincidan con «{busqueda}»</strong></div>
          )}

          <ul className="gu-lista">
            {visibles.map((p) => {
              const clave = claveDe(p);
              const presente = Boolean(p.asistencia_en);
              return (
                <li key={clave} className={'gu-pasajero' + (presente ? ' gu-pasajero--presente' : '')}>
                  <div className="gu-pasajero__datos">
                    <strong>{p.apellidos} {p.nombres}</strong>
                    <span>{p.tipo_documento} {p.numero_documento}</span>
                    <span className="muted">
                      {p.es_titular ? 'Titular' : `Acompañante de ${p.titular}`}
                      {p.es_menor ? ' · Menor de edad' : ''} · {p.codigo}
                    </span>
                  </div>

                  <div className="gu-pasajero__accion">
                    <span className={'gu-estado' + (presente ? ' gu-estado--presente' : '')}>
                      {presente ? `Presente · ${hora(p.asistencia_en)}` : 'Pendiente'}
                    </span>
                    <button
                      type="button"
                      className={'btn sm' + (presente ? ' sec' : '')}
                      onClick={() => marcar(p)}
                      disabled={Boolean(guardando[clave])}
                      aria-pressed={presente}
                    >
                      {presente ? 'Deshacer' : 'Check-in'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
