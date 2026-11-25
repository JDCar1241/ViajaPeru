import { useCallback, useEffect, useState } from 'react';
import './admin.css';
import '../legal/legal.css';
import { pedir } from '../../servicios/api.js';
import { useSesion } from '../../servicios/auth.js';

// Libro de Reclamaciones: hojas recibidas y su respuesta (máximo 15 días hábiles).
const DOCS = { DNI: 'DNI', CE: 'Carné de extranjería', PASAPORTE: 'Pasaporte' };

const fechaHora = (v) =>
  new Date(v).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' });
const fecha = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-PE', { dateStyle: 'medium', timeZone: 'UTC' });
const soles = (n) => Number(n).toLocaleString('es-PE', { style: 'currency', currency: 'PEN' });

// Días calendario que faltan hasta la fecha límite (negativo = vencida)
function diasRestantes(iso) {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  return Math.round((new Date(`${iso}T00:00:00Z`) - new Date(`${hoy}T00:00:00Z`)) / 864e5);
}

function Plazo({ r }) {
  if (r.estado === 'Respondido') return <span className="estado estado--ok">Respondido</span>;
  const d = diasRestantes(r.fecha_limite);
  if (d < 0) return <span className="estado estado--error">Vencido el {fecha(r.fecha_limite)}</span>;
  if (d <= 3) return <span className="estado estado--aviso">Responder antes del {fecha(r.fecha_limite)}</span>;
  return <span className="estado estado--info">Pendiente · hasta el {fecha(r.fecha_limite)}</span>;
}

function Hoja({ r, onRespondido }) {
  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  async function responder(ev) {
    ev.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const actualizado = await pedir(`/reclamos/${r.id}/respuesta`, {
        method: 'POST',
        body: JSON.stringify({ respuesta: texto }),
      });
      setAviso(actualizado.correo_enviado
        ? `Respuesta enviada a ${r.correo}.`
        : `Respuesta guardada, pero no se pudo enviar el correo a ${r.correo}. Escríbele directamente.`);
      onRespondido(actualizado);
    } catch (e) {
      setError(e.message || 'No se pudo guardar la respuesta.');
    } finally {
      setEnviando(false);
    }
  }

  const datos = [
    ['Documento', `${DOCS[r.tipo_documento] || r.tipo_documento} ${r.numero_documento}`],
    ['Teléfono', r.telefono],
    ['Correo', r.correo],
    ['Domicilio', r.domicilio],
    r.es_menor && ['Apoderado', r.apoderado],
    ['Servicio', `${r.bien_tipo}: ${r.bien_descripcion}`],
    r.codigo_reserva && ['Reserva', r.codigo_reserva],
    r.monto != null && ['Monto reclamado', soles(r.monto)],
  ].filter(Boolean);

  return (
    <article className="tarjeta" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <div>
          <strong style={{ color: 'var(--navy)', fontSize: 17 }}>
            {r.tipo} N.° {r.numero}
          </strong>
          <div className="muted" style={{ fontSize: 14 }}>
            {r.consumidor_nombre} · {fechaHora(r.creado_en)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Plazo r={r} />
          <button type="button" className="btn sm sec" onClick={() => setAbierta(!abierta)} aria-expanded={abierta}>
            {abierta ? 'Ocultar' : r.estado === 'Pendiente' ? 'Ver y responder' : 'Ver'}
          </button>
        </div>
      </div>

      {abierta && (
        <div style={{ marginTop: 20 }}>
          <dl className="datos">
            {datos.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <h3 style={{ margin: '20px 0 6px', color: 'var(--navy)' }}>Detalle</h3>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{r.detalle}</p>
          <h3 style={{ margin: '16px 0 6px', color: 'var(--navy)' }}>Pedido del consumidor</h3>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{r.pedido}</p>

          {r.estado === 'Respondido' ? (
            <>
              <h3 style={{ margin: '16px 0 6px', color: 'var(--ok)' }}>Respuesta · {fechaHora(r.respondido_en)}</h3>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{r.respuesta}</p>
            </>
          ) : (
            <form className="lr-form" onSubmit={responder} style={{ marginTop: 20 }}>
              <label className="fld">
                Respuesta (observaciones y acciones adoptadas). Se enviará a {r.correo}.
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={4000} />
              </label>
              {error && <p className="lr-error" role="alert">{error}</p>}
              <div className="acciones">
                <button className="btn" disabled={enviando || texto.trim().length < 10}>
                  {enviando ? 'Enviando…' : 'Enviar respuesta'}
                </button>
              </div>
            </form>
          )}
          {aviso && <p className="aviso aviso--ok" role="status" style={{ marginTop: 16 }}>{aviso}</p>}
        </div>
      )}
    </article>
  );
}

export default function AdminReclamos() {
  const sesion = useSesion();
  const esAdmin = sesion?.usuario?.rol === 'Administrador';

  const [filtro, setFiltro] = useState('Pendiente');
  const [hojas, setHojas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState('');

  const cargar = useCallback(async (f) => {
    setEstado('cargando');
    setError('');
    try {
      const datos = await pedir('/reclamos' + (f ? '?estado=' + f : ''));
      setHojas(Array.isArray(datos) ? datos : []);
      setEstado('listo');
    } catch (e) {
      setError(e.message || 'No pudimos cargar el Libro de Reclamaciones.');
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    if (!sesion) { window.location.hash = '#/login'; return; }
    if (esAdmin) cargar(filtro);
  }, [sesion, esAdmin, filtro, cargar]);

  if (!sesion) return null;
  if (!esAdmin) {
    return <main><div className="error"><strong>Esta sección es solo para administradores.</strong></div></main>;
  }

  const actualizar = (r) => setHojas((hs) => hs.map((h) => (h.id === r.id ? r : h)));

  return (
    <main className="ad-pagina">
      <div className="cabecera">
        <div>
          <span className="etiqueta">Administración</span>
          <h1>Libro de Reclamaciones</h1>
          <p>Cada hoja debe responderse en un máximo de 15 días hábiles. La respuesta se envía al correo del consumidor.</p>
        </div>
      </div>

      <div className="acciones" style={{ marginTop: 0, marginBottom: 24 }} role="tablist">
        {[['Pendiente', 'Pendientes'], ['Respondido', 'Respondidas'], ['', 'Todas']].map(([v, t]) => (
          <button key={t} type="button" role="tab" aria-selected={filtro === v}
            className={'btn sm' + (filtro === v ? '' : ' sec')} onClick={() => setFiltro(v)}>
            {t}
          </button>
        ))}
      </div>

      {estado === 'cargando' && <div className="skeleton" style={{ height: 160 }} />}

      {estado === 'error' && (
        <div className="error" role="alert">
          <strong>{error}</strong>
          <p><button className="btn sec" onClick={() => cargar(filtro)}>Reintentar</button></p>
        </div>
      )}

      {estado === 'listo' && hojas.length === 0 && (
        <div className="vacio">
          <strong>{filtro === 'Pendiente' ? 'No hay hojas pendientes' : 'No hay hojas'}</strong>
        </div>
      )}

      {estado === 'listo' && hojas.map((r) => <Hoja key={r.id} r={r} onRespondido={actualizar} />)}
    </main>
  );
}
