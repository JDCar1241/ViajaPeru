import { useCallback, useEffect, useState } from 'react';
import { pedir } from '../../servicios/api.js';
import { useSesion } from '../../servicios/auth.js';

// Datos de la cuenta del cliente (solo lectura). Misma estructura que el resto de páginas:
// cabecera + tarjeta con los datos + acciones.
const NOMBRES_DOC = { DNI: 'DNI', CE: 'Carné de extranjería', PASAPORTE: 'Pasaporte' };

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
      <main>
        <div className="vacio">
          <strong>Inicia sesión para ver tu cuenta</strong>
          <p><a className="btn" href="#/login">Iniciar sesión</a></p>
        </div>
      </main>
    );
  }

  const nombre = perfil
    ? [perfil.nombres, perfil.apellido_paterno, perfil.apellido_materno].filter(Boolean).join(' ')
    : '';
  const tipo = String(perfil?.tipo_documento || '').toUpperCase();

  const datos = perfil
    ? [
        ['Nombre completo', nombre],
        ['Documento', perfil.numero_documento ? `${NOMBRES_DOC[tipo] || tipo || 'Documento'} ${perfil.numero_documento}` : ''],
        ['Correo electrónico', perfil.correo],
        ['Teléfono', perfil.telefono],
      ]
    : [];

  return (
    <main>
      <div className="cabecera">
        <div>
          <span className="etiqueta">Mi espacio viajero</span>
          <h1>Mi cuenta</h1>
          <p>Estos son los datos con los que creaste tu cuenta.</p>
        </div>
      </div>

      {estado === 'cargando' && <div className="skeleton" style={{ height: 220 }} />}

      {estado === 'error' && (
        <div className="error" role="alert">
          <strong>{error}</strong>
          <p><button className="btn sec" onClick={cargarPerfil}>Volver a intentar</button></p>
        </div>
      )}

      {estado === 'ok' && perfil && (
        <>
          <section className="tarjeta">
            <h2>Información personal</h2>
            <dl className="datos">
              {datos.map(([etiqueta, valor]) => (
                <div key={etiqueta}>
                  <dt>{etiqueta}</dt>
                  <dd>{valor || 'No registrado'}</dd>
                </div>
              ))}
            </dl>
            <p className="muted nota">
              Para corregir tu nombre o documento comunícate con ViajaPerú.
            </p>
          </section>

          <div className="acciones">
            <a className="btn" href="#/mis-reservas">Mis reservas</a>
            <a className="btn sec" href="#/paquetes">Ver paquetes</a>
            <a className="btn sec" href="#/cambiar-clave">Cambiar contraseña</a>
          </div>
        </>
      )}
    </main>
  );
}
