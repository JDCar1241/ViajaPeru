import { useEffect, useState } from 'react';
import './cobros.css';
import './comprobante.css';
import { pedir } from './api-reservas.js';
import { getSesion, useSesion } from './auth.js';
import { soles } from './moneda.js';

const ROLES = ['Recepcionista', 'Gerente'];
const LIMITE = 700; // desde este total la boleta debe identificar al comprador
const DOCS = [['DNI', 'DNI'], ['CE', 'Carné de extranjería'], ['Pasaporte', 'Pasaporte']];
const TIPOS = [
  { v: 'simple', t: 'Boleta simple', d: 'Sin datos del comprador.' },
  { v: 'boleta', t: 'Boleta con documento', d: 'Con DNI, CE o pasaporte.' },
  { v: 'factura', t: 'Factura', d: 'Con RUC y razón social.' },
];
const limpiar = (v) => v.replace(/\s+/g, '').toUpperCase();
const errDoc = (tipo, n) => {
  const x = limpiar(n);
  if (tipo === 'DNI') return /^\d{8}$/.test(x) ? '' : 'El DNI tiene 8 dígitos.';
  return /^[A-Z0-9]{6,15}$/.test(x) ? '' : 'Escribe entre 6 y 15 letras o números.';
};
const numeroCompleto = (c) => `${c.serie}-${String(c.numero).padStart(8, '0')}`;
const fecha = (v) => new Date(v).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });

