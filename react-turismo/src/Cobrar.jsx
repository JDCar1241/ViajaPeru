import { useEffect, useState } from 'react';
import './cobros.css';
import { pedir } from './api-reservas.js';
import { useSesion } from './auth.js';
import { soles, cent } from './moneda.js';

const ROLES = ['Recepcionista', 'Gerente'];
const METODOS = [['Efectivo', 'Efectivo'], ['Tarjeta', 'Tarjeta'], ['QR', 'QR (Yape o Plin)']];
const CULQI_KEY = import.meta.env.VITE_CULQI_PUBLIC_KEY;

const nueva = (monto = '') => ({ metodo: 'Efectivo', medio: 'Yape', monto, recibido: '', referencia: '' });
const fecha = (v) => new Date(v).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
const emailOk = (v) => /^\S+@\S+\.\S+$/.test(String(v).trim());

// Abre el formulario de Culqi y devuelve el ID del token de la tarjeta.
// Los datos de la tarjeta van directo a Culqi: nunca pasan por tu servidor.
function pedirToken({ monto, email }) {
  return new Promise((resolve, reject) => {
    if (!window.CulqiCheckout) return reject(new Error('No cargó el formulario de Culqi. Recarga la página.'));
    if (!CULQI_KEY) return reject(new Error('Falta VITE_CULQI_PUBLIC_KEY en el .env del front.'));

    const culqi = new window.CulqiCheckout(CULQI_KEY, {
      settings: { title: 'ViajaPeru', currency: 'PEN', amount: monto }, // monto en céntimos
      client: { email },
      options: { lang: 'es', paymentMethods: { tarjeta: true, yape: false } },
    });

    culqi.culqi = () => {
      if (culqi.token) {
        resolve(culqi.token.id);
        if (typeof culqi.close === 'function') culqi.close();
      } else if (culqi.error) {
        reject(new Error(culqi.error.user_message || 'No se pudo procesar la tarjeta.'));
      }
    };
    culqi.open();
  });
}

