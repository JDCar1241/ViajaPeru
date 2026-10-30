import { useEffect, useState } from 'react';
import './reservas.css';
import Campo from './Campo.jsx';
import { esCorreo, esTelefono, noVacio } from './validaciones.js';
import { pedir, crearReserva, ultima } from './api-reservas.js';
import { useSesion } from './auth.js';
import { TIPOS, validarDocumento, limpiarDocumento, edadAl, validarNacimiento } from './documentos.js';

// Ajusta estos nombres si tus columnas se llaman distinto
const C = { id: 'id', fecha: 'fecha_inicio_viaje', cupos: 'cupos_disponibles', estado: 'estado' };
const ROLES = ['Recepcionista', 'Gerente']; // roles que pueden registrar reservas (confirmar)
const fecha = (v) => new Date(v).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
const persona = () => ({ tipo_documento: 'DNI', nro_documento: '', apellidos: '', nombres: '', fecha_nacimiento: '' });
// Confirmacion.jsx puede seguir leyendo "dni"
const conDni = (p) => ({ ...p, dni: p.nro_documento });

// Documentos que se pueden consultar y la ruta del Backend que los busca.
// Ajusta la clave 'CE' si en documentos.js ese tipo se llama distinto.
const CONSULTA = { DNI: 'dni', CE: 'ce' };
const MSG_VACIO = {
  DNI: 'No encontramos este DNI en la consulta (es normal con menores de edad). Ingresa los datos a mano.',
  CE: 'No encontramos este carnet de extranjería en la consulta. Ingresa los datos a mano.',
};

