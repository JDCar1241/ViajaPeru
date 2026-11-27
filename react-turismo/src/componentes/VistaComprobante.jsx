import './vista-comprobante.css';

// Boleta o factura en pantalla. Recibe la "representacion" que arma el Backend
// (servicios/representacion-comprobante.js): los mismos datos que el PDF.
const SIMBOLO = { PEN: 'S/', USD: 'US$' };
const num = (n) => Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (v) =>
  v ? new Date(v).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' }) : '—';

export default function VistaComprobante({ r, totalSoles }) {
  if (!r) return null;
  const s = SIMBOLO[r.moneda?.codigo] || 'S/';
  const k = r.adquirente;

  return (
    <article className="vc">
      <header className="vc-cabecera">
        <div>
          <strong className="vc-marca">{r.emisor.nombre_comercial}</strong>
          <span className="vc-razon">{r.emisor.razon_social}</span>
          <span>Domicilio fiscal: {r.emisor.domicilio_fiscal || 'no configurado'}</span>
        </div>
        <div className="vc-recuadro">
          <span>R.U.C. {r.emisor.ruc || '— (no configurado)'}</span>
          <strong>{r.titulo}</strong>
          <b>{r.numero}</b>
        </div>
      </header>

      {r.faltan_datos_emisor?.length > 0 && (
        <p className="vc-aviso" role="status">Falta configurar: {r.faltan_datos_emisor.join(', ')}.</p>
      )}

      <dl className="vc-datos">
        <div><dt>Fecha de emisión</dt><dd>{fecha(r.fecha_emision)}</dd></div>
        <div><dt>Moneda</dt><dd>{r.moneda.nombre} ({r.moneda.codigo})</dd></div>
        {r.forma_pago && <div><dt>Forma de pago</dt><dd>{r.forma_pago}</dd></div>}
        {r.tipo_cambio && <div><dt>Tipo de cambio</dt><dd>S/ {Number(r.tipo_cambio).toFixed(3)}</dd></div>}
        <div><dt>Código de reserva</dt><dd>{r.codigo_reserva || '—'}</dd></div>
      </dl>

      <section className="vc-adquirente">
        <h3>{r.tipo === 'Factura' ? 'Adquirente (señor(es))' : 'Adquirente'}</h3>
        {k ? (
          <>
            <p><strong>{k.nombre}</strong></p>
            <p>{k.tipo_documento} N.° {k.numero_documento}</p>
            {k.direccion && <p>Dirección: {k.direccion}</p>}
          </>
        ) : (
          <p>Cliente varios (boleta sin identificar, hasta S/ 700)</p>
        )}
      </section>

      <div className="vc-tabla-envoltura">
        <table className="vc-tabla">
          <thead>
            <tr>
              <th>Cant.</th><th>U.M.</th><th>Descripción</th>
              <th className="num">V. unit.</th><th className="num">P. unit.</th><th className="num">Importe</th>
            </tr>
          </thead>
          <tbody>
            {r.items.map((it, i) => (
              <tr key={i}>
                <td>{it.cantidad}</td>
                <td title={it.unidad_texto}>{it.unidad}</td>
                <td>{it.descripcion}</td>
                <td className="num">{num(it.valor_unitario)}</td>
                <td className="num">{num(it.precio_unitario)}</td>
                <td className="num">{num(it.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="vc-nota">U.M. ZZ = servicio · V. unit.: valor unitario sin IGV · P. unit.: precio unitario con IGV.</p>

      <section className="vc-pasajeros">
        <h3>Pasajeros</h3>
        <ol>
          {r.pasajeros.map((p, i) => (
            <li key={i}>{p.nombre}{p.titular ? ' (titular)' : ''} · {p.documento}</li>
          ))}
        </ol>
      </section>

      <dl className="vc-totales">
        <div><dt>{r.totales.operacion}</dt><dd>{s} {num(r.totales.valor_venta)}</dd></div>
        <div><dt>IGV ({Math.round(r.totales.igv_tasa * 100)} %)</dt><dd>{s} {num(r.totales.igv)}</dd></div>
        <div className="vc-total"><dt>Importe total</dt><dd>{s} {num(r.totales.total)}</dd></div>
      </dl>
      <p className="vc-letras">{r.importe_letras}</p>
      {r.tipo_cambio && totalSoles != null && (
        <p className="vc-nota">
          Equivalente en soles: S/ {num(totalSoles)} (tipo de cambio S/ {Number(r.tipo_cambio).toFixed(3)} por US$ 1).
        </p>
      )}

      <footer className="vc-pie">
        {r.emitido_por && <p>Emitido por: {r.emitido_por}</p>}
        <p>{r.pie}</p>
      </footer>
    </article>
  );
}
