import { useEffect, useState } from 'react';
import '../../estilos/reservas.css';
import Campo from '../../componentes/Campo.jsx';
import { esCorreo, esTelefono, noVacio } from '../../utils/validaciones.js';
import { pedir, crearReserva, ultima } from '../../servicios/api.js';
import { useSesion } from '../../servicios/auth.js';
import {
  TIPOS,
  validarDocumento,
  limpiarDocumento,
  edadAl,
  validarNacimiento,
} from '../../utils/documentos.js';

const C = {
  id: 'id',
  fecha: 'fecha_inicio_viaje',
  cupos: 'cupos_disponibles',
  estado: 'estado',
};

const ROLES_PERSONAL = ['Recepcionista', 'Administrador'];
const ROL_CLIENTE = 'Cliente';

const OPCION_DNI = [{ valor: 'DNI', texto: 'DNI' }];

const fecha = (v) =>
  new Date(v).toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Lima',
  });

// HU "Comprar paquetes online": del titular y de cada acompañante se piden
// DNI, apellido paterno, apellido materno y nombres (por separado).
const persona = () => ({
  tipo_documento: 'DNI',
  nro_documento: '',
  apellido_paterno: '',
  apellido_materno: '',
  nombres: '',
  fecha_nacimiento: '',
});

// El Backend y la base guardan un solo campo "apellidos" (paterno + materno).
const conApellidos = (p) => ({
  ...p,
  apellidos: [p.apellido_paterno, p.apellido_materno]
    .map((a) => String(a || '').trim())
    .filter(Boolean)
    .join(' '),
});

const conDni = (p) => ({
  ...conApellidos(p),
  dni: p.nro_documento,
});

const MSG_EXCEDE = 'La cantidad de pasajeros excede la capacidad disponible del paquete.';

// Fecha de hoy (hora local) en formato YYYY-MM-DD, para el atributo "max" de los calendarios.
const hoyISO = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
};

// Perfil de la cuenta -> datos del titular
const desdePerfil = (perfil) => ({
  tipo_documento: perfil.tipo_documento || '',
  nro_documento: perfil.numero_documento || '',
  apellido_paterno: perfil.apellido_paterno || '',
  apellido_materno: perfil.apellido_materno || '',
  nombres: perfil.nombres || '',
  fecha_nacimiento: perfil.fecha_nacimiento || '',
  correo: perfil.correo || '',
  telefono: perfil.telefono || '',
});

const CONSULTA = {
  DNI: 'dni',
  CE: 'ce',
};

const MSG_VACIO = {
  DNI: 'No encontramos este DNI en la consulta. Ingresa los datos a mano.',
  CE: 'No encontramos este carné de extranjería en la consulta. Ingresa los datos a mano.',
};

const telefonoClienteValido = (v) =>
  esTelefono(v) || /^\+\d{9,15}$/.test(String(v || ''));

