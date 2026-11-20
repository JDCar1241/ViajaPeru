
import { useCallback, useEffect, useState } from 'react';
import { pedir } from '../../servicios/api.js';
import { useSesion } from '../../servicios/auth.js';
import '../../estilos/reservas.css';

export default function MiCuenta() {
  const sesion = useSesion();

  const [perfil, setPerfil] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState('');

  const cargarPerfil = useCallback(async () => {
    setEstado('cargando');
    setError('');

    try {
      const respuesta = await pedir('/portal-cliente/perfil');
      const datos = respuesta?.perfil || respuesta;

      if (!datos || typeof datos !== 'object') {
        throw new Error('No se encontraron los datos del perfil.');
      }

      setPerfil(datos);
      setEstado('ok');
    } catch (e) {
      setError(e.message || 'No se pudo cargar tu perfil.');
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    if (sesion) cargarPerfil();
  }, [sesion, cargarPerfil]);

  if (!sesion) {
    return (
      <main className="vp-centro">
        <section className="vp-panel">
          <h1>Mi cuenta</h1>
          <p>Debes iniciar sesión para consultar tu información.</p>
          <a className="vp-btn" href="#/login">Iniciar sesión</a>
        </section>
      </main>
    );
  }

  return (
    <main className="vp-centro">
      <section className="vp-panel">
        <h1>Mi cuenta</h1>

        {estado === 'cargando' && (
          <p>Cargando información de tu cuenta...</p>
        )}

        {estado === 'error' && (
          <>
            <p className="vp-error" role="alert">{error}</p>
            <button className="vp-btn" onClick={cargarPerfil}>
              Volver a intentar
            </button>
          </>
        )}

        {estado === 'ok' && perfil && (
          <>
            <div className="vp-reserva">
              <h2>Información personal</h2>

              <div className="vp-formulario">
                <div className="vp-campo">
                  <label>Nombre completo</label>
                  <input
                    value={`${perfil.nombres || ''} ${perfil.apellidos || ''}`.trim() || 'No registrado'}
                    readOnly
                    disabled
                  />
                </div>

                <div className="vp-campo">
                  <label>Tipo de documento</label>
                  <input
                    value={perfil.tipo_documento || 'No registrado'}
                    readOnly
                    disabled
                  />
                </div>

                <div className="vp-campo">
                  <label>Número de documento</label>
                  <input
                    value={perfil.numero_documento || 'No registrado'}
                    readOnly
                    disabled
                  />
                </div>

                <div className="vp-campo">
                  <label>Correo electrónico</label>
                  <input
                    value={perfil.correo || 'No registrado'}
                    readOnly
                    disabled
                  />
                </div>

                <div className="vp-campo">
                  <label>Teléfono</label>
                  <input
                    value={perfil.telefono || 'No registrado'}
                    readOnly
                    disabled
                  />
                </div>
              </div>
            </div>

            <div className="vp-fila-botones">
              <a className="vp-btn" href="#/mis-reservas">
                Mis reservas
              </a>

              <a className="vp-btn" href="#/paquetes">
                Ver paquetes
              </a>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
