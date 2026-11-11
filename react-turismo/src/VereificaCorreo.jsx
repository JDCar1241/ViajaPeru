import './reservas.css';
import { ultima } from './api-reservas.js';

export default function VerificaCorreo() {
  const correo = ultima.correoRegistro;
  return (
    <main className="vp-centro">
      <div className="vp-panel">
        <h1>Revisa tu correo</h1>
        <p>
          Te enviamos un mensaje de confirmación a <strong>{correo || 'tu correo'}</strong>.
          Confirma tu correo para poder iniciar sesión.
        </p>
        <p className="vp-sub">
          Si no confirmas tu correo en 24 horas, la cuenta se elimina y tendrás que registrarte de nuevo.
        </p>
        <a className="vp-btn" href="#/login">Ir a iniciar sesión</a>
      </div>
    </main>
  );
}