import { useEffect, useRef, useState } from 'react';
import '../../estilos/reservas.css';
import './cambiar-clave.css';
import Campo from '../../componentes/Campo.jsx';
import Icono from '../../componentes/Icono.jsx';
import { criteriosClave, claveValida, CLAVE_MAX } from '../../utils/validaciones.js';
import { pedirCodigoClave, cambiarClave } from '../../servicios/api.js';
import { useSesion } from '../../servicios/auth.js';

// Cambiar contraseña en dos pasos:
//  1. Contraseña actual + nueva  -> el Backend comprueba la actual y envía un código al correo.
//  2. Código de 6 dígitos        -> recién ahí se cambia la contraseña.
const ESPERA_REENVIO = 60; // segundos

export default function CambiarClave() {
  const sesion = useSesion();
  const [paso, setPaso] = useState(1); // 1 datos | 2 código | 3 listo
  const [f, setF] = useState({ actual: '', nueva: '', repetir: '' });
  const [codigo, setCodigo] = useState('');
  const [correo, setCorreo] = useState('');
  const [err, setErr] = useState({});
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [espera, setEspera] = useState(0);
  const campoCodigo = useRef(null);

  useEffect(() => { if (!sesion) window.location.hash = '#/login'; }, [sesion]);

  // Cuenta regresiva para "Reenviar código"
  useEffect(() => {
    if (espera <= 0) return undefined;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  useEffect(() => { if (paso === 2) campoCodigo.current?.focus(); }, [paso]);

  if (!sesion) return null;

  const cambia = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function solicitarCodigo() {
    setEnviando(true);
    setAviso('');
    try {
      const r = await pedirCodigoClave(f.actual);
      setCorreo(r.correo || 'tu correo');
      setCodigo('');
      setEspera(ESPERA_REENVIO);
      setPaso(2);
      return true;
    } catch (ex) {
      if (ex.estado === 422) { setErr({ actual: 'La contraseña actual no es correcta.' }); setPaso(1); }
      else setAviso(ex.message || 'No pudimos enviar el código. Inténtalo de nuevo.');
      return false;
    } finally {
      setEnviando(false);
    }
  }

  function enviarDatos(e) {
    e.preventDefault();
    const n = {};
    if (!f.actual) n.actual = 'Escribe tu contraseña actual.';
    if (!claveValida(f.nueva)) n.nueva = 'La nueva contraseña no cumple los requisitos.';
    else if (f.nueva === f.actual) n.nueva = 'La nueva contraseña debe ser distinta de la actual.';
    if (f.repetir !== f.nueva) n.repetir = 'Las contraseñas nuevas no coinciden.';
    setErr(n);
    setAviso('');
    if (Object.keys(n).length) return;
    solicitarCodigo();
  }

  async function confirmar(e) {
    e.preventDefault();
    setAviso('');
    if (!/^\d{6}$/.test(codigo)) { setErr({ codigo: 'Escribe los 6 dígitos del código.' }); return; }
    setErr({});
    setEnviando(true);
    try {
      await cambiarClave(f.actual, f.nueva, codigo);
      setF({ actual: '', nueva: '', repetir: '' });
      setCodigo('');
      setPaso(3);
    } catch (ex) {
      // 422: código incorrecto (o contraseña actual cambió); 410: venció; 429: demasiados intentos
      if (ex.estado === 422 && /contraseña actual/i.test(ex.message)) { setErr({ actual: ex.message }); setPaso(1); }
      else if (ex.estado === 422) setErr({ codigo: ex.message });
      else setAviso(ex.message || 'No pudimos cambiar la contraseña. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main>
      <div className="cabecera">
        <div>
          <span className="etiqueta">Seguridad de tu cuenta</span>
          <h1>Cambiar contraseña</h1>
          <p>Por seguridad, te enviaremos un código a tu correo para confirmar el cambio.</p>
        </div>
      </div>

      <div className="cc-clave">
        <ol className="cc-pasos" aria-label="Pasos">
          {['Nueva contraseña', 'Código del correo', 'Listo'].map((t, i) => (
            <li key={t} className={paso === i + 1 ? 'actual' : paso > i + 1 ? 'hecho' : ''} aria-current={paso === i + 1 ? 'step' : undefined}>
              <span>{paso > i + 1 ? <Icono nombre="check" tamano={14} /> : i + 1}</span>{t}
            </li>
          ))}
        </ol>

        <section className="tarjeta">
          {aviso && <p className="aviso aviso--error" role="alert">{aviso}</p>}

          {paso === 1 && (
            <form className="cc-form" onSubmit={enviarDatos} noValidate>
              <Campo etiqueta="Contraseña actual" type="password" autoComplete="current-password"
                     value={f.actual} onChange={cambia('actual')} error={err.actual} />
              <Campo etiqueta="Contraseña nueva" type="password" autoComplete="new-password" maxLength={CLAVE_MAX}
                     value={f.nueva} onChange={cambia('nueva')} error={err.nueva} />
              <ul className="cc-requisitos" aria-label="Requisitos de la contraseña">
                {criteriosClave.map((c) => {
                  const ok = c.ok(f.nueva);
                  return (
                    <li key={c.texto} className={ok ? 'ok' : ''}>
                      <Icono nombre={ok ? 'check' : 'x'} tamano={14} /> {c.texto}
                    </li>
                  );
                })}
              </ul>
              <Campo etiqueta="Repite la contraseña nueva" type="password" autoComplete="new-password" maxLength={CLAVE_MAX}
                     value={f.repetir} onChange={cambia('repetir')} error={err.repetir} />
              <button className="btn" disabled={enviando}>
                {enviando ? 'Enviando código…' : 'Enviar código a mi correo'}
              </button>
            </form>
          )}

          {paso === 2 && (
            <form className="cc-form" onSubmit={confirmar} noValidate>
              <p className="cc-explica">
                <Icono nombre="candado" tamano={18} />
                <span>Te enviamos un código de 6 dígitos a <strong>{correo}</strong>. Vence en 10 minutos.</span>
              </p>
              <div className={'vp-campo' + (err.codigo ? ' vp-campo--error' : '')}>
                <label htmlFor="cc-codigo">Código de verificación</label>
                <input
                  id="cc-codigo"
                  ref={campoCodigo}
                  className="cc-codigo"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  aria-invalid={!!err.codigo}
                  aria-describedby={err.codigo ? 'cc-codigo-e' : undefined}
                />
                {err.codigo && <p id="cc-codigo-e" className="vp-error" role="alert">{err.codigo}</p>}
              </div>
              <button className="btn" disabled={enviando || codigo.length !== 6}>
                {enviando ? 'Cambiando…' : 'Cambiar contraseña'}
              </button>
              <div className="cc-secundarias">
                <button type="button" className="cc-enlace" disabled={espera > 0 || enviando} onClick={solicitarCodigo}>
                  {espera > 0 ? `Reenviar código en ${espera} s` : 'Reenviar código'}
                </button>
                <button type="button" className="cc-enlace" onClick={() => { setPaso(1); setErr({}); setAviso(''); }}>
                  Volver
                </button>
              </div>
            </form>
          )}

          {paso === 3 && (
            <div className="cc-listo" role="status">
              <span className="cc-listo__icono"><Icono nombre="check" tamano={28} /></span>
              <h2>Contraseña actualizada</h2>
              <p className="muted">Desde ahora inicia sesión con tu nueva contraseña. Te enviamos un aviso a tu correo.</p>
              <a className="btn" href={sesion.usuario?.rol === 'Cliente' ? '#/mi-cuenta' : '#/paquetes'}>Listo</a>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
