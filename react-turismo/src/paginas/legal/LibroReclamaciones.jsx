import { useState } from 'react';
import './legal.css';
import Icono from '../../componentes/Icono.jsx';
import { pedir } from '../../servicios/api.js';
import { useEmpresa } from '../../servicios/empresa.js';

// Libro de Reclamaciones virtual: los campos siguen la Hoja de Reclamación de INDECOPI.
// Al enviarlo, el Backend asigna el número correlativo y envía la copia al correo del consumidor.

const VACIO = {
  tipo: 'Reclamo',
  consumidor_nombre: '',
  tipo_documento: 'DNI',
  numero_documento: '',
  domicilio: '',
  telefono: '',
  correo: '',
  es_menor: false,
  apoderado: '',
  bien_tipo: 'Servicio',
  bien_descripcion: '',
  monto: '',
  codigo_reserva: '',
  detalle: '',
  pedido: '',
  acepta: false,
};

const hoy = () =>
  new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima' });

const fechaCorta = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function Campo({ etiqueta, nombre, errores, ancho, children }) {
  const error = errores[nombre];
  return (
    <label className={'fld' + (ancho ? ' lr-ancho' : '')}>
      {etiqueta}
      {children}
      {error && <span className="lr-error" role="alert">{error}</span>}
    </label>
  );
}

