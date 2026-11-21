import { useCallback, useEffect, useState } from 'react';
import './admin.css';
import { pedir } from '../../servicios/api.js';
import { useSesion } from '../../servicios/auth.js';
import { aInputLima, ahoraLima, fechaHoraLima } from './fechas.js';
import SubirFoto from './SubirFoto.jsx';
import Confirmar from '../../componentes/Confirmar.jsx';
import Icono from '../../componentes/Icono.jsx';

// HU-009 · Crear / editar un paquete y gestionar sus salidas (fechas, cupos y guía).
const VACIO = { nombre: '', destino: '', costo: '', foto_url: '', aclaraciones: '', itinerario: [] };

const enviar = (ruta, method, cuerpo) =>
  pedir(ruta, { method, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });

export default function AdminPaquete({ id }) {
  const sesion = useSesion();
  const esAdmin = sesion?.usuario?.rol === 'Administrador';
  const nuevo = id === 'nuevo';

  const [form, setForm] = useState(VACIO);
  const [salidas, setSalidas] = useState([]);
  const [guias, setGuias] = useState([]);
  const [estado, setEstado] = useState(nuevo ? 'listo' : 'cargando');
  const [error, setError] = useState('');
  const [errores, setErrores] = useState({});
  const [aviso, setAviso] = useState(null); // { ok, texto }
  const [guardando, setGuardando] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [p, g] = await Promise.all([
        nuevo ? null : pedir(`/admin/paquetes/${encodeURIComponent(id)}`),
        pedir('/admin/guias'),
      ]);
      if (p) {
        setForm({
          nombre: p.nombre || '',
          destino: p.destino || '',
          costo: String(p.costo ?? ''),
          foto_url: p.foto_url || '',
          aclaraciones: p.aclaraciones || '',
          itinerario: Array.isArray(p.itinerario) ? p.itinerario : [],
        });
        setSalidas(p.salidas || []);
      }
      setGuias(Array.isArray(g) ? g : []);
      setEstado('listo');
    } catch (e) {
      setError(e.message || 'No pudimos cargar el paquete.');
      setEstado('error');
    }
  }, [id, nuevo]);

  useEffect(() => {
    if (!sesion) { window.location.hash = '#/login'; return; }
    if (esAdmin) cargar();
  }, [sesion, esAdmin, cargar]);

  if (!sesion) return null;
  if (!esAdmin) {
    return <main><div className="error"><strong>Esta sección es solo para administradores.</strong></div></main>;
  }
  if (estado === 'cargando') return <main className="ad-pagina"><div className="skeleton" /></main>;
  if (estado === 'error') {
    return (
      <main className="ad-pagina">
        <div className="error" role="alert"><strong>{error}</strong></div>
        <p><a className="btn sec" href="#/admin/paquetes">Volver al catálogo</a></p>
      </main>
    );
  }

  const cambiar = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  const cambiarActividad = (k, campo, valor) =>
    setForm({ ...form, itinerario: form.itinerario.map((a, i) => (i === k ? { ...a, [campo]: valor } : a)) });
  const agregarActividad = () => setForm({ ...form, itinerario: [...form.itinerario, { hora: '', descripcion: '' }] });
  const quitarActividad = (k) => setForm({ ...form, itinerario: form.itinerario.filter((_, i) => i !== k) });
  const moverActividad = (k, d) => {
    const it = [...form.itinerario];
    [it[k], it[k + d]] = [it[k + d], it[k]];
    setForm({ ...form, itinerario: it });
  };

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setErrores({});
    setAviso(null);
    try {
      const cuerpo = { ...form, costo: Number(form.costo) };
      if (nuevo) {
        const r = await enviar('/admin/paquetes', 'POST', cuerpo);
        window.location.hash = `#/admin/paquete/${r.id}`;
        return;
      }
      await enviar(`/admin/paquetes/${id}`, 'PUT', cuerpo);
      setAviso({ ok: true, texto: 'Cambios guardados.' });
    } catch (err) {
      setErrores(err.errores || {});
      setAviso({ ok: false, texto: err.message });
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    setEliminando(true);
    try {
      await enviar(`/admin/paquetes/${id}`, 'DELETE');
      window.location.hash = '#/admin/paquetes';
    } catch (err) {
      setAviso({ ok: false, texto: err.message });
      setConfirmarEliminar(false);
    } finally {
      setEliminando(false);
    }
  };

  return (
    <main className="ad-pagina">
      <p><a className="vp-enlace" href="#/admin/paquetes">← Catálogo</a></p>
      <h1>{nuevo ? 'Nuevo paquete' : form.nombre || 'Paquete'}</h1>

      <form className="ad-panel" onSubmit={guardar} noValidate>
        <h2>Datos del paquete</h2>

        <div className="ad-grid">
          <Texto etiqueta="Nombre" valor={form.nombre} onChange={cambiar('nombre')} error={errores.nombre} maxLength={120} required />
          <Texto etiqueta="Destino" valor={form.destino} onChange={cambiar('destino')} error={errores.destino} maxLength={80} required />
          <Texto etiqueta="Precio por persona (S/)" valor={form.costo} onChange={cambiar('costo')} error={errores.costo}
                 type="number" min="0.01" step="0.01" inputMode="decimal" required />
        </div>

        <SubirFoto url={form.foto_url} error={errores.foto_url}
                   onChange={(url) => setForm((f) => ({ ...f, foto_url: url }))} />

        <label className="ad-campo">Aclaraciones / información importante
          <textarea rows={4} maxLength={2000} value={form.aclaraciones} onChange={cambiar('aclaraciones')} />
          {errores.aclaraciones && <span className="vp-error">{errores.aclaraciones}</span>}
        </label>

        <fieldset className="ad-itinerario">
          <legend>Itinerario</legend>
          {form.itinerario.length === 0 && <p className="muted">Sin actividades. Agrega la primera.</p>}
          {form.itinerario.map((a, k) => (
            <div className="ad-actividad" key={k}>
              <input aria-label={`Hora de la actividad ${k + 1}`} placeholder="06:00" maxLength={20}
                     value={a.hora} onChange={(e) => cambiarActividad(k, 'hora', e.target.value)} />
              <input aria-label={`Descripción de la actividad ${k + 1}`} placeholder="Recojo del hotel" maxLength={300}
                     value={a.descripcion} onChange={(e) => cambiarActividad(k, 'descripcion', e.target.value)} />
              <div className="ad-actividad__botones">
                <button type="button" className="ad-icono" disabled={k === 0} onClick={() => moverActividad(k, -1)} aria-label="Subir">↑</button>
                <button type="button" className="ad-icono" disabled={k === form.itinerario.length - 1} onClick={() => moverActividad(k, 1)} aria-label="Bajar">↓</button>
                <button type="button" className="ad-icono" onClick={() => quitarActividad(k)} aria-label="Quitar"><Icono nombre="x" tamano={16} /></button>
              </div>
            </div>
          ))}
          {errores.itinerario && <p className="vp-error">{errores.itinerario}</p>}
          <button type="button" className="btn sec sm" onClick={agregarActividad}>Agregar actividad</button>
        </fieldset>

        {aviso && <p className={aviso.ok ? 'vp-ok' : 'vp-alerta'} role="status">{aviso.texto}</p>}

        <div className="ad-acciones">
          <button className="btn" type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : nuevo ? 'Crear paquete' : 'Guardar cambios'}
          </button>
          {!nuevo && <button className="btn sec ad-peligro" type="button" onClick={() => setConfirmarEliminar(true)}>Eliminar paquete</button>}
        </div>
      </form>

      {!nuevo && <Salidas paqueteId={id} salidas={salidas} guias={guias} recargar={cargar} />}

      <Confirmar
        abierto={confirmarEliminar}
        titulo="¿Eliminar este paquete?"
        confirmar="Sí, eliminar paquete"
        volver="No, volver"
        peligro
        ocupado={eliminando}
        onConfirmar={eliminar}
        onCerrar={() => setConfirmarEliminar(false)}
      >
        <p>Se eliminará <strong>{form.nombre}</strong> con todas sus salidas y su foto.</p>
        <p>Si alguna salida ya tuvo reservas no se podrá eliminar: en ese caso desactiva sus salidas. Esta acción no se puede deshacer.</p>
      </Confirmar>
    </main>
  );
}

