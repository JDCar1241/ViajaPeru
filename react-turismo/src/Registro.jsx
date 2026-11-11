import { useState } from 'react';
import './reservas.css';
import './registro.css';
import Campo from './Campo.jsx';
import { esCorreo, noVacio } from './validaciones.js';
import { pedir, ultima } from './api-reservas.js';
import { TIPOS, validarDocumento, limpiarDocumento } from './documentos.js';
import { analizarMrz, limpiarMrz } from './mrz.js';

// Dígitos del número nacional por código de país (sin el código).
// Son valores de referencia: confírmalos con el equipo y ajusta los que haga falta.
const PAISES = [
  { cod: '+51', nombre: 'Perú', largo: 9 },
  { cod: '+1', nombre: 'Estados Unidos / Canadá', largo: 10 },
  { cod: '+34', nombre: 'España', largo: 9 },
  { cod: '+52', nombre: 'México', largo: 10 },
  { cod: '+54', nombre: 'Argentina', largo: 10 },
  { cod: '+55', nombre: 'Brasil', largo: 11 },
  { cod: '+56', nombre: 'Chile', largo: 9 },
  { cod: '+57', nombre: 'Colombia', largo: 10 },
  { cod: '+58', nombre: 'Venezuela', largo: 10 },
  { cod: '+591', nombre: 'Bolivia', largo: 8 },
  { cod: '+593', nombre: 'Ecuador', largo: 9 },
];
const OPCIONES_PAIS = PAISES.map((p) => ({ valor: p.cod, texto: `${p.nombre} (${p.cod})` }));

// TIPOS viene de documentos.js; se normaliza por si algún elemento no trae las claves valor/texto
const TIPOS_UI = TIPOS.map((t) => (typeof t === 'string'
  ? { valor: t, texto: t }
  : { valor: t.valor ?? t.value, texto: t.texto ?? t.label ?? t.valor ?? t.value }));

// Política de contraseña: mínimo 8 caracteres, una mayúscula y un número
const REGLAS_CLAVE = [
  ['Mínimo 8 caracteres', (c) => c.length >= 8],
  ['Una mayúscula', (c) => /[A-Z]/.test(c)],
  ['Un número', (c) => /\d/.test(c)],
];
const claveOk = (c) => REGLAS_CLAVE.every(([, ok]) => ok(c));
const fechaLarga = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const NOMBRE_DOC = { DNI: 'DNI', CE: 'carné de extranjería', PASAPORTE: 'pasaporte' };

const inicial = {
  tipo: 'DNI', numero: '', nombres: '', paterno: '', materno: '', mrz1: '', mrz2: '',
  correo: '', pais: '+51', telefono: '', clave: '', clave2: '',
};

