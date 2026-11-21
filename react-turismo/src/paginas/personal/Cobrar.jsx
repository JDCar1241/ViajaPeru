import { useEffect, useRef, useState } from 'react';
import './cobros.css';
import './comprobante.css';
import { pedir } from '../../servicios/api.js';
import { useSesion } from '../../servicios/auth.js';
import { soles, cent } from '../../utils/moneda.js';
import { esCorreo } from '../../utils/validaciones.js';
import { pedirTokenTarjeta } from '../../servicios/culqi-front.js';

const ROLES = ['Recepcionista', 'Administrador'];
const METODOS = [['Efectivo', 'Efectivo'], ['Tarjeta', 'Tarjeta'], ['QR', 'QR (Yape o Plin)']];

const nueva = (monto = '') => ({ metodo: 'Efectivo', medio: 'Yape', monto, recibido: '', referencia: '', moneda: 'PEN' });
const fecha = (v) => new Date(v).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima' });
// Dólares a partir de céntimos de dólar
const dolares = (c) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);

export default function Cobrar({ id }) {
  const sesion = useSesion();
  const [r, setR] = useState(null);
  const [carga, setCarga] = useState('cargando');
  const [lineas, setLineas] = useState([]);
  const [correo, setCorreo] = useState('');
  const [tc, setTc] = useState(null); // soles por 1 dólar (lo guarda el Backend)
  const [fallo, setFallo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [esperandoTarjeta, setEsperandoTarjeta] = useState(false);
  const [recibo, setRecibo] = useState(null);
  // Comprobante que se emite y envía solo al registrar el pago (HU-007)
  const [tipoComp, setTipoComp] = useState('Boleta'); // Boleta (a nombre del titular) | Factura
  const [fac, setFac] = useState({ ruc: '', razon: '', direccion: '' });
  const intento = useRef(0); // identifica el intento de cobro vigente (para poder cancelar)

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

  // Tipo de cambio: si no está configurado, simplemente no se ofrece cobrar en dólares
  useEffect(() => {
    if (!sesion) return;
    pedir('/reservas/tipo-cambio').then((d) => setTc(Number(d.usd) || null)).catch(() => setTc(null));
  }, [sesion]);

  if (!sesion) return null;
  if (!ROLES.includes(sesion.usuario.rol)) return <main><div className="error"><strong>Tu rol no puede cobrar reservas.</strong></div></main>;
  if (carga === 'cargando') return <main><div className="skeleton" /></main>;
  if (carga === 'error') return <main><div className="error"><strong>No pudimos cargar la reserva.</strong><p><button className="btn sec" onClick={cargar}>Reintentar</button></p></div></main>;

  if (recibo) return (
    <main className="cb-fin">
      <p className="pill">Pago registrado</p>
      <h1>{r.codigo} está pagada</h1>
      <p className="muted">Se cobraron {soles(recibo.total / 100)} a {r.cliente.nombres} {r.cliente.apellidos}.</p>
      {recibo.tarjeta && (
        <p className="muted">
          Tarjeta: {recibo.tarjeta.moneda === 'USD'
            ? `${dolares(Math.round(recibo.tarjeta.monto * 100))} (tipo de cambio S/ ${Number(recibo.tarjeta.tipo_cambio).toFixed(2)} por US$ 1)`
            : soles(recibo.tarjeta.monto)}.
        </p>
      )}
      {recibo.vuelto > 0 && <div className="cb-vuelto-grande"><small>Entrega de vuelto</small>{soles(recibo.vuelto / 100)}</div>}
      {recibo.comprobante ? (
        <p className={'aviso ' + (recibo.comprobante.correo ? 'aviso--ok' : '')} style={{ margin: '24px 0' }}>
          {recibo.comprobante.tipo} {recibo.comprobante.serie}-{String(recibo.comprobante.numero).padStart(8, '0')} emitida
          {recibo.comprobante.correo
            ? <> y enviada a <strong>{recibo.comprobante.correo}</strong>.</>
            : '. El cliente no tiene correo: entrégale el comprobante impreso.'}
        </p>
      ) : (
        <p className="aviso aviso--error" style={{ margin: '24px 0' }}>
          El pago quedó registrado, pero no se pudo emitir el comprobante automáticamente. Emítelo ahora.
        </p>
      )}
      <p className="cb-botones">
        <a className="btn" href={'#/comprobante/' + id}>{recibo.comprobante ? 'Ver o imprimir comprobante' : 'Emitir comprobante'}</a>
        <a className="btn sec" href="#/cobros">Cobrar otra reserva</a>
      </p>
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
  const usdCent = (soloCent) => Math.round(soloCent / tc); // céntimos de sol -> céntimos de dólar

  const errLinea = (l) => {
    if (cent(l.monto) <= 0) return 'Escribe un monto mayor a 0.';
    if (l.metodo === 'Efectivo' && l.recibido !== '' && cent(l.recibido) < cent(l.monto)) return 'El efectivo recibido no cubre el monto.';
    if (l.metodo === 'Tarjeta' && tarjetasMultiples) return 'Solo se admite un pago con tarjeta por operación.';
    if (l.metodo === 'Tarjeta' && l.moneda === 'USD') {
      if (!tc) return 'No hay tipo de cambio configurado: cobra en soles.';
      if (usdCent(cent(l.monto)) <= 0) return 'El monto en dólares es demasiado pequeño.';
    }
    return '';
  };
  const errFactura = tipoComp !== 'Factura' ? {} : {
    ...(!/^\d{11}$/.test(fac.ruc.trim()) ? { ruc: 'El RUC debe tener 11 dígitos.' } : {}),
    ...(!fac.razon.trim() ? { razon: 'Escribe la razón social.' } : {}),
    ...(!fac.direccion.trim() ? { direccion: 'Escribe la dirección fiscal.' } : {}),
  };
  const valido = falta === 0 && lineas.every((l) => !errLinea(l)) && (!lineaTarjeta || esCorreo(correo))
    && Object.keys(errFactura).length === 0;
  const setL = (i, k) => (e) => setLineas(lineas.map((l, j) => (j === i ? { ...l, [k]: e.target.value } : l)));

  async function cobrar() {
    setFallo('');
    const miIntento = ++intento.current;
    try {
      // 1) Si hay tarjeta, primero se obtiene el token con el formulario de Culqi
      let token;
      if (lineaTarjeta) {
        setEsperandoTarjeta(true);
        let montoTarjeta = cent(lineaTarjeta.monto);
        if (lineaTarjeta.moneda === 'USD') {
          // Se vuelve a leer el tipo de cambio justo antes de cobrar, por si cambió
          const t = await pedir('/reservas/tipo-cambio');
          setTc(Number(t.usd));
          montoTarjeta = Math.round(montoTarjeta / Number(t.usd));
        }
        token = await pedirTokenTarjeta({ centimos: montoTarjeta, email: correo.trim(), moneda: lineaTarjeta.moneda });
        if (miIntento !== intento.current) return; // el recepcionista canceló mientras tanto
        setEsperandoTarjeta(false);
      }

      // 2) Se envía todo al backend (él convierte a dólares si hace falta, crea el cargo y registra el pago)
      setEnviando(true);
      const resp = await pedir('/reservas/' + id + '/pagos', {
        method: 'POST',
        body: JSON.stringify({
          email: lineaTarjeta ? correo.trim() : undefined,
          comprobante: tipoComp === 'Factura'
            ? { tipo: 'Factura', comprador: { tipo_documento: 'RUC', numero_documento: fac.ruc.trim(), nombre: fac.razon.trim(), direccion: fac.direccion.trim() } }
            : { tipo: 'Boleta' },
          pagos: lineas.map((l) => ({
            metodo: l.metodo,
            medio: l.metodo === 'QR' ? l.medio : undefined,
            monto: cent(l.monto) / 100, // siempre en soles: es lo que se aplica a la reserva
            recibido: l.metodo === 'Efectivo' && l.recibido !== '' ? cent(l.recibido) / 100 : undefined,
            referencia: l.metodo !== 'Tarjeta' && l.referencia.trim() ? l.referencia.trim() : undefined,
            token: l === lineaTarjeta ? token : undefined,
            moneda: l.metodo === 'Tarjeta' ? l.moneda : undefined,
          })),
        }),
      });
      setRecibo({ total, vuelto, tarjeta: resp?.tarjeta, comprobante: resp?.comprobante || null });
    } catch (ex) {
      if (miIntento !== intento.current) return;
      setFallo(ex.message || 'No pudimos registrar el pago.');
      if (ex.estado === 409) cargar();
    } finally {
      if (miIntento === intento.current) { setEnviando(false); setEsperandoTarjeta(false); }
    }
  }

  // Si cerró el formulario de Culqi sin pagar, el botón se libera para volver a intentar
  const cancelarTarjeta = () => { intento.current++; setEsperandoTarjeta(false); setEnviando(false); };

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
                  {l.metodo === 'Tarjeta' && (
                    <>
                      <label className="fld">Moneda de la tarjeta
                        <select value={l.moneda} onChange={setL(i, 'moneda')}>
                          <option value="PEN">Soles (S/)</option>
                          <option value="USD" disabled={!tc}>Dólares (US$)</option>
                        </select>
                      </label>
                      <p className="muted">
                        {l.moneda === 'USD' && tc
                          ? `Se cobrarán ${dolares(usdCent(cent(l.monto)))} (tipo de cambio: S/ ${tc.toFixed(2)} por US$ 1). Se pedirá la tarjeta al registrar el pago.`
                          : 'Se pedirá la tarjeta al registrar el pago.'}
                      </p>
                    </>
                  )}
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

          <h2 style={{ marginTop: 40 }}>Comprobante</h2>
          <p className="muted" style={{ marginTop: -8 }}>
            Se emite al registrar el pago y se envía al correo del cliente
            {r.cliente?.correo ? <> (<strong>{r.cliente.correo}</strong>)</> : ' (no tiene correo: se entrega impreso)'}.
          </p>
          <fieldset className="cp-tipos">
            <legend className="sr-only">Tipo de comprobante</legend>
            {[
              ['Boleta', 'Boleta', `A nombre de ${r.cliente.nombres} ${r.cliente.apellidos}`],
              ['Factura', 'Factura', 'Con RUC y razón social'],
            ].map(([v, t, d]) => (
              <label key={v} className={'cp-tipo' + (tipoComp === v ? ' sel' : '')}>
                <input type="radio" name="tipoComp" value={v} checked={tipoComp === v} onChange={() => setTipoComp(v)} />
                <strong>{t}</strong><span>{d}</span>
              </label>
            ))}
          </fieldset>
          {tipoComp === 'Factura' && (
            <div className="cp-campos">
              <label className="fld">RUC
                <input inputMode="numeric" maxLength={11} value={fac.ruc} onChange={(e) => setFac({ ...fac, ruc: e.target.value.replace(/\D/g, '') })} placeholder="20123456789" />
                {fac.ruc && errFactura.ruc && <span className="cb-error">{errFactura.ruc}</span>}
              </label>
              <label className="fld lg">Razón social
                <input maxLength={200} value={fac.razon} onChange={(e) => setFac({ ...fac, razon: e.target.value })} />
              </label>
              <label className="fld lg">Dirección fiscal
                <input maxLength={250} value={fac.direccion} onChange={(e) => setFac({ ...fac, direccion: e.target.value })} />
              </label>
            </div>
          )}
        </section>

        <aside className="panel">
          <h2>Reserva</h2>
          <dl className="cb-datos">
            <div><dt>Cliente</dt><dd>{r.cliente.nombres} {r.cliente.apellidos}</dd></div>
            <div><dt>{r.cliente.tipo_documento || 'DNI'}</dt><dd>{r.cliente.numero_documento || r.cliente.dni}</dd></div>
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
          <button className="btn claro" disabled={!valido || enviando || esperandoTarjeta} onClick={cobrar}>
            {enviando ? 'Registrando…' : esperandoTarjeta ? 'Esperando la tarjeta…' : 'Registrar pago'}
          </button>
          {esperandoTarjeta && <button type="button" className="btn sec sm" onClick={cancelarTarjeta}>Cancelar</button>}
        </div>
      </div>
    </main>
  );
}