function Fila({
  pre,
  p,
  onCambio,
  err,
  fechaSalida,
  permitirConsulta = true,
  soloDni = false,
}) {
  const [busq, setBusq] = useState({
    estado: 'idle',
    msg: '',
  });

  const esDni = p.tipo_documento === 'DNI';
  const ruta = permitirConsulta
    ? CONSULTA[p.tipo_documento]
    : undefined;

  const edad = p.fecha_nacimiento
    ? edadAl(p.fecha_nacimiento, fechaSalida)
    : null;

  const cambiarDoc = (cambios) => {
    setBusq({ estado: 'idle', msg: '' });
    onCambio(cambios);
  };

  async function buscar() {
    if (!ruta) return;

    const invalido = validarDocumento(
      p.tipo_documento,
      p.nro_documento
    );

    if (invalido) {
      return setBusq({
        estado: 'error',
        msg: invalido,
      });
    }

    setBusq({
      estado: 'buscando',
      msg: '',
    });

    try {
      const r = await pedir(
        '/consultas/' +
          ruta +
          '/' +
          encodeURIComponent(p.nro_documento)
      );

      if (r?.encontrado) {
        onCambio({
          // Si el Backend no los separa, todo va al paterno y la persona lo corrige.
          apellido_paterno: r.apellido_paterno ?? r.apellidos ?? '',
          apellido_materno: r.apellido_materno ?? '',
          nombres: r.nombres,
        });

        setBusq({
          estado: 'ok',
          msg: 'Datos encontrados. Revísalos y corrígelos si hace falta.',
        });
      } else {
        setBusq({
          estado: 'vacio',
          msg: MSG_VACIO[p.tipo_documento],
        });
      }
    } catch (e) {
      console.error('Error al consultar documento:', e);

      setBusq({
        estado: 'error',
        msg:
          e?.message ||
          'No pudimos hacer la consulta. Revisa la conexión con el servidor.',
      });
    }
  }

  return (
    <>
      <div className="vp-fila">
        <Campo
          etiqueta="Tipo de documento"
          opciones={soloDni ? OPCION_DNI : TIPOS}
          value={p.tipo_documento}
          disabled={soloDni}
          onChange={(e) =>
            cambiarDoc({
              tipo_documento: e.target.value,
              nro_documento: '',
            })
          }
        />

        <Campo
          etiqueta="Número de documento"
          autoComplete="off"
          inputMode={esDni ? 'numeric' : 'text'}
          maxLength={esDni ? 8 : 12}
          value={p.nro_documento}
          onChange={(e) =>
            cambiarDoc({
              nro_documento: limpiarDocumento(
                p.tipo_documento,
                e.target.value
              ),
            })
          }
          error={err[pre + 'nro_documento']}
        />
      </div>

      {ruta && (
        <p>
          <button
            type="button"
            className="vp-btn vp-btn--borde"
            onClick={buscar}
            disabled={busq.estado === 'buscando'}
          >
            {busq.estado === 'buscando'
              ? 'Buscando…'
              : 'Buscar ' + p.tipo_documento}
          </button>
        </p>
      )}

      {busq.msg && (
        <p
          className={
            busq.estado === 'error'
              ? 'vp-alerta'
              : 'vp-sub'
          }
          role="status"
        >
          {busq.msg}
        </p>
      )}

      <div className="vp-fila">
        <Campo
          etiqueta="Apellido paterno"
          value={p.apellido_paterno}
          onChange={(e) =>
            onCambio({ apellido_paterno: e.target.value })
          }
          error={err[pre + 'apellido_paterno']}
        />

        <Campo
          etiqueta={esDni ? 'Apellido materno' : 'Apellido materno (si tiene)'}
          value={p.apellido_materno}
          onChange={(e) =>
            onCambio({ apellido_materno: e.target.value })
          }
          error={err[pre + 'apellido_materno']}
        />

        <Campo
          etiqueta="Nombres"
          value={p.nombres}
          onChange={(e) =>
            onCambio({ nombres: e.target.value })
          }
          error={err[pre + 'nombres']}
        />
      </div>

      <div className="vp-fila">
        <Campo
          etiqueta="Fecha de nacimiento"
          type="date"
          max={hoyISO()}
          value={p.fecha_nacimiento}
          onChange={(e) =>
            onCambio({ fecha_nacimiento: e.target.value })
          }
          error={err[pre + 'fecha_nacimiento']}
        />
      </div>

      {edad !== null && edad >= 0 && edad < 18 && (
        <p className="vp-sub" role="status">
          Menor de edad ({edad} {edad === 1 ? 'año' : 'años'} a la fecha de la salida).
        </p>
      )}
    </>
  );
}

