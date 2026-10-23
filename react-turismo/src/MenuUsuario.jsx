import { useEffect, useRef, useState } from 'react';
import './menu-usuario.css';
import { useSesion, cerrarSesion } from './auth.js';

const PUEDEN_RESERVAR = ['Recepcionista', 'Gerente'];
const iniciales = (n = '') => n.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

// Colócalo dentro de <nav> en el header de App.jsx
export default function MenuUsuario() {
  const s = useSesion();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
    const tecla = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierto]);

  if (!s) return <a className="btn sm" href="#/login">Iniciar sesión</a>;
  const { nombre, rol } = s.usuario;
  const cerrar = () => setAbierto(false);

  return (
    <div className="vp-cuenta" ref={caja}>
      <button type="button" className="vp-cuenta__boton" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        <span className="vp-avatar" aria-hidden="true">{iniciales(nombre)}</span>
        <span className="vp-cuenta__quien"><strong>{nombre}</strong><small>{rol}</small></span>
        <svg className={'vp-chevron' + (abierto ? ' abierto' : '')} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {abierto && (
        <div className="vp-cuenta__panel" role="menu">
          {PUEDEN_RESERVAR.includes(rol) && (
            <>
              <a role="menuitem" className="vp-item" href="#/paquetes" onClick={cerrar}>Nueva reserva</a>
              <a role="menuitem" className="vp-item" href="#/cobros" onClick={cerrar}>Cobrar reservas</a>
            </>
          )}
          <a role="menuitem" className="vp-item" href="#/cambiar-clave" onClick={cerrar}>Cambiar contraseña</a>
          <hr />
          <button type="button" role="menuitem" className="vp-item vp-item--salir" onClick={() => { cerrar(); cerrarSesion(); }}>
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}