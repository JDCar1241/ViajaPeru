import { useEffect, useState } from 'react';
import './reservas.css';
import Campo from './Campo.jsx';
import { esCorreo, esDni, esTelefono, noVacio } from './validaciones.js';
import { pedir, crearReserva, ultima } from './api-reservas.js';
import { useSesion } from './auth.js';

// Ajusta estos nombres si tus columnas se llaman distinto
const C = { id: 'id', fecha: 'fecha_inicio_viaje', cupos: 'cupos_disponibles', estado: 'estado' };
const ROLES = ['Recepcionista', 'Gerente']; // roles que pueden registrar reservas (confirmar)
const fecha = (v) => new Date(v).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
const persona = () => ({ dni: '', apellidos: '', nombres: '' });

export default function Reserva({ paqueteId, salidaId }) {
  const sesion = useSesion();
  const [paquete, setPaquete] = useState(null);
  const [carga, setCarga] = useState('cargando');
  const [cliente, setCliente] = useState({ ...persona(), correo: '', telefono: '' });
  const [acomp, setAcomp] = useState([]);
  const [err, setErr] = useState({});
  const [fallo, setFallo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargar = () => {
    setCarga('cargando');
    pedir('/paquetes/' + paqueteId).then((p) => { setPaquete(p); setCarga('listo'); }).catch(() => setCarga('error'));
  };
  useEffect(() => { if (!sesion) { window.location.hash = '#/login'; return; } cargar(); }, [paqueteId, sesion]);

  if (!sesion) return null;
  if (!ROLES.includes(sesion.usuario.rol)) return <main className="vp-centro"><p className="vp-alerta">Tu rol no puede registrar reservas.</p></main>;
  if (carga === 'cargando') return <main className="vp-centro"><p>Cargando salida…</p></main>;
  if (carga === 'error') return <main className="vp-centro"><p className="vp-alerta">No pudimos cargar el paquete.</p><button className="vp-btn" onClick={cargar}>Reintentar</button></main>;

  const salida = (paquete.salidas || []).find((s) => String(s[C.id]) === String(salidaId));
  const cupos = salida ? Number(salida[C.cupos]) : 0;
  const bloqueada = !salida || salida[C.estado] !== 'Activa' || cupos <= 0;
  const personas = 1 + acomp.length;
  const restantes = cupos - personas;
  const excede = restantes < 0;

  if (bloqueada) return (
    <main className="vp-centro"><div className="vp-panel">
      <h1>Salida no disponible</h1>
      <p>Esta salida no tiene cupos o no está activa. Elige otra fecha.</p>
      <a className="vp-btn" href={'#/paquete/' + paqueteId}>Ver otras salidas</a>
    </div></main>
  );

  const setC = (k) => (e) => setCliente({ ...cliente, [k]: e.target.value });
  const setA = (i, k) => (e) => setAcomp(acomp.map((a, j) => (j === i ? { ...a, [k]: e.target.value } : a)));

  function validar() {
    const n = {};
    const chk = (pre, p) => {
      if (!esDni(p.dni)) n[pre + 'dni'] = 'El DNI tiene 8 dígitos.';
      if (!noVacio(p.apellidos)) n[pre + 'apellidos'] = 'Escribe los apellidos.';
      if (!noVacio(p.nombres)) n[pre + 'nombres'] = 'Escribe los nombres.';
    };
    chk('c.', cliente);
    if (!esCorreo(cliente.correo)) n['c.correo'] = 'Escribe un correo válido.';
    if (!esTelefono(cliente.telefono)) n['c.telefono'] = 'El teléfono tiene 9 dígitos.';
    acomp.forEach((a, i) => chk('a' + i + '.', a));
    return n;
  }

  async function enviar(e) {
    e.preventDefault();
    const n = validar(); setErr(n); setFallo('');
    if (Object.keys(n).length || excede) return;
    setEnviando(true);
    try {
      const r = await crearReserva({ salida_id: salida[C.id], cliente, acompanantes: acomp });
      ultima.datos = { ...r, paquete: paquete.nombre, fecha: salida[C.fecha], cliente, acompanantes: acomp, personas };
      window.location.hash = '#/reserva-confirmada';
    } catch (ex) {
      if (ex.estado === 409) { setFallo('Otra reserva ocupó cupos de esta salida. Revisa los cupos actualizados.'); cargar(); }
      else setFallo(ex.message || 'No pudimos registrar la reserva.');
    } finally { setEnviando(false); }
  }

  const Fila = ({ pre, p, set }) => (
    <div className="vp-fila">
      <Campo etiqueta="DNI" inputMode="numeric" maxLength={8} value={p.dni} onChange={set('dni')} error={err[pre + 'dni']} />
      <Campo etiqueta="Apellidos" value={p.apellidos} onChange={set('apellidos')} error={err[pre + 'apellidos']} />
      <Campo etiqueta="Nombres" value={p.nombres} onChange={set('nombres')} error={err[pre + 'nombres']} />
    </div>
  );

  return (
    <main className="vp-reserva">
      <header>
        <h1>Registrar reserva</h1>
        <p className="vp-sub">{paquete.nombre} · salida del {fecha(salida[C.fecha])}</p>
      </header>

      <form onSubmit={enviar} noValidate>
        <section className="vp-panel">
          <h2>Cliente</h2>
          <Fila pre="c." p={cliente} set={setC} />
          <div className="vp-fila vp-fila--2">
            <Campo etiqueta="Correo" type="email" value={cliente.correo} onChange={setC('correo')} error={err['c.correo']} />
            <Campo etiqueta="Teléfono" type="tel" inputMode="numeric" maxLength={9} value={cliente.telefono} onChange={setC('telefono')} error={err['c.telefono']} />
          </div>
        </section>

        <section className="vp-panel">
          <h2>Acompañantes</h2>
          {acomp.length === 0 && <p className="vp-sub">El cliente viaja solo. Agrega acompañantes si corresponde.</p>}
          {acomp.map((a, i) => (
            <div className="vp-acomp" key={i}>
              <Fila pre={'a' + i + '.'} p={a} set={(k) => setA(i, k)} />
              <button type="button" className="vp-btn vp-btn--borde" onClick={() => setAcomp(acomp.filter((_, j) => j !== i))}>Quitar</button>
            </div>
          ))}
          <button type="button" className="vp-btn vp-btn--borde" disabled={restantes <= 0} onClick={() => setAcomp([...acomp, persona()])}>Agregar acompañante</button>
        </section>

        <aside className={'vp-cupos' + (excede ? ' vp-cupos--excede' : '')} aria-live="polite">
          <div className="vp-asientos" aria-hidden="true">
            {Array.from({ length: Math.min(cupos, 24) }, (_, i) => <i key={i} className={i < personas ? 'ocupa' : ''} />)}
          </div>
          <p><strong>{personas}</strong> {personas === 1 ? 'persona' : 'personas'} de <strong>{cupos}</strong> cupos disponibles
            {excede ? ' — superas los cupos de esta salida.' : ` — quedarán ${restantes}.`}</p>
          {fallo && <p className="vp-alerta" role="alert">{fallo}</p>}
          <button className="vp-btn vp-btn--amarillo" disabled={enviando || excede}>{enviando ? 'Registrando…' : 'Registrar reserva'}</button>
        </aside>
      </form>
    </main>
  );
}