export default function Cobrar({ id }) {
  const sesion = useSesion();
  const [r, setR] = useState(null);
  const [carga, setCarga] = useState('cargando');
  const [lineas, setLineas] = useState([]);
  const [correo, setCorreo] = useState('');
  const [fallo, setFallo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [recibo, setRecibo] = useState(null);

  const cargar = () => {
    setCarga('cargando');
    pedir('/reservas/' + id)
      .then((d) => {
        setR(d);
        setLineas([nueva(Number(d.total).toFixed(2))]);
        setCorreo(d.cliente?.correo || '');
        setCarga('listo');
      })
      .catch(() => setCarga('error'));
  };
  useEffect(() => { if (!sesion) { window.location.hash = '#/login'; return; } cargar(); }, [id, sesion]);

  if (!sesion) return null;
  if (!ROLES.includes(sesion.usuario.rol)) return <main><div className="error"><strong>Tu rol no puede cobrar reservas.</strong></div></main>;
  if (carga === 'cargando') return <main><div className="skeleton" /></main>;
  if (carga === 'error') return <main><div className="error"><strong>No pudimos cargar la reserva.</strong><p><button className="btn sec" onClick={cargar}>Reintentar</button></p></div></main>;

  if (recibo) return (
    <main className="cb-fin">
      <p className="pill">Pago registrado</p>
      <h1>{r.codigo} está pagada</h1>
      <p className="muted">Se cobraron {soles(recibo.total / 100)} a {r.cliente.nombres} {r.cliente.apellidos}.</p>
      {recibo.vuelto > 0 && <div className="cb-vuelto-grande"><small>Entrega de vuelto</small>{soles(recibo.vuelto / 100)}</div>}
      <p className="cb-botones"><a className="btn" href={'#/comprobante/' + id}>Emitir comprobante</a><a className="btn sec" href="#/cobros">Cobrar otra reserva</a></p>
    </main>
  );

  if (r.estado !== 'Pendiente') return (
    <main className="cb-fin"><h1>Esta reserva no se puede cobrar</h1><p className="muted">Su estado es «{r.estado}».</p><p><a className="btn" href="#/cobros">Ver reservas pendientes</a></p></main>
  );

  const total = cent(r.total);
  const pagado = lineas.reduce((s, l) => s + cent(l.monto), 0);
  const falta = total - pagado;
  const vueltoDe = (l) => (l.metodo === 'Efectivo' && l.recibido !== '' ? Math.max(0, cent(l.recibido) - cent(l.monto)) : 0);
  const vuelto = lineas.reduce((s, l) => s + vueltoDe(l), 0);
  const lineaTarjeta = lineas.find((l) => l.metodo === 'Tarjeta');
  const tarjetasMultiples = lineas.filter((l) => l.metodo === 'Tarjeta').length > 1;

  const errLinea = (l) => {
    if (cent(l.monto) <= 0) return 'Escribe un monto mayor a 0.';
    if (l.metodo === 'Efectivo' && l.recibido !== '' && cent(l.recibido) < cent(l.monto)) return 'El efectivo recibido no cubre el monto.';
    if (l.metodo === 'Tarjeta' && tarjetasMultiples) return 'Solo se admite un pago con tarjeta por operación.';
    return '';
  };
  const valido = falta === 0 && lineas.every((l) => !errLinea(l)) && (!lineaTarjeta || emailOk(correo));
  const setL = (i, k) => (e) => setLineas(lineas.map((l, j) => (j === i ? { ...l, [k]: e.target.value } : l)));

  async function cobrar() {
    setFallo('');
    try {
      // 1) Si hay tarjeta, primero se obtiene el token con el formulario de Culqi
      let token;
      if (lineaTarjeta) token = await pedirToken({ monto: cent(lineaTarjeta.monto), email: correo.trim() });

      // 2) Se envía todo al backend (él crea el cargo y registra el pago)
      setEnviando(true);
      await pedir('/reservas/' + id + '/pagos', {
        method: 'POST',
        body: JSON.stringify({
          email: lineaTarjeta ? correo.trim() : undefined,
          pagos: lineas.map((l) => ({
            metodo: l.metodo,
            medio: l.metodo === 'QR' ? l.medio : undefined,
            monto: cent(l.monto) / 100,
            recibido: l.metodo === 'Efectivo' && l.recibido !== '' ? cent(l.recibido) / 100 : undefined,
            referencia: l.metodo !== 'Tarjeta' && l.referencia.trim() ? l.referencia.trim() : undefined,
            token: l === lineaTarjeta ? token : undefined,
          })),
        }),
      });
      setRecibo({ total, vuelto });
    } catch (ex) {
      setFallo(ex.message || 'No pudimos registrar el pago.');
      if (ex.estado === 409) cargar();
    } finally { setEnviando(false); }
  }

  return (
    <main>
      <a className="volver" href="#/cobros">← Reservas pendientes</a>
      <h1>Cobrar {r.codigo}</h1>
      <div className="cols">
        <section>
          <h2>Medios de pago</h2>
          {lineas.map((l, i) => {
            const err = errLinea(l); const vl = vueltoDe(l);
            return (
              <div className="cb-linea" key={i}>
                <div className="cb-campos">
                  <label className="fld">Método
                    <select value={l.metodo} onChange={setL(i, 'metodo')}>{METODOS.map(([val, t]) => <option key={val} value={val}>{t}</option>)}</select>
                  </label>
                  {l.metodo === 'QR' && <label className="fld">App<select value={l.medio} onChange={setL(i, 'medio')}><option>Yape</option><option>Plin</option></select></label>}
                  <label className="fld">Monto a cobrar (S/)
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={l.monto} onChange={setL(i, 'monto')} />
                  </label>
                  {l.metodo === 'Efectivo' && (
                    <label className="fld">Efectivo recibido (S/)
                      <input type="number" min="0" step="0.01" inputMode="decimal" value={l.recibido} onChange={setL(i, 'recibido')} placeholder="Igual al monto" />
                    </label>
                  )}
                  {l.metodo === 'QR' && (
                    <label className="fld">Referencia (opcional)
                      <input value={l.referencia} onChange={setL(i, 'referencia')} placeholder="N.º de operación" />
                    </label>
                  )}
                  {l.metodo === 'Tarjeta' && <p className="muted">Se pedirá la tarjeta al registrar el pago.</p>}
                </div>
                {vl > 0 && <p className="cb-vuelto">Vuelto: {soles(vl / 100)}</p>}
                {err && <p className="cb-error" role="alert">{err}</p>}
                {lineas.length > 1 && <button type="button" className="btn sec sm" onClick={() => setLineas(lineas.filter((_, j) => j !== i))}>Quitar</button>}
              </div>
            );
          })}

          {lineaTarjeta && (
            <label className="fld">Correo del cliente (obligatorio para tarjeta)
              <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="cliente@correo.com" />
            </label>
          )}

          <button type="button" className="btn sec" disabled={falta <= 0} onClick={() => setLineas([...lineas, nueva((falta / 100).toFixed(2))])}>Agregar otro método</button>
        </section>

        <aside className="panel">
          <h2>Reserva</h2>
          <dl className="cb-datos">
            <div><dt>Cliente</dt><dd>{r.cliente.nombres} {r.cliente.apellidos}</dd></div>
            <div><dt>DNI</dt><dd>{r.cliente.dni}</dd></div>
            <div><dt>Paquete</dt><dd>{r.paquete.nombre}</dd></div>
            <div><dt>Salida</dt><dd>{fecha(r.fecha_inicio_viaje)}</dd></div>
            <div><dt>Personas</dt><dd>{r.num_personas}</dd></div>
          </dl>
        </aside>
      </div>

      <div className="cb-resumen" aria-live="polite">
        <dl>
          <div><dt>Total</dt><dd>{soles(total / 100)}</dd></div>
          <div><dt>Cobrado</dt><dd>{soles(pagado / 100)}</dd></div>
          <div><dt>{falta < 0 ? 'Te pasas por' : 'Falta'}</dt><dd className={falta === 0 ? 'cb-ok' : falta < 0 ? 'cb-mal' : ''}>{falta === 0 ? 'Completo' : soles(Math.abs(falta) / 100)}</dd></div>
          <div><dt>Vuelto</dt><dd>{soles(vuelto / 100)}</dd></div>
        </dl>
        <div>
          {fallo && <p className="cb-error cb-error--claro" role="alert">{fallo}</p>}
          <button className="btn claro" disabled={!valido || enviando} onClick={cobrar}>{enviando ? 'Registrando…' : 'Registrar pago'}</button>
        </div>
      </div>
    </main>
  );
}