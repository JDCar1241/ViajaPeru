
import { useEffect, useRef, useState } from 'react';
import './menu-usuario.css';
import { useSesion, cerrarSesion } from '../servicios/auth.js';
import { nombreCorto } from '../utils/utils.js';

const PUEDEN_RESERVAR = ['Recepcionista', 'Administrador'];

const iniciales = (n = '') =>
  n.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '?';

export default function MenuUsuario() {
  const s = useSesion();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);

  useEffect(() => {
    if (!abierto) return;

    const fuera = (e) => {
      if (caja.current && !caja.current.contains(e.target)) {
        setAbierto(false);
      }
    };

    const tecla = (e) => {
      if (e.key === 'Escape') setAbierto(false);
    };

    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);

    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  if (!s) {
    return (
      <a className="btn sm" href="#/login">
        Iniciar sesión
      </a>
    );
  }

  const usuario = s.usuario || {};
  const nombre = usuario.nombre || usuario.nombres || 'Usuario';
  const rol = usuario.rol || '';
  const corto = nombreCorto(usuario);
  const esCliente = rol === 'Cliente';
  const esPersonal = PUEDEN_RESERVAR.includes(rol);
  const veSalidas = rol === 'Guia' || rol === 'Administrador'; // HU-011

  const cerrar = () => setAbierto(false);

  const salir = () => {
    cerrar();
    cerrarSesion();
  };

  return (
    <div className="vp-cuenta" ref={caja}>
      <button
        type="button"
        className="vp-cuenta__boton"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto(!abierto)}
      >
        <span className="vp-avatar" aria-hidden="true">
          {iniciales(corto)}
        </span>

        <span className="vp-cuenta__quien">
          <strong title={nombre}>{corto}</strong>
          <small>{rol}</small>
        </span>

        <svg
          className={'vp-chevron' + (abierto ? ' abierto' : '')}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden="true"
        >
          <path
            d="M2 4.5 6 8.5 10 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {abierto && (
        <div className="vp-cuenta__panel" role="menu">
          {esCliente && (
            <>
              <a
                role="menuitem"
                className="vp-item"
                href="#/mi-cuenta"
                onClick={cerrar}
              >
                Mi cuenta
              </a>

              <a
                role="menuitem"
                className="vp-item"
                href="#/mis-reservas"
                onClick={cerrar}
              >
                Mis reservas
              </a>

              <a
                role="menuitem"
                className="vp-item"
                href="#/paquetes"
                onClick={cerrar}
              >
                Explorar paquetes
              </a>
            </>
          )}

          {esPersonal && (
            <>
              <a
                role="menuitem"
                className="vp-item"
                href="#/paquetes"
                onClick={cerrar}
              >
                Nueva reserva
              </a>

              <a
                role="menuitem"
                className="vp-item"
                href="#/cobros"
                onClick={cerrar}
              >
                Cobrar reservas
              </a>

              <a
                role="menuitem"
                className="vp-item"
                href="#/pagos-yape"
                onClick={cerrar}
              >
                Pagos con Yape
              </a>
            </>
          )}

          {rol === 'Administrador' && (
            <a
              role="menuitem"
              className="vp-item"
              href="#/admin/paquetes"
              onClick={cerrar}
            >
              Gestionar catálogo
            </a>
          )}

          {veSalidas && (
            <a
              role="menuitem"
              className="vp-item"
              href="#/guia"
              onClick={cerrar}
            >
              {rol === 'Guia' ? 'Mis salidas' : 'Asistencia de salidas'}
            </a>
          )}

          <a
            role="menuitem"
            className="vp-item"
            href="#/cambiar-clave"
            onClick={cerrar}
          >
            Cambiar contraseña
          </a>

          <hr />

          <button
            type="button"
            role="menuitem"
            className="vp-item vp-item--salir"
            onClick={salir}
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
