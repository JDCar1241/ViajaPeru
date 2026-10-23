import './reservas.css';
import { ultima } from './api-reservas.js';

const fecha = (v) => new Date(v).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });

export default function Confirmacion() {
  const r = ultima.datos;
  if (!r) return <main className="vp-centro"><div className="vp-panel"><p>No hay una reserva reciente.</p><a className="vp-btn" href="#/paquetes">Ir al catálogo</a></div></main>;
  const codigo = r.codigo || r.id;
  return (
    <main className="vp-centro">
      <article className="vp-ticket">
        <div className="vp-ticket__cuerpo">
          <p className="vp-ok">Reserva registrada</p>
          <h1>{r.paquete}</h1>
          <dl>
            <div><dt>Salida</dt><dd>{fecha(r.fecha)}</dd></div>
            <div><dt>Cliente</dt><dd>{r.cliente.nombres} {r.cliente.apellidos}</dd></div>
            <div><dt>DNI</dt><dd>{r.cliente.dni}</dd></div>
            <div><dt>Personas</dt><dd>{r.personas}</dd></div>
          </dl>
          {r.acompanantes.length > 0 && (
            <ul className="vp-lista">{r.acompanantes.map((a) => <li key={a.dni}>{a.nombres} {a.apellidos} · DNI {a.dni}</li>)}</ul>
          )}
        </div>
        <div className="vp-ticket__talon"><span>Código</span><strong>{codigo}</strong></div>
      </article>
      <p className="vp-fila-botones">
        <a className="vp-btn" href={'#/cobrar/' + r.id}>Cobrar ahora</a>
        <a className="vp-btn vp-btn--borde" href="#/paquetes">Registrar otra reserva</a>
        <button className="vp-btn vp-btn--borde" onClick={() => window.print()}>Imprimir</button>
      </p>
    </main>
  );
}