import { useEffect, useState } from 'react';
import '../../estilos/reservas.css';
import { confirmarCuenta } from '../../servicios/api.js';
import { setSesion } from '../../servicios/auth.js';

// Al confirmar el correo, Supabase vuelve a la web con uno de estos fragmentos:
//   #access_token=...&refresh_token=...&type=signup     -> cuenta confirmada
//   #error=access_denied&error_code=otp_expired&...      -> enlace vencido o ya usado
// Esta vista inicia la sesión automáticamente y el Backend envía el correo de bienvenida.
// Una sola llamada por token aunque React (StrictMode) ejecute el efecto dos veces:
// así no se envían dos correos de bienvenida.
const enCurso = new Map();
const confirmarUnaVez = (token) => {
  if (!enCurso.has(token)) enCurso.set(token, confirmarCuenta(token));
  return enCurso.get(token);
};

export default function CuentaConfirmada() {
  // Se lee la URL una sola vez, antes de limpiarla.
  const [datos] = useState(() => new URLSearchParams(window.location.hash.slice(1)));
  const [estado, setEstado] = useState('confirmando'); // confirmando | ok | error
  const [mensaje, setMensaje] = useState('');
  const [nombre, setNombre] = useState('');

  useEffect(() => {
    const token = datos.get('access_token');
    let activo = true;

    // Se quita el token de la barra de direcciones (no debe quedar en el historial).
    window.history.replaceState(null, '', window.location.pathname + window.location.search);

    if (!token) {
      setMensaje(
        datos.get('error_code') === 'otp_expired'
          ? 'El enlace de confirmación venció o ya fue usado. Si ya confirmaste tu correo, inicia sesión.'
          : 'No pudimos confirmar tu cuenta con este enlace. Intenta iniciar sesión.'
      );
      setEstado('error');
      return;
    }

    confirmarUnaVez(token)
      .then((r) => {
        if (!activo) return;
        setSesion({ token: r.token, usuario: r.usuario });
        setNombre(r.usuario?.nombres || r.usuario?.nombre || '');
        setEstado('ok');
      })
      .catch((e) => {
        if (!activo) return;
        setMensaje(e.message || 'No pudimos iniciar tu sesión. Intenta iniciar sesión con tu correo.');
        setEstado('error');
      });

    return () => { activo = false; };
  }, [datos]);

  return (
    <main className="vp-centro">
      <div className="vp-panel">
        {estado === 'confirmando' && (
          <>
            <h1>Confirmando tu cuenta…</h1>
            <p className="vp-sub">Un momento, estamos iniciando tu sesión.</p>
          </>
        )}

        {estado === 'ok' && (
          <>
            <h1>¡Bienvenido{nombre ? `, ${nombre.split(' ')[0]}` : ''}!</h1>
            <p className="vp-ok" role="status">Tu correo quedó confirmado y ya iniciaste sesión.</p>
            <p className="vp-sub">Te enviamos un correo de bienvenida.</p>
            <a className="vp-btn" href="#/paquetes">Explorar paquetes</a>
          </>
        )}

        {estado === 'error' && (
          <>
            <h1>No pudimos confirmar tu cuenta</h1>
            <p className="vp-alerta" role="alert">{mensaje}</p>
            <a className="vp-btn" href="#/login">Ir a iniciar sesión</a>
          </>
        )}
      </div>
    </main>
  );
}