export default function LibroReclamaciones() {
  const e = useEmpresa();
  const [f, setF] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [hoja, setHoja] = useState(null);

  const cambiar = (campo) => (ev) => {
    const valor = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
    setF((x) => ({ ...x, [campo]: valor }));
    if (errores[campo]) setErrores((x) => ({ ...x, [campo]: undefined }));
  };

  const props = (campo) => ({ value: f[campo], onChange: cambiar(campo), 'aria-invalid': !!errores[campo] });

  async function enviar(ev) {
    ev.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const r = await pedir('/reclamos', { method: 'POST', body: JSON.stringify(f) });
      setHoja(r);
      window.scrollTo(0, 0);
    } catch (ex) {
      setErrores(ex.errores || {});
      setError(ex.message || 'No pudimos registrar tu hoja. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  if (hoja) {
    return (
      <main className="legal">
        <section className="tarjeta lr-exito">
          <span className="lr-exito__icono"><Icono nombre="check" tamano={30} /></span>
          <h2>Registramos tu {hoja.tipo.toLowerCase()}</h2>
          <div className="lr-numero">Hoja N.° {hoja.numero}</div>
          <p>
            Fecha de registro: <strong>{new Date(hoja.creado_en).toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Lima' })}</strong>
          </p>
          <p>
            {hoja.correo_enviado
              ? <>Enviamos una copia a <strong>{hoja.correo}</strong>.</>
              : <>No pudimos enviar la copia a <strong>{hoja.correo}</strong>: guarda o imprime esta página con tu número de hoja.</>}
            {' '}Te responderemos a ese correo a más tardar el <strong>{fechaCorta(hoja.fecha_limite)}</strong> (15 días hábiles).
          </p>
          <div className="acciones">
            <button type="button" className="btn sec" onClick={() => window.print()}>Imprimir</button>
            <a className="btn" href="#/">Ir al inicio</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="legal">
      <div className="cabecera">
        <div>
          <span className="etiqueta">Atención al consumidor</span>
          <h1>Libro de Reclamaciones</h1>
          <p>
            Conforme al Código de Protección y Defensa del Consumidor, este establecimiento cuenta con un Libro de
            Reclamaciones a tu disposición.
          </p>
        </div>
        <Icono nombre="libro" tamano={56} titulo="Libro de Reclamaciones" style={{ color: 'var(--blue)' }} />
      </div>

      <dl className="lr-hoja">
        <div><dt>Proveedor</dt><dd>{e.razon_social}</dd></div>
        <div><dt>RUC</dt><dd>{e.ruc || 'En trámite'}</dd></div>
        {e.direccion && <div><dt>Dirección</dt><dd>{e.direccion}</dd></div>}
        <div><dt>Fecha</dt><dd>{hoy()}</dd></div>
        <div><dt>Hoja N.°</dt><dd>Se asigna al enviar</dd></div>
      </dl>

      <form className="lr-form" onSubmit={enviar} noValidate>
        <fieldset>
          <legend>1. Tus datos</legend>
          <div className="lr-filas">
            <Campo etiqueta="Nombre completo" nombre="consumidor_nombre" errores={errores} ancho>
              <input {...props('consumidor_nombre')} autoComplete="name" maxLength={150} />
            </Campo>
            <Campo etiqueta="Tipo de documento" nombre="tipo_documento" errores={errores}>
              <select {...props('tipo_documento')}>
                <option value="DNI">DNI</option>
                <option value="CE">Carné de extranjería</option>
                <option value="PASAPORTE">Pasaporte</option>
              </select>
            </Campo>
            <Campo etiqueta="Número de documento" nombre="numero_documento" errores={errores}>
              <input {...props('numero_documento')} maxLength={12} />
            </Campo>
            <Campo etiqueta="Domicilio" nombre="domicilio" errores={errores} ancho>
              <input {...props('domicilio')} autoComplete="street-address" maxLength={250} />
            </Campo>
            <Campo etiqueta="Teléfono" nombre="telefono" errores={errores}>
              <input {...props('telefono')} type="tel" autoComplete="tel" inputMode="tel" maxLength={16} />
            </Campo>
            <Campo etiqueta="Correo electrónico" nombre="correo" errores={errores}>
              <input {...props('correo')} type="email" autoComplete="email" maxLength={150} />
            </Campo>
            <div className="lr-ancho">
              <label className="lr-check">
                <input type="checkbox" checked={f.es_menor} onChange={cambiar('es_menor')} />
                Soy menor de edad
              </label>
            </div>
            {f.es_menor && (
              <Campo etiqueta="Nombre del padre, madre o apoderado" nombre="apoderado" errores={errores} ancho>
                <input {...props('apoderado')} maxLength={150} />
              </Campo>
            )}
          </div>
        </fieldset>

        <fieldset>
          <legend>2. Servicio contratado</legend>
          <div className="lr-filas">
            <Campo etiqueta="Tipo" nombre="bien_tipo" errores={errores}>
              <select {...props('bien_tipo')}>
                <option value="Servicio">Servicio</option>
                <option value="Producto">Producto</option>
              </select>
            </Campo>
            <Campo etiqueta="Código de reserva (si tienes)" nombre="codigo_reserva" errores={errores}>
              <input {...props('codigo_reserva')} placeholder="VP-000123" maxLength={9} />
            </Campo>
            <Campo etiqueta="Paquete o servicio" nombre="bien_descripcion" errores={errores}>
              <input {...props('bien_descripcion')} placeholder="Ej. Machu Picchu Express 2D/1N" maxLength={300} />
            </Campo>
            <Campo etiqueta="Monto reclamado en soles (opcional)" nombre="monto" errores={errores}>
              <input {...props('monto')} type="number" min="0" step="0.01" inputMode="decimal" />
            </Campo>
          </div>
        </fieldset>

        <fieldset>
          <legend>3. Detalle</legend>
          <div className="lr-opciones" role="radiogroup" aria-label="Tipo de hoja">
            <label className="lr-opcion">
              <input type="radio" name="tipo" value="Reclamo" checked={f.tipo === 'Reclamo'} onChange={cambiar('tipo')} />
              <div>
                <strong>Reclamo</strong>
                <span>Disconformidad con el producto o servicio contratado.</span>
              </div>
            </label>
            <label className="lr-opcion">
              <input type="radio" name="tipo" value="Queja" checked={f.tipo === 'Queja'} onChange={cambiar('tipo')} />
              <div>
                <strong>Queja</strong>
                <span>Malestar con la atención al público, no relacionado con el servicio.</span>
              </div>
            </label>
          </div>
          {errores.tipo && <p className="lr-error">{errores.tipo}</p>}
          <div className="lr-filas" style={{ marginTop: 16 }}>
            <Campo etiqueta="¿Qué pasó?" nombre="detalle" errores={errores} ancho>
              <textarea {...props('detalle')} maxLength={3000} />
            </Campo>
            <Campo etiqueta="¿Qué solicitas?" nombre="pedido" errores={errores} ancho>
              <textarea {...props('pedido')} maxLength={2000} style={{ minHeight: 90 }} />
            </Campo>
          </div>
        </fieldset>

        <label className="lr-check">
          <input type="checkbox" checked={f.acepta} onChange={cambiar('acepta')} />
          Declaro que los datos consignados son verdaderos y acepto recibir la respuesta en mi correo electrónico.
        </label>
        {errores.acepta && <p className="lr-error">{errores.acepta}</p>}

        {error && <p className="aviso aviso--error" role="alert" style={{ marginTop: 16 }}>{error}</p>}

        <div className="acciones">
          <button className="btn" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar hoja de reclamación'}</button>
        </div>

        <p className="lr-nota">
          La respuesta se enviará a tu correo en un plazo no mayor a quince (15) días hábiles improrrogables.
          La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo
          para interponer una denuncia ante el INDECOPI.
        </p>
      </form>
    </main>
  );
}
