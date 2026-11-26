import { useState } from 'react';
import '../../estilos/reservas.css';
import './registro.css';
import Campo from '../../componentes/Campo.jsx';
import Telefono from '../../componentes/Telefono.jsx';
import { telefonoValido, separarTelefono, textoLargo, PAIS_POR_DEFECTO } from '../../utils/paises.js';
import { esCorreo, noVacio, criteriosClave, claveValida, CLAVE_MAX } from '../../utils/validaciones.js';
import { pedir, ultima } from '../../servicios/api.js';
import { TIPOS, validarDocumento, limpiarDocumento } from '../../utils/documentos.js';
import { analizarMrz, limpiarMrz } from '../../utils/mrz.js';

// Teléfono con código de país: lista en utils/paises.js (idéntica a la del Backend)

// TIPOS viene de documentos.js; se normaliza por si algún elemento no trae las claves valor/texto
const TIPOS_UI = TIPOS.map((t) => (typeof t === 'string'
  ? { valor: t, texto: t }
  : { valor: t.valor ?? t.value, texto: t.texto ?? t.label ?? t.valor ?? t.value }));

const fechaLarga = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const NOMBRE_DOC = { DNI: 'DNI', CE: 'carné de extranjería', PASAPORTE: 'pasaporte' };

const inicial = {
  tipo: 'DNI', numero: '', nombres: '', paterno: '', materno: '', mrz1: '', mrz2: '',
  correo: '', telefono: '', clave: '', clave2: '', // telefono completo: "+51987654321"
};

export default function Registro() {
  const [f, setF] = useState(inicial);
  const [err, setErr] = useState({});
  const [fallo, setFallo] = useState('');
  const [enviando, setEnviando] = useState(false);

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
    if (!telefonoValido(f.telefono)) {
      // HU: el mensaje debe indicar que la longitud del teléfono es inadecuada.
      const pais = separarTelefono(f.telefono)?.pais || PAIS_POR_DEFECTO;
      n.telefono = f.telefono
        ? `La longitud del teléfono no es la adecuada para el país elegido (${textoLargo(pais)}).`
        : 'Escribe tu teléfono.';
    }
    if (!claveValida(f.clave)) n.clave = 'La contraseña debe tener mínimo 8 caracteres, al menos una letra mayúscula y un número.';
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
        body: JSON.stringify({ ...documento, correo, telefono: f.telefono, clave: f.clave }),
      });
      ultima.correoRegistro = correo;
      window.location.hash = '#/verifica-correo';
    } catch (ex) {
      if (ex.estado === 422) {
        // HU "Comprar paquetes online", caso de prueba: DNI inexistente, que no coincide con
        // los nombres o con longitud inválida -> "Ingrese un DNI válido". El Backend envía el
        // motivo detallado (p. ej. "Los nombres no coinciden"), pero la HU pide este texto.
        if (esPasaporte) setErr({ mrz: ex.message || 'No pudimos validar el pasaporte.' });
        else setErr({ numero: `Ingrese un ${NOMBRE_DOC[f.tipo]} válido.` });
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
              <div className="full">
                <Telefono value={f.telefono} onChange={(t) => setF({ ...f, telefono: t })} error={err.telefono} />
              </div>
            </div>
          </fieldset>

          <fieldset className="rg-seccion">
            <legend><span className="rg-num">3</span>Contraseña</legend>
            <div className="rg-grid">
              <Campo etiqueta="Contraseña" type="password" autoComplete="new-password" maxLength={CLAVE_MAX}
                value={f.clave} onChange={set('clave')} error={err.clave} />
              <Campo etiqueta="Confirmar contraseña" type="password" autoComplete="new-password" maxLength={CLAVE_MAX}
                value={f.clave2} onChange={set('clave2')} error={err.clave2} />
            </div>
            <ul className="rg-reglas">
              {criteriosClave.map((c) => <li key={c.texto} className={c.ok(f.clave) ? 'ok' : ''}>{c.texto}</li>)}
            </ul>
          </fieldset>

          {fallo && <p className="rg-alerta" role="alert">{fallo}</p>}
          <button className="btn rg-enviar" disabled={enviando}>{enviando ? 'Creando cuenta…' : 'Crear cuenta'}</button>
          <p className="rg-pie">¿Ya tienes cuenta? <a href="#/login">Inicia sesión</a></p>
        </form>
      </div>
    </main>
  );
}