function Texto({ etiqueta, valor, error, ...props }) {
  return (
    <label className="ad-campo">{etiqueta}
      <input value={valor} aria-invalid={!!error} {...props} />
      {error && <span className="vp-error">{error}</span>}
    </label>
  );
}

// ---------------------------------------------
// Salidas del paquete
// ---------------------------------------------

function Salidas({ paqueteId, salidas, guias, recargar }) {
  const [nueva, setNueva] = useState({ fecha: '', cupos_totales: '', guia_id: '' });
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const accion = async (fn) => {
    setOcupado(true);
    setAviso('');
    try {
      await fn();
      await recargar();
    } catch (e) {
      setAviso(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const programar = (e) => {
    e.preventDefault();
    accion(async () => {
      await enviar(`/admin/paquetes/${paqueteId}/salidas`, 'POST', {
        fecha: nueva.fecha,
        cupos_totales: Number(nueva.cupos_totales),
        guia_id: nueva.guia_id || null,
      });
      setNueva({ fecha: '', cupos_totales: '', guia_id: '' });
    });
  };

  return (
    <section className="ad-panel">
      <h2>Salidas (fechas y cupos)</h2>

      <form className="ad-nueva" onSubmit={programar}>
        <label className="ad-campo">Fecha y hora (Lima)
          <input type="datetime-local" required min={ahoraLima()} value={nueva.fecha}
                 onChange={(e) => setNueva({ ...nueva, fecha: e.target.value })} />
        </label>
        <label className="ad-campo">Cupos
          <input type="number" required min="1" max="500" step="1" value={nueva.cupos_totales}
                 onChange={(e) => setNueva({ ...nueva, cupos_totales: e.target.value })} />
        </label>
        <label className="ad-campo">Guía
          <select value={nueva.guia_id} onChange={(e) => setNueva({ ...nueva, guia_id: e.target.value })}>
            <option value="">Sin asignar</option>
            {guias.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        </label>
        <button className="btn" type="submit" disabled={ocupado}>Programar salida</button>
      </form>

      {aviso && <p className="vp-alerta" role="alert">{aviso}</p>}

      {salidas.length === 0
        ? <p className="muted">Este paquete no tiene salidas. Mientras no tenga una activa y futura, no aparece en el catálogo.</p>
        : (
          <div className="ad-salidas">
            {salidas.map((s) => (
              <Salida key={s.id} s={s} guias={guias} ocupado={ocupado} accion={accion} />
            ))}
          </div>
        )}
    </section>
  );
}

function Salida({ s, guias, ocupado, accion }) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  const reservados = s.cupos_totales - s.cupos_disponibles;
  const pasada = new Date(s.fecha_inicio_viaje) <= new Date();
  const cancelada = s.estado === 'Cancelada';
  const editable = !cancelada && !pasada;

  const abrir = () => {
    setF({ fecha: aInputLima(s.fecha_inicio_viaje), cupos_totales: String(s.cupos_totales), guia_id: s.guia?.id || '' });
    setEditando(true);
  };

  const guardar = (e) => {
    e.preventDefault();
    accion(async () => {
      const cuerpo = { cupos_totales: Number(f.cupos_totales), guia_id: f.guia_id || null };
      if (s.reservas_activas === 0) cuerpo.fecha = f.fecha;
      await enviar(`/admin/salidas/${s.id}`, 'PUT', cuerpo);
      setEditando(false);
    });
  };

  const alternar = () =>
    accion(() => enviar(`/admin/salidas/${s.id}`, 'PUT', { estado: s.estado === 'Activa' ? 'Inactiva' : 'Activa' }));

  const eliminar = () => {
    setConfirmarEliminar(false);
    accion(() => enviar(`/admin/salidas/${s.id}`, 'DELETE'));
  };

  const etiqueta = cancelada ? 'Cancelada' : pasada ? 'Realizada' : s.estado === 'Activa' ? 'A la venta' : 'Inactiva';

  return (
    <article className={'ad-salida' + (editable && s.estado === 'Activa' ? '' : ' ad-salida--apagada')}>
      <div className="ad-salida__cabeza">
        <div>
          <strong className="ad-salida__fecha">{fechaHoraLima(s.fecha_inicio_viaje)}</strong>
          <span className="muted">Guía: {s.guia?.nombre || 'sin asignar'}</span>
        </div>
        <span className={`ad-estado ad-estado--${etiqueta.replace(/\s/g, '').toLowerCase()}`}>{etiqueta}</span>
      </div>

      <p className="ad-salida__cupos">
        <strong>{reservados}</strong> reservados de <strong>{s.cupos_totales}</strong> · {s.cupos_disponibles} disponibles
        {s.cupos_disponibles === 0 && !cancelada && <span className="ad-agotado">Cupos agotados</span>}
      </p>

      {editando ? (
        <form className="ad-nueva" onSubmit={guardar}>
          <label className="ad-campo">Fecha y hora (Lima)
            <input type="datetime-local" required min={ahoraLima()} value={f.fecha}
                   disabled={s.reservas_activas > 0}
                   title={s.reservas_activas > 0 ? 'Tiene reservas: la fecha no se puede cambiar' : undefined}
                   onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          </label>
          <label className="ad-campo">Cupos totales
            <input type="number" required min={Math.max(1, reservados)} max="500" step="1" value={f.cupos_totales}
                   onChange={(e) => setF({ ...f, cupos_totales: e.target.value })} />
          </label>
          <label className="ad-campo">Guía
            <select value={f.guia_id} onChange={(e) => setF({ ...f, guia_id: e.target.value })}>
              <option value="">Sin asignar</option>
              {guias.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
          </label>
          <div className="ad-acciones">
            <button className="btn sm" type="submit" disabled={ocupado}>Guardar</button>
            <button className="btn sec sm" type="button" onClick={() => setEditando(false)}>Cancelar</button>
          </div>
          {s.reservas_activas > 0 && (
            <p className="muted ad-nota">Tiene {s.reservas_activas} reserva(s) activa(s): la fecha no se puede cambiar y los cupos no pueden bajar de {reservados}.</p>
          )}
        </form>
      ) : editable && (
        <div className="ad-acciones">
          <button className="btn sec sm" type="button" onClick={abrir} disabled={ocupado}>Editar</button>
          <button className="btn sec sm" type="button" onClick={alternar} disabled={ocupado}>
            {s.estado === 'Activa' ? 'Desactivar' : 'Activar'}
          </button>
          {s.reservas === 0 && (
            <button className="btn sec sm ad-peligro" type="button" onClick={() => setConfirmarEliminar(true)} disabled={ocupado}>Eliminar</button>
          )}
        </div>
      )}

      <Confirmar
        abierto={confirmarEliminar}
        titulo="¿Eliminar esta salida?"
        confirmar="Sí, eliminar salida"
        volver="No, volver"
        peligro
        onConfirmar={eliminar}
        onCerrar={() => setConfirmarEliminar(false)}
      >
        <p>Se eliminará la salida del <strong>{fechaHoraLima(s.fecha_inicio_viaje)}</strong>. Esta acción no se puede deshacer.</p>
      </Confirmar>
    </article>
  );
}
