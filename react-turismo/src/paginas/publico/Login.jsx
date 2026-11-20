import { useState } from 'react';
import '../../estilos/reservas.css';
import Campo from '../../componentes/Campo.jsx';
import { esCorreo } from '../../utils/validaciones.js';
import { iniciarSesion } from '../../servicios/api.js';
import { setSesion } from '../../servicios/auth.js';

// #/login?motivo=compra&volver=%23%2Freservar%2F3%2F7
// "volver" solo se acepta si es una ruta interna (empieza con "#/"), nunca una URL externa.
function leerParametros() {
  const q = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const volver = q.get('volver') || '';
  return {
    motivo: q.get('motivo') || '',
    volver: volver.startsWith('#/') && !volver.startsWith('#/login') ? volver : '',
  };
}

export default function Login() {
  const [{ motivo, volver }] = useState(leerParametros);
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [err, setErr] = useState({});
  const [fallo, setFallo] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    const n = {};
    if (!esCorreo(correo)) n.correo = 'Escribe un correo válido, por ejemplo nombre@empresa.com.';
    if (!clave) n.clave = 'Escribe tu contraseña.';
    setErr(n); setFallo('');
    if (Object.keys(n).length) return;
    setEnviando(true);
    try {
      const datos = await iniciarSesion(correo.trim(), clave);
      setSesion(datos); // { token, usuario: { nombre, rol, nombres?, apellidos? } }
      window.location.hash = volver || '#/paquetes';
    } catch (ex) {
      // 401 = datos incorrectos. Los demás mensajes vienen del servidor
      // (p. ej. "Confirma tu correo…", "Demasiados intentos…", "No pudimos conectar…").
      setFallo(ex.estado === 401
        ? 'Correo o contraseña incorrectos. Revisa los datos e inténtalo de nuevo.'
        : ex.message || 'No pudimos iniciar sesión. Inténtalo en unos minutos.');
    } finally { setEnviando(false); }
  }

  return (
    <main className="vp-centro">
      <form className="vp-panel" onSubmit={enviar} noValidate>
        <h1>Iniciar sesión</h1>
        <p className="vp-sub">Ingresa con tu cuenta de ViajaPeru.</p>
        {motivo === 'compra' && (
          <p className="vp-alerta" role="status">
            Necesitas una cuenta activa para continuar con la compra. Inicia sesión o{' '}
            <a className="vp-enlace" href="#/registro">crea tu cuenta</a>.
          </p>
        )}
        {fallo && <p className="vp-alerta" role="alert">{fallo}</p>}
        <Campo etiqueta="Correo" type="email" autoComplete="username" value={correo}
          onChange={(e) => setCorreo(e.target.value)} error={err.correo} />
        <Campo etiqueta="Contraseña" type="password" autoComplete="current-password" value={clave}
          onChange={(e) => setClave(e.target.value)} error={err.clave} />
        <button className="vp-btn" disabled={enviando}>{enviando ? 'Ingresando…' : 'Iniciar sesión'}</button>
        <p className="vp-sub">¿Eres cliente nuevo? <a className="vp-enlace" href="#/registro">Crear cuenta</a></p>
      </form>
    </main>
  );
}