import { useState } from 'react';
import './reservas.css';
import Campo from './Campo.jsx';
import { esCorreo } from './validaciones.js';
import { iniciarSesion } from './api-reservas.js';
import { setSesion } from './auth.js';

export default function Login() {
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
      setSesion(datos); // { token, usuario: { nombre, rol } }
      window.location.hash = '#/paquetes';
    } catch (ex) {
      setFallo(ex.estado === 401 ? 'Correo o contraseña incorrectos. Revisa los datos e inténtalo de nuevo.'
        : 'No pudimos iniciar sesión. Inténtalo en unos minutos.');
    } finally { setEnviando(false); }
  }

  return (
    <main className="vp-centro">
      <form className="vp-panel" onSubmit={enviar} noValidate>
        <h1>Iniciar sesión</h1>
        <p className="vp-sub">Ingresa con tu cuenta de ViajaPeru.</p>
        {fallo && <p className="vp-alerta" role="alert">{fallo}</p>}
        <Campo etiqueta="Correo" type="email" autoComplete="username" value={correo}
          onChange={(e) => setCorreo(e.target.value)} error={err.correo} />
        <Campo etiqueta="Contraseña" type="password" autoComplete="current-password" value={clave}
          onChange={(e) => setClave(e.target.value)} error={err.clave} />
        <button className="vp-btn" disabled={enviando}>{enviando ? 'Ingresando…' : 'Iniciar sesión'}</button>
      </form>
    </main>
  );
}