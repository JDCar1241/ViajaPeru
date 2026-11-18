import { useEffect, useState } from 'react';
import './reservas.css';
import Campo from './Campo.jsx';
import { criteriosClave, claveValida, CLAVE_MAX } from './validaciones.js';
import { cambiarClave } from './api.js';
import { useSesion } from './auth.js';

export default function CambiarClave() {
  const sesion = useSesion();
  const [f, setF] = useState({ actual: '', nueva: '', repetir: '' });
  const [err, setErr] = useState({});
  const [msg, setMsg] = useState({ tipo: '', texto: '' });
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { if (!sesion) window.location.hash = '#/login'; }, [sesion]);
  const cambia = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function enviar(e) {
    e.preventDefault();
    const n = {};
    if (!f.actual) n.actual = 'Escribe tu contraseña actual.';
    if (!claveValida(f.nueva)) n.nueva = 'La nueva contraseña no cumple los criterios.';
    else if (f.nueva === f.actual) n.nueva = 'La nueva contraseña debe ser distinta de la actual.';
    if (f.repetir !== f.nueva) n.repetir = 'Las contraseñas nuevas no coinciden.';
    setErr(n); setMsg({ tipo: '', texto: '' });
    if (Object.keys(n).length) return;
    setEnviando(true);
    try {
      await cambiarClave(f.actual, f.nueva);
      setF({ actual: '', nueva: '', repetir: '' });
      setMsg({ tipo: 'ok', texto: 'Contraseña actualizada.' });
    } catch (ex) {
      // 422 = la contraseña actual no coincide. Un 401 (sesión vencida) ya lo maneja api.js.
      if (ex.estado === 422) setErr({ actual: 'La contraseña actual no es correcta.' });
      else setMsg({ tipo: 'error', texto: ex.message || 'No pudimos cambiar la contraseña. Inténtalo de nuevo.' });
    } finally { setEnviando(false); }
  }

  return (
    <main className="vp-centro">
      <form className="vp-panel" onSubmit={enviar} noValidate>
        <h1>Cambiar contraseña</h1>
        {msg.texto && <p className={msg.tipo === 'ok' ? 'vp-ok' : 'vp-alerta'} role="status">{msg.texto}</p>}
        <Campo etiqueta="Contraseña actual" type="password" autoComplete="current-password" value={f.actual} onChange={cambia('actual')} error={err.actual} />
        <Campo etiqueta="Contraseña nueva" type="password" autoComplete="new-password" maxLength={CLAVE_MAX} value={f.nueva} onChange={cambia('nueva')} error={err.nueva} />
        <ul className="vp-criterios">
          {criteriosClave.map((c) => <li key={c.texto} className={c.ok(f.nueva) ? 'cumple' : ''}>{c.texto}</li>)}
        </ul>
        <Campo etiqueta="Repite la contraseña nueva" type="password" autoComplete="new-password" maxLength={CLAVE_MAX} value={f.repetir} onChange={cambia('repetir')} error={err.repetir} />
        <button className="vp-btn" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar contraseña'}</button>
      </form>
    </main>
  );
}