export default function Registro() {
  const [f, setF] = useState(inicial);
  const [ver, setVer] = useState(false);
  const [err, setErr] = useState({});
  const [fallo, setFallo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const pais = PAISES.find((p) => p.cod === f.pais) || PAISES[0];
  const esPasaporte = f.tipo === 'PASAPORTE';
  const esDni = f.tipo === 'DNI';
  const mrz = esPasaporte ? analizarMrz(f.mrz1, f.mrz2) : null; // se recalcula en cada tecla

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const cambiarTipo = (valor) => {
    setF({ ...f, tipo: valor, numero: '', nombres: '', paterno: '', materno: '', mrz1: '', mrz2: '' });
    setErr({}); setFallo('');
  };

  // Línea 1 de la MRZ: si pegan las dos líneas juntas, se reparten solas
  const cambiarMrz1 = (e) => {
    const v = limpiarMrz(e.target.value).slice(0, 88);
    setF({ ...f, mrz1: v.slice(0, 44), mrz2: v.length > 44 ? v.slice(44, 88) : f.mrz2 });
  };
  const cambiarMrz2 = (e) => setF({ ...f, mrz2: limpiarMrz(e.target.value).slice(0, 44) });

  function validar() {
    const n = {};
    if (esPasaporte) {
      if (!mrz?.ok) n.mrz = mrz?.incompleto ? 'Escribe las dos líneas de la zona MRZ (44 caracteres cada una).' : 'Revisa la zona MRZ del pasaporte.';
    } else {
      if (validarDocumento(f.tipo, f.numero)) n.numero = `Ingrese un ${NOMBRE_DOC[f.tipo]} válido.`;
      if (!noVacio(f.nombres)) n.nombres = 'Escribe tus nombres.';
      if (!noVacio(f.paterno)) n.paterno = 'Escribe tu apellido paterno.';
      if (esDni && !noVacio(f.materno)) n.materno = 'Escribe tu apellido materno.';
    }
    if (!esCorreo(f.correo)) n.correo = 'Escribe un correo válido.';
    if (!new RegExp(`^\\d{${pais.largo}}$`).test(f.telefono)) {
      n.telefono = `El teléfono de ${pais.nombre} debe tener ${pais.largo} dígitos.`;
    }
    if (!claveOk(f.clave)) n.clave = 'La contraseña debe tener mínimo 8 caracteres, al menos una letra mayúscula y un número.';
    if (f.clave !== f.clave2) n.clave2 = 'Las contraseñas no coinciden.';
    return n;
  }

  async function enviar(e) {
    e.preventDefault();
    const n = validar(); setErr(n); setFallo('');
    if (Object.keys(n).length) return;
    setEnviando(true);
    try {
      const correo = f.correo.trim().toLowerCase();
      const documento = esPasaporte
        ? { tipo_documento: 'PASAPORTE', mrz: [f.mrz1, f.mrz2] } // el Backend vuelve a validar y toma los datos de la MRZ
        : {
            tipo_documento: f.tipo,
            numero_documento: f.numero.trim(),
            nombres: f.nombres.trim(),
            apellido_paterno: f.paterno.trim(),
            apellido_materno: f.materno.trim(),
          };
      await pedir('/clientes/registro', {
        method: 'POST',
        body: JSON.stringify({ ...documento, correo, telefono: pais.cod + f.telefono, clave: f.clave }),
      });
      ultima.correoRegistro = correo;
      window.location.hash = '#/verifica-correo';
    } catch (ex) {
      if (ex.estado === 422) {
        setErr(esPasaporte ? { mrz: ex.message || 'No pudimos validar el pasaporte.' } : { numero: `Ingrese un ${NOMBRE_DOC[f.tipo]} válido.` });
      } else if (ex.estado === 409 && /correo/i.test(ex.message)) setErr({ correo: ex.message });
      else setFallo(ex.message || 'No pudimos crear la cuenta. Inténtalo de nuevo.');
    } finally { setEnviando(false); }
  }

  return (
    <main>
      <div className="rg">
        <aside className="rg-lado">
          <h1>Crea tu cuenta</h1>
          <p>Necesitas una cuenta para reservar y pagar tus paquetes en línea.</p>
          <ul className="rg-lista">
            <li>Reserva tu próxima salida</li>
            <li>Paga en línea</li>
            <li>Confirmación en tu correo</li>
          </ul>
        </aside>

        <form className="rg-form" onSubmit={enviar} noValidate>
          <fieldset className="rg-seccion">
            <legend><span className="rg-num">1</span>Tu documento</legend>

            <div className="rg-tipos" role="radiogroup" aria-label="Tipo de documento">
              {TIPOS_UI.map((t) => (
                <label key={t.valor} className={'rg-tipo' + (f.tipo === t.valor ? ' sel' : '')}>
                  <input type="radio" name="tipo" value={t.valor} checked={f.tipo === t.valor} onChange={() => cambiarTipo(t.valor)} />
                  {t.texto}
                </label>
              ))}
            </div>

            {!esPasaporte && (
              <>
                <div className="rg-grid">
                  <div className="full">
                    <Campo etiqueta="Número de documento" autoComplete="off" inputMode={esDni ? 'numeric' : 'text'}
                      maxLength={esDni ? 8 : 12} value={f.numero}
                      onChange={(e) => setF({ ...f, numero: limpiarDocumento(f.tipo, e.target.value) })} error={err.numero} />
                  </div>
                  <div className="full">
                    <Campo etiqueta="Nombres" autoComplete="given-name" value={f.nombres} onChange={set('nombres')} error={err.nombres} />
                  </div>
                  <Campo etiqueta="Apellido paterno" value={f.paterno} onChange={set('paterno')} error={err.paterno} />
                  <Campo etiqueta={esDni ? 'Apellido materno' : 'Apellido materno (si tienes)'} value={f.materno} onChange={set('materno')} error={err.materno} />
                </div>
                <p className="rg-nota">
                  {esDni
                    ? 'Validamos tu DNI con RENIEC: los nombres y apellidos deben coincidir con tu documento.'
                    : 'Validamos tu carné de extranjería en la base de Migraciones: los nombres y apellidos deben coincidir con tu documento.'}
                </p>
              </>
            )}

            {esPasaporte && (
              <>
                <p className="rg-nota">
                  Copia las <strong>dos líneas de letras, números y símbolos «&lt;»</strong> que están al pie de la página de datos de tu pasaporte.
                  Tomaremos tus datos de ahí. Puedes pegar las dos líneas juntas en la primera casilla.
                </p>
                <div className="rg-grid rg-mrz">
                  <div className="full">
                    <Campo etiqueta="Línea 1 de la MRZ" autoComplete="off" spellCheck={false} autoCapitalize="characters"
                      maxLength={88} value={f.mrz1} onChange={cambiarMrz1} />
                  </div>
                  <div className="full">
                    <Campo etiqueta="Línea 2 de la MRZ" autoComplete="off" spellCheck={false} autoCapitalize="characters"
                      maxLength={44} value={f.mrz2} onChange={cambiarMrz2} error={err.mrz} />
                  </div>
                </div>
                {mrz?.incompleto && (f.mrz1 || f.mrz2) && (
                  <p className="rg-ayuda" role="status">Cada línea debe tener 44 caracteres (llevas {f.mrz1.length} y {f.mrz2.length}).</p>
                )}
                {mrz && !mrz.incompleto && !mrz.ok && mrz.errores.map((m) => <p key={m} className="rg-alerta" role="alert">{m}</p>)}
                {mrz?.ok && (
                  <div className="rg-leido" role="status">
                    <strong>Datos leídos de tu pasaporte</strong>
                    <span>Pasaporte N.º {mrz.datos.numero} · {mrz.datos.nacionalidad}</span>
                    <span>{mrz.datos.nombres} {mrz.datos.apellidos}</span>
                    <span>Nacimiento: {fechaLarga(mrz.datos.fecha_nacimiento)} · Vence: {fechaLarga(mrz.datos.vence)}</span>
                  </div>
                )}
                <p className="rg-ayuda">Comprobamos que los dígitos de control de la MRZ cuadren. Esto detecta errores al escribirla; no certifica que el documento sea auténtico.</p>
              </>
            )}
          </fieldset>

          <fieldset className="rg-seccion">
            <legend><span className="rg-num">2</span>Contacto</legend>
            <div className="rg-grid">
              <div className="full">
                <Campo etiqueta="Correo electrónico" type="email" autoComplete="email" value={f.correo} onChange={set('correo')} error={err.correo} />
              </div>
              <Campo etiqueta="País" opciones={OPCIONES_PAIS} value={f.pais}
                onChange={(e) => setF({ ...f, pais: e.target.value, telefono: '' })} />
              <Campo etiqueta="Teléfono" type="tel" autoComplete="tel-national" inputMode="numeric" maxLength={pais.largo}
                value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value.replace(/\D/g, '').slice(0, pais.largo) })}
                error={err.telefono} />
            </div>
          </fieldset>

          <fieldset className="rg-seccion">
            <legend><span className="rg-num">3</span>Contraseña</legend>
            <div className="rg-grid">
              <Campo etiqueta="Contraseña" type={ver ? 'text' : 'password'} autoComplete="new-password" value={f.clave} onChange={set('clave')} error={err.clave} />
              <Campo etiqueta="Confirmar contraseña" type={ver ? 'text' : 'password'} autoComplete="new-password" value={f.clave2} onChange={set('clave2')} error={err.clave2} />
            </div>
            <ul className="rg-reglas">
              {REGLAS_CLAVE.map(([t, ok]) => <li key={t} className={ok(f.clave) ? 'ok' : ''}>{t}</li>)}
            </ul>
            <label className="rg-ver">
              <input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} /> Mostrar contraseñas
            </label>
          </fieldset>

          {fallo && <p className="rg-alerta" role="alert">{fallo}</p>}
          <button className="btn rg-enviar" disabled={enviando}>{enviando ? 'Creando cuenta…' : 'Crear cuenta'}</button>
          <p className="rg-pie">¿Ya tienes cuenta? <a href="#/login">Inicia sesión</a></p>
        </form>
      </div>
    </main>
  );
}