export default function Comprobante({ id }) {
  const sesion = useSesion();
  const [r, setR] = useState(null);
  const [comp, setComp] = useState(null);
  const [carga, setCarga] = useState('cargando');
  const [tipo, setTipo] = useState('simple');
  const [doc, setDoc] = useState({ tipo_documento: 'DNI', numero_documento: '', nombre: '' });
  const [fac, setFac] = useState({ ruc: '', razon: '', direccion: '' });
  const [err, setErr] = useState({});
  const [fallo, setFallo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [pdfError, setPdfError] = useState('');

  const cargar = async () => {
    setCarga('cargando');
    try {
      const d = await pedir('/reservas/' + id);
      let c = null;
      if (d.estado === 'Pagada') {
        try { c = await pedir('/reservas/' + id + '/comprobante'); }
        catch (ex) { if (ex.estado !== 404) throw ex; }
      }
      setR(d); setComp(c);
      setTipo(Number(d.total) > LIMITE ? 'boleta' : 'simple');
      setDoc({
        tipo_documento: d.cliente.tipo_documento || 'DNI',
        numero_documento: d.cliente.numero_documento || d.cliente.dni || '',
        nombre: `${d.cliente.nombres} ${d.cliente.apellidos}`,
      });
      setCarga('listo');
    } catch { setCarga('error'); }
  };
  useEffect(() => { if (!sesion) { window.location.hash = '#/login'; return; } cargar(); }, [id, sesion]);

  if (!sesion) return null;
  if (!ROLES.includes(sesion.usuario.rol)) return <main><div className="error"><strong>Tu rol no puede emitir comprobantes.</strong></div></main>;
  if (carga === 'cargando') return <main><div className="skeleton" /></main>;
  if (carga === 'error') return <main><div className="error"><strong>No pudimos cargar la reserva.</strong><p><button className="btn sec" onClick={cargar}>Reintentar</button></p></div></main>;

  if (r.estado !== 'Pagada') return (
    <main className="cb-fin"><h1>Primero hay que cobrar la reserva</h1>
      <p className="muted">{r.codigo} está en estado «{r.estado}».</p>
      <p><a className="btn" href={'#/cobrar/' + id}>Ir a cobrar</a></p></main>
  );

  const total = Number(r.total);
  const personas = r.num_personas;

  // El PDF se pide con el token; un enlace normal no puede enviarlo.
  async function abrirPdf(modo) {
    setPdfError('');
    const ventana = modo === 'imprimir' ? window.open('', '_blank') : null;
    try {
      const resp = await fetch('/api/comprobantes/' + comp.id + '/pdf', { headers: { Authorization: 'Bearer ' + getSesion().token } });
      if (!resp.ok) throw new Error();
      const url = URL.createObjectURL(await resp.blob());
      if (ventana) ventana.location.href = url;
      else { const a = document.createElement('a'); a.href = url; a.download = `${numeroCompleto(comp)}.pdf`; a.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { ventana?.close(); setPdfError('No pudimos obtener el PDF. Inténtalo de nuevo.'); }
  }

  if (comp) return (
    <main className="cb-fin">
      <p className="pill">Comprobante emitido</p>
      <h1>{numeroCompleto(comp)}</h1>
      <p className="muted">{comp.tipo} · {r.codigo} · {soles(total)}</p>
      {comp.comprador && (
        <dl className="cp-resumen">
          <div><dt>{comp.comprador.tipo_documento}</dt><dd>{comp.comprador.numero_documento}</dd></div>
          <div><dt>{comp.tipo === 'Factura' ? 'Razón social' : 'Nombre'}</dt><dd>{comp.comprador.nombre}</dd></div>
        </dl>
      )}
      {pdfError && <p className="cb-error" role="alert">{pdfError}</p>}
      <p className="cb-botones">
        <button className="btn" onClick={() => abrirPdf('descargar')}>Descargar PDF</button>
        <button className="btn sec" onClick={() => abrirPdf('imprimir')}>Imprimir</button>
      </p>

      <p><a href="#/cobros">Volver a reservas</a> · <a href="#/paquetes">Registrar otra reserva</a></p>
    </main>
  );

  function validar() {
    const n = {};
    if (tipo === 'simple' && total > LIMITE) n.tipo = `Con un total mayor a S/ ${LIMITE} debes identificar al comprador.`;
    if (tipo === 'boleta') {
      const e = errDoc(doc.tipo_documento, doc.numero_documento);
      if (e) n.numero = e;
      if (!doc.nombre.trim()) n.nombre = 'Escribe el nombre del comprador.';
    }
    if (tipo === 'factura') {
      if (!/^\d{11}$/.test(fac.ruc.trim())) n.ruc = 'El RUC tiene 11 dígitos.';
      if (!fac.razon.trim()) n.razon = 'Escribe la razón social.';
      if (!fac.direccion.trim()) n.direccion = 'Escribe la dirección.';
    }
    return n;
  }

  async function emitir(e) {
    e.preventDefault();
    const n = validar(); setErr(n); setFallo('');
    if (Object.keys(n).length) return;
    const cuerpo = tipo === 'simple' ? { tipo: 'Boleta' }
      : tipo === 'boleta' ? { tipo: 'Boleta', comprador: { tipo_documento: doc.tipo_documento, numero_documento: limpiar(doc.numero_documento), nombre: doc.nombre.trim() } }
      : { tipo: 'Factura', comprador: { tipo_documento: 'RUC', numero_documento: fac.ruc.trim(), nombre: fac.razon.trim(), direccion: fac.direccion.trim() } };
    setEnviando(true);
    try {
      const d = await pedir('/reservas/' + id + '/comprobante', { method: 'POST', body: JSON.stringify(cuerpo) });
      setComp({ ...d, tipo: cuerpo.tipo, comprador: cuerpo.comprador });
    } catch (ex) {
      setFallo(ex.message || 'No pudimos emitir el comprobante.');
      if (ex.estado === 409) cargar();
    } finally { setEnviando(false); }
  }

  const setD = (k) => (e) => setDoc({ ...doc, [k]: e.target.value });
  const setF = (k) => (e) => setFac({ ...fac, [k]: e.target.value });

  return (
    <main>
      <a className="volver" href="#/cobros">← Reservas</a>
      <h1>Emitir comprobante</h1>
      <p className="muted">{r.codigo} · {r.paquete.nombre}</p>

      <div className="cols">
        <form onSubmit={emitir} noValidate>
          <fieldset className="cp-tipos">
            <legend>Tipo de comprobante</legend>
            {TIPOS.map((o) => {
              const bloqueado = o.v === 'simple' && total > LIMITE;
              return (
                <label key={o.v} className={'cp-tipo' + (tipo === o.v ? ' sel' : '') + (bloqueado ? ' dis' : '')}>
                  <input type="radio" name="tipo" value={o.v} checked={tipo === o.v} disabled={bloqueado} onChange={() => { setTipo(o.v); setErr({}); }} />
                  <strong>{o.t}</strong><span>{o.d}</span>
                </label>
              );
            })}
          </fieldset>
          {total > LIMITE && <p className="cp-aviso">El total supera S/ {LIMITE}: la boleta debe identificar al comprador.</p>}

          {tipo === 'boleta' && (
            <div className="cp-campos">
              <label className="fld">Tipo de documento
                <select value={doc.tipo_documento} onChange={setD('tipo_documento')}>{DOCS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
              </label>
              <label className="fld">Número
                <input value={doc.numero_documento} onChange={setD('numero_documento')} maxLength={15} aria-invalid={!!err.numero} />
                {err.numero && <span className="cb-error" role="alert">{err.numero}</span>}
              </label>
              <label className="fld lg">Nombre completo
                <input value={doc.nombre} onChange={setD('nombre')} aria-invalid={!!err.nombre} />
                {err.nombre && <span className="cb-error" role="alert">{err.nombre}</span>}
              </label>
            </div>
          )}

          {tipo === 'factura' && (
            <div className="cp-campos">
              <label className="fld">RUC
                <input inputMode="numeric" maxLength={11} value={fac.ruc} onChange={setF('ruc')} aria-invalid={!!err.ruc} />
                {err.ruc && <span className="cb-error" role="alert">{err.ruc}</span>}
              </label>
              <label className="fld lg">Razón social
                <input value={fac.razon} onChange={setF('razon')} aria-invalid={!!err.razon} />
                {err.razon && <span className="cb-error" role="alert">{err.razon}</span>}
              </label>
              <label className="fld lg">Dirección fiscal
                <input value={fac.direccion} onChange={setF('direccion')} aria-invalid={!!err.direccion} />
                {err.direccion && <span className="cb-error" role="alert">{err.direccion}</span>}
              </label>
            </div>
          )}

          {err.tipo && <p className="cb-error" role="alert">{err.tipo}</p>}
          {fallo && <p className="cb-error" role="alert">{fallo}</p>}
          <p><button className="btn" disabled={enviando}>{enviando ? 'Emitiendo…' : 'Emitir comprobante'}</button></p>
        </form>

        <aside className="panel">
          <h2>Datos de la compra</h2>
          <dl className="cb-datos">
            <div><dt>Código</dt><dd>{r.codigo}</dd></div>
            <div><dt>Paquete</dt><dd>{r.paquete.nombre}</dd></div>
            <div><dt>Inicio del viaje</dt><dd>{fecha(r.fecha_inicio_viaje)}</dd></div>
            <div><dt>Titular</dt><dd>{r.cliente.nombres} {r.cliente.apellidos}</dd></div>
            <div><dt>Personas</dt><dd>{personas}</dd></div>
            <div><dt>Costo individual</dt><dd>{soles(total / personas)}</dd></div>
            <div><dt>Total</dt><dd>{soles(total)}</dd></div>
          </dl>
          <p className="muted">El PDF incluirá también a los acompañantes.</p>
        </aside>
      </div>
    </main>
  );
}