export default function Reserva({ paqueteId, salidaId }) {
  const sesion = useSesion();

  const rol = sesion?.usuario?.rol;
  const esCliente = rol === ROL_CLIENTE;
  const esPersonal = ROLES_PERSONAL.includes(rol);
  const autorizado = esCliente || esPersonal;

  const [paquete, setPaquete] = useState(null);
  const [carga, setCarga] = useState('cargando');

  const [cargaPerfil, setCargaPerfil] = useState('cargando');
  const [falloPerfil, setFalloPerfil] = useState('');

  const [cliente, setCliente] = useState({
    ...persona(),
    correo: '',
    telefono: '',
  });

  const [clienteManual, setClienteManual] = useState({
    ...persona(),
    correo: '',
    telefono: '',
  });

  const [modoTitular, setModoTitular] = useState('perfil');

  const [acomp, setAcomp] = useState([]);
  const [err, setErr] = useState({});
  const [fallo, setFallo] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function cargar() {
    setCarga('cargando');

    try {
      const p = await pedir('/paquetes/' + paqueteId);
      setPaquete(p);
      setCarga('listo');
    } catch (e) {
      console.error('Error al cargar paquete:', e);
      setCarga('error');
    }
  }

  useEffect(() => {
    if (!sesion) {
      // HU: sin sesión no se puede comprar. Se avisa en el login y luego se vuelve aquí.
      window.location.hash =
        '#/login?motivo=compra&volver=' + encodeURIComponent(window.location.hash);
      return;
    }

    if (!autorizado) return;

    cargar();
  }, [paqueteId, sesion]);

  useEffect(() => {
    if (!sesion || !esCliente) {
      setCargaPerfil('listo');
      return;
    }

    let activo = true;

    async function cargarPerfil() {
      setCargaPerfil('cargando');
      setFalloPerfil('');

      try {
        const perfil = await pedir('/portal-cliente/perfil');

        if (!activo) return;

        setCliente(desdePerfil(perfil));

        setCargaPerfil('listo');
      } catch (e) {
        if (!activo) return;

        console.error('Error al cargar perfil:', e);

        setFalloPerfil(
          e.message || 'No pudimos cargar tus datos personales.'
        );
        setCargaPerfil('error');
      }
    }

    cargarPerfil();

    return () => {
      activo = false;
    };
  }, [sesion, esCliente]);

  if (!sesion) return null;

  if (!autorizado) {
    return (
      <main className="vp-centro">
        <p className="vp-alerta">
          Tu rol no puede registrar reservas.
        </p>
      </main>
    );
  }

  if (carga === 'cargando' || cargaPerfil === 'cargando') {
    return (
      <main className="vp-centro">
        <p>Cargando datos de la reserva…</p>
      </main>
    );
  }

  if (carga === 'error') {
    return (
      <main className="vp-centro">
        <p className="vp-alerta">
          No pudimos cargar el paquete.
        </p>
        <button className="vp-btn" onClick={cargar}>
          Reintentar
        </button>
      </main>
    );
  }

  if (esCliente && cargaPerfil === 'error') {
    return (
      <main className="vp-centro">
        <div className="vp-panel">
          <h1>No pudimos cargar tu perfil</h1>
          <p className="vp-alerta">{falloPerfil}</p>
          <button
            className="vp-btn"
            onClick={async () => {
              setCargaPerfil('cargando');

              try {
                const perfil = await pedir('/portal-cliente/perfil');

                setCliente(desdePerfil(perfil));

                setFalloPerfil('');
                setCargaPerfil('listo');
              } catch (e) {
                console.error('Error al reintentar perfil:', e);

                setFalloPerfil(
                  e.message || 'No pudimos cargar tus datos personales.'
                );
                setCargaPerfil('error');
              }
            }}
          >
            Reintentar
          </button>
        </div>
      </main>
    );
  }

  const salida = (paquete?.salidas || []).find(
    (s) => String(s[C.id]) === String(salidaId)
  );

  const cupos = salida ? Number(salida[C.cupos]) : 0;
  const fechaSalida = salida?.[C.fecha];

  const fechaPasada =
    fechaSalida && String(fechaSalida).slice(0, 10) < hoyISO();

  const bloqueada =
    !salida ||
    salida[C.estado] !== 'Activa' ||
    cupos <= 0 ||
    fechaPasada;

  const personas = 1 + acomp.length;
  const restantes = cupos - personas;
  const excede = restantes < 0;

  if (bloqueada) {
    return (
      <main className="vp-centro">
        <div className="vp-panel">
          <h1>Salida no disponible</h1>
          <p>
            Esta salida no tiene cupos, no está activa o su fecha ya pasó.
            Elige otra fecha.
          </p>
          <a
            className="vp-btn"
            href={'#/paquete/' + paqueteId}
          >
            Ver otras salidas
          </a>
        </div>
      </main>
    );
  }

  const titularFormulario =
    esCliente && modoTitular === 'manual'
      ? clienteManual
      : cliente;

  const cambiarC = (cambios) =>
    setCliente((c) => ({ ...c, ...cambios }));

  const cambiarManual = (cambios) =>
    setClienteManual((c) => ({ ...c, ...cambios }));

  const cambiarA = (i) => (cambios) =>
    setAcomp((lista) =>
      lista.map((a, j) =>
        j === i ? { ...a, ...cambios } : a
      )
    );

  const setCampoC = (k) => (e) =>
    cambiarC({ [k]: e.target.value });

  const setCampoManual = (k) => (e) =>
    cambiarManual({ [k]: e.target.value });

  function validar() {
    const n = {};
    const vistos = new Set();

    const chk = (pre, p, esTitular) => {
      const d = validarDocumento(
        p.tipo_documento,
        p.nro_documento
      );

      if (d) {
        n[pre + 'nro_documento'] = d;
      } else {
        const clave =
          p.tipo_documento +
          ':' +
          p.nro_documento.toUpperCase();

        if (vistos.has(clave)) {
          n[pre + 'nro_documento'] =
            'Este documento está repetido en la reserva.';
        }

        vistos.add(clave);
      }

      if (!noVacio(p.apellido_paterno)) {
        n[pre + 'apellido_paterno'] = 'Escribe el apellido paterno.';
      }

      // Con DNI el apellido materno es obligatorio (como en el registro de cuenta).
      if (p.tipo_documento === 'DNI' && !noVacio(p.apellido_materno)) {
        n[pre + 'apellido_materno'] = 'Escribe el apellido materno.';
      }

      if (!noVacio(p.nombres)) {
        n[pre + 'nombres'] = 'Escribe los nombres.';
      }

      const f = validarNacimiento(
        p.fecha_nacimiento,
        fechaSalida
      );

      if (f) {
        n[pre + 'fecha_nacimiento'] = f;
      } else if (
        esTitular &&
        edadAl(p.fecha_nacimiento, fechaSalida) < 18
      ) {
        n[pre + 'fecha_nacimiento'] =
          'El titular que reserva debe ser mayor de edad.';
      }
    };

    chk('c.', titularFormulario, true);

    if (!esCorreo(titularFormulario.correo)) {
      n['c.correo'] = 'Escribe un correo válido.';
    }

    const telefonoValido = esCliente
      ? telefonoClienteValido(titularFormulario.telefono)
      : esTelefono(titularFormulario.telefono);

    if (!telefonoValido) {
      n['c.telefono'] = esCliente
        ? 'Escribe un teléfono válido.'
        : 'El teléfono tiene 9 dígitos.';
    }

    acomp.forEach((a, i) => {
      chk('a' + i + '.', a, false);
    });

    return n;
  }

  async function enviar(e) {
    e.preventDefault();

    const n = validar();

    setErr(n);
    setFallo('');

    if (Object.keys(n).length || excede) {
      if (excede) {
        setFallo(MSG_EXCEDE);
      }
      return;
    }

    setEnviando(true);

    try {
      let r;

      if (esCliente) {
        const body = {
          salida_id: salida[C.id],
          modo_titular: modoTitular,
          acompanantes: acomp.map(conApellidos),
        };

        if (modoTitular === 'manual') {
          body.cliente = conApellidos(clienteManual);
        } else {
          // Enviar la fecha ingresada en el formulario.
          // Los demás datos siguen siendo obtenidos del perfil en backend.
          body.cliente = {
            fecha_nacimiento: cliente.fecha_nacimiento,
          };
        }

        r = await pedir('/portal-cliente/reservas', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      } else {
        r = await crearReserva({
          salida_id: salida[C.id],
          cliente: conApellidos(cliente),
          acompanantes: acomp.map(conApellidos),
        });
      }

      ultima.datos = {
        ...r,
        paquete: paquete.nombre,
        fecha: salida[C.fecha],
        cliente: conDni(titularFormulario),
        acompanantes: acomp.map(conDni),
        personas,
      };

      window.location.hash = '#/reserva-confirmada';
    } catch (ex) {
      console.error('Error al registrar reserva:', ex);

      if (ex.estado === 409) {
        // 409 = sin cupos o salida no disponible: el Backend dice cuál de los dos.
        setFallo(
          (ex.message || 'La salida cambió.') + ' Revisa los cupos actualizados.'
        );
        cargar();
      } else {
        setFallo(
          ex.message || 'No pudimos registrar la reserva.'
        );
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="vp-reserva">
      <header>
        <h1>
          {esCliente ? 'Reservar paquete' : 'Registrar reserva'}
        </h1>
        <p className="vp-sub">
          {paquete.nombre} · salida del {fecha(fechaSalida)}
        </p>
      </header>

      <form onSubmit={enviar} noValidate>
        <section className="vp-panel">
          <h2>{esCliente ? 'Titular de la reserva' : 'Cliente'}</h2>

          {esCliente ? (
            <>
              <p className="vp-sub">
                Selecciona quién será el titular de esta reserva.
              </p>

              <div className="vp-fila">
                <button
                  type="button"
                  className={
                    'vp-btn ' +
                    (modoTitular === 'perfil'
                      ? 'vp-btn--amarillo'
                      : 'vp-btn--borde')
                  }
                  aria-pressed={modoTitular === 'perfil'}
                  onClick={() => {
                    setModoTitular('perfil');
                    setErr({});
                    setFallo('');
                  }}
                >
                  Usar mis datos
                </button>

                <button
                  type="button"
                  className={
                    'vp-btn ' +
                    (modoTitular === 'manual'
                      ? 'vp-btn--amarillo'
                      : 'vp-btn--borde')
                  }
                  aria-pressed={modoTitular === 'manual'}
                  onClick={() => {
                    setModoTitular('manual');
                    setErr({});
                    setFallo('');
                  }}
                >
                  Ingresar otro titular
                </button>
              </div>

              {modoTitular === 'perfil' ? (
                <>
                  <div className="vp-fila">
                    <Campo
                      etiqueta="Tipo de documento"
                      value={cliente.tipo_documento}
                      disabled
                    />

                    <Campo
                      etiqueta="Número de documento"
                      value={cliente.nro_documento}
                      disabled
                      error={err['c.nro_documento']}
                    />
                  </div>

                  <div className="vp-fila">
                    <Campo
                      etiqueta="Apellido paterno"
                      value={cliente.apellido_paterno}
                      disabled
                      error={err['c.apellido_paterno']}
                    />

                    <Campo
                      etiqueta="Apellido materno"
                      value={cliente.apellido_materno}
                      disabled
                      error={err['c.apellido_materno']}
                    />

                    <Campo
                      etiqueta="Nombres"
                      value={cliente.nombres}
                      disabled
                      error={err['c.nombres']}
                    />
                  </div>

                  <div className="vp-fila">
                    <Campo
                      etiqueta="Fecha de nacimiento"
                      type="date"
                      max={hoyISO()}
                      value={cliente.fecha_nacimiento}
                      onChange={setCampoC('fecha_nacimiento')}
                      error={err['c.fecha_nacimiento']}
                    />
                  </div>

                  <div className="vp-fila vp-fila--2">
                    <Campo
                      etiqueta="Correo"
                      type="email"
                      value={cliente.correo}
                      disabled
                      error={err['c.correo']}
                    />

                    <Campo
                      etiqueta="Teléfono"
                      type="tel"
                      value={cliente.telefono}
                      disabled
                      error={err['c.telefono']}
                    />
                  </div>

                  <p className="vp-sub">
                    Se utilizarán los datos de tu cuenta como titular.
                    Solo puedes ingresar o corregir tu fecha de nacimiento.
                    Los demás datos se obtienen de tu perfil.
                  </p>
                </>
              ) : (
                <>
                  <p className="vp-sub">
                    Ingresa los datos de la persona que figurará como
                    titular. Verificaremos su DNI y sus nombres.
                  </p>

                  <Fila
                    pre="c."
                    p={clienteManual}
                    onCambio={cambiarManual}
                    err={err}
                    fechaSalida={fechaSalida}
                    permitirConsulta={false}
                    soloDni
                  />

                  <div className="vp-fila vp-fila--2">
                    <Campo
                      etiqueta="Correo del titular"
                      type="email"
                      value={clienteManual.correo}
                      onChange={setCampoManual('correo')}
                      error={err['c.correo']}
                    />

                    <Campo
                      etiqueta="Teléfono del titular"
                      type="tel"
                      value={clienteManual.telefono}
                      onChange={setCampoManual('telefono')}
                      error={err['c.telefono']}
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <Fila
                pre="c."
                p={cliente}
                onCambio={cambiarC}
                err={err}
                fechaSalida={fechaSalida}
              />

              <div className="vp-fila vp-fila--2">
                <Campo
                  etiqueta="Correo"
                  type="email"
                  value={cliente.correo}
                  onChange={setCampoC('correo')}
                  error={err['c.correo']}
                />

                <Campo
                  etiqueta="Teléfono"
                  type="tel"
                  inputMode="numeric"
                  maxLength={9}
                  value={cliente.telefono}
                  onChange={setCampoC('telefono')}
                  error={err['c.telefono']}
                />
              </div>
            </>
          )}
        </section>

        <section className="vp-panel">
          <h2>Acompañantes</h2>

          {acomp.length === 0 && (
            <p className="vp-sub">
              {esCliente
                ? 'Viajas sin acompañantes. Agrégalos si corresponde.'
                : 'El cliente viaja solo. Agrega acompañantes si corresponde.'}
            </p>
          )}

          {acomp.map((a, i) => (
            <div className="vp-acomp" key={i}>
              <h3>Acompañante {i + 1}</h3>

              <Fila
                pre={'a' + i + '.'}
                p={a}
                onCambio={cambiarA(i)}
                err={err}
                fechaSalida={fechaSalida}
                permitirConsulta={!esCliente}
                soloDni={esCliente}
              />

              <button
                type="button"
                className="vp-btn vp-btn--borde"
                onClick={() =>
                  setAcomp(acomp.filter((_, j) => j !== i))
                }
              >
                Quitar
              </button>
            </div>
          ))}

          <button
            type="button"
            className="vp-btn vp-btn--borde"
            disabled={acomp.length >= 20}
            onClick={() => {
              if (restantes <= 0) {
                setFallo(MSG_EXCEDE);
                return;
              }
              setFallo('');
              setAcomp([...acomp, persona()]);
            }}
          >
            Agregar acompañante
          </button>

          {acomp.length >= 20 && (
            <p className="vp-sub">
              Has alcanzado el máximo de 20 acompañantes.
            </p>
          )}
        </section>

        <aside
          className={'vp-cupos' + (excede ? ' vp-cupos--excede' : '')}
          aria-live="polite"
        >
          <div className="vp-asientos" aria-hidden="true">
            {Array.from(
              { length: Math.min(cupos, 24) },
              (_, i) => (
                <i
                  key={i}
                  className={i < personas ? 'ocupa' : ''}
                />
              )
            )}
          </div>

          <p>
            <strong>{personas}</strong>{' '}
            {personas === 1 ? 'persona' : 'personas'} de{' '}
            <strong>{cupos}</strong> cupos disponibles
            {excede
              ? ' — superas los cupos de esta salida.'
              : ` — quedarán ${restantes}.`}
          </p>

          {fallo && (
            <p className="vp-alerta" role="alert">
              {fallo}
            </p>
          )}

          <button
            type="submit"
            className="vp-btn vp-btn--amarillo"
            disabled={enviando || excede}
          >
            {enviando
              ? 'Registrando…'
              : esCliente
                ? 'Confirmar reserva'
                : 'Registrar reserva'}
          </button>
        </aside>
      </form>
    </main>
  );
}