// FUERA del componente Reserva: si se define dentro, React la recrea en cada tecla y el campo pierde el foco
function Fila({ pre, p, onCambio, err, fechaSalida }) {
  const [busq, setBusq] = useState({ estado: 'idle', msg: '' });
  const esDni = p.tipo_documento === 'DNI';
  const ruta = CONSULTA[p.tipo_documento]; // undefined si el documento no se puede consultar (ej. pasaporte)
  const edad = p.fecha_nacimiento ? edadAl(p.fecha_nacimiento, fechaSalida) : null;

  const cambiarDoc = (cambios) => { setBusq({ estado: 'idle', msg: '' }); onCambio(cambios); };

  async function buscar() {
    if (!ruta) return;
    const invalido = validarDocumento(p.tipo_documento, p.nro_documento);
    if (invalido) return setBusq({ estado: 'error', msg: invalido });
    setBusq({ estado: 'buscando', msg: '' });
    try {
      const r = await pedir('/consultas/' + ruta + '/' + encodeURIComponent(p.nro_documento));
      if (r?.encontrado) {
        onCambio({ apellidos: r.apellidos, nombres: r.nombres });
        setBusq({ estado: 'ok', msg: 'Datos encontrados. Revísalos y corrígelos si hace falta.' });
      } else {
        setBusq({ estado: 'vacio', msg: MSG_VACIO[p.tipo_documento] });
      }
    } catch {
      setBusq({ estado: 'vacio', msg: 'No pudimos hacer la consulta. Ingresa los datos a mano.' });
    }
  }

  return (
    <>
      <div className="vp-fila">
        <Campo etiqueta="Tipo de documento" opciones={TIPOS} value={p.tipo_documento}
          onChange={(e) => cambiarDoc({ tipo_documento: e.target.value, nro_documento: '' })} />
        <Campo etiqueta="Número de documento" autoComplete="off" inputMode={esDni ? 'numeric' : 'text'}
          maxLength={esDni ? 8 : 12} value={p.nro_documento}
          onChange={(e) => cambiarDoc({ nro_documento: limpiarDocumento(p.tipo_documento, e.target.value) })}
          error={err[pre + 'nro_documento']} />
      </div>
      {ruta && (
        <p>
          <button type="button" className="vp-btn vp-btn--borde" onClick={buscar} disabled={busq.estado === 'buscando'}>
            {busq.estado === 'buscando' ? 'Buscando…' : 'Buscar ' + p.tipo_documento}
          </button>
        </p>
      )}
      {busq.msg && <p className="vp-sub" role="status">{busq.msg}</p>}
      <div className="vp-fila">
        <Campo etiqueta="Apellidos" value={p.apellidos} onChange={(e) => onCambio({ apellidos: e.target.value })} error={err[pre + 'apellidos']} />
        <Campo etiqueta="Nombres" value={p.nombres} onChange={(e) => onCambio({ nombres: e.target.value })} error={err[pre + 'nombres']} />
        <Campo etiqueta="Fecha de nacimiento" type="date" value={p.fecha_nacimiento}
          onChange={(e) => onCambio({ fecha_nacimiento: e.target.value })} error={err[pre + 'fecha_nacimiento']} />
      </div>
      {edad !== null && edad >= 0 && edad < 18 && (
        <p className="vp-sub" role="status">Menor de edad ({edad} {edad === 1 ? 'año' : 'años'} a la fecha de la salida).</p>
      )}
    </>
  );
}

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

  const fechaSalida = salida[C.fecha];
  const cambiarC = (cambios) => setCliente((c) => ({ ...c, ...cambios }));
  const cambiarA = (i) => (cambios) => setAcomp((l) => l.map((a, j) => (j === i ? { ...a, ...cambios } : a)));
  const setCampoC = (k) => (e) => cambiarC({ [k]: e.target.value });

  function validar() {
    const n = {};
    const vistos = new Set();
    const chk = (pre, p, esCliente) => {
      const d = validarDocumento(p.tipo_documento, p.nro_documento);
      if (d) n[pre + 'nro_documento'] = d;
      else {
        const clave = p.tipo_documento + ':' + p.nro_documento.toUpperCase();
        if (vistos.has(clave)) n[pre + 'nro_documento'] = 'Este documento está repetido en la reserva.';
        vistos.add(clave);
      }
      if (!noVacio(p.apellidos)) n[pre + 'apellidos'] = 'Escribe los apellidos.';
      if (!noVacio(p.nombres)) n[pre + 'nombres'] = 'Escribe los nombres.';
      const f = validarNacimiento(p.fecha_nacimiento, fechaSalida);
      if (f) n[pre + 'fecha_nacimiento'] = f;
      else if (esCliente && edadAl(p.fecha_nacimiento, fechaSalida) < 18) n[pre + 'fecha_nacimiento'] = 'El cliente que reserva debe ser mayor de edad.';
    };
    chk('c.', cliente, true);
    if (!esCorreo(cliente.correo)) n['c.correo'] = 'Escribe un correo válido.';
    if (!esTelefono(cliente.telefono)) n['c.telefono'] = 'El teléfono tiene 9 dígitos.';
    acomp.forEach((a, i) => chk('a' + i + '.', a, false));
    return n;
  }

  async function enviar(e) {
    e.preventDefault();
    const n = validar(); setErr(n); setFallo('');
    if (Object.keys(n).length || excede) return;
    setEnviando(true);
    try {
      const r = await crearReserva({ salida_id: salida[C.id], cliente, acompanantes: acomp });
      ultima.datos = { ...r, paquete: paquete.nombre, fecha: salida[C.fecha], cliente: conDni(cliente), acompanantes: acomp.map(conDni), personas };
      window.location.hash = '#/reserva-confirmada';
    } catch (ex) {
      if (ex.estado === 409) { setFallo('Otra reserva ocupó cupos de esta salida. Revisa los cupos actualizados.'); cargar(); }
      else setFallo(ex.message || 'No pudimos registrar la reserva.');
    } finally { setEnviando(false); }
  }

  return (
    <main className="vp-reserva">
      <header>
        <h1>Registrar reserva</h1>
        <p className="vp-sub">{paquete.nombre} · salida del {fecha(fechaSalida)}</p>
      </header>

      <form onSubmit={enviar} noValidate>
        <section className="vp-panel">
          <h2>Cliente</h2>
          <Fila pre="c." p={cliente} onCambio={cambiarC} err={err} fechaSalida={fechaSalida} />
          <div className="vp-fila vp-fila--2">
            <Campo etiqueta="Correo" type="email" value={cliente.correo} onChange={setCampoC('correo')} error={err['c.correo']} />
            <Campo etiqueta="Teléfono" type="tel" inputMode="numeric" maxLength={9} value={cliente.telefono} onChange={setCampoC('telefono')} error={err['c.telefono']} />
          </div>
        </section>

        <section className="vp-panel">
          <h2>Acompañantes</h2>
          {acomp.length === 0 && <p className="vp-sub">El cliente viaja solo. Agrega acompañantes si corresponde.</p>}
          {acomp.map((a, i) => (
            <div className="vp-acomp" key={i}>
              <Fila pre={'a' + i + '.'} p={a} onCambio={cambiarA(i)} err={err} fechaSalida={fechaSalida} />
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