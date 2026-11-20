import '../../estilos/reservas.css';
import { ultima } from '../../servicios/api.js';

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
          ¿No te llegó? Revisa la carpeta de spam o correo no deseado. El enlace de confirmación vence después de un tiempo.
        </p>
        <a className="vp-btn" href="#/login">Ir a iniciar sesión</a>
      </div>
    </main>
  );
}