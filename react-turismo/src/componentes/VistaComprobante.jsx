import './vista-comprobante.css';

// Boleta o factura en pantalla, con el mismo formato que el PDF (representación impresa de SUNAT).
// Recibe la "representacion" que arma el Backend (servicios/representacion-comprobante.js).
const SIMBOLO = { PEN: 'S/', USD: 'US$' };
const num = (n) => Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (v) =>
  v ? new Date(v).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' }) : '—';

export default function VistaComprobante({ r, totalSoles }) {
  if (!r) return null;
  const s = SIMBOLO[r.moneda?.codigo] || 'S/';
  const k = r.adquirente;
  const esFactura = r.tipo === 'Factura';
  const t = r.totales;

  return (
    <article className="vc">
      <header className="vc-cabecera">
        <div className="vc-emisor">
          <strong className="vc-marca">{r.emisor.nombre_comercial}</strong>
          <span className="vc-razon">{r.emisor.razon_social}</span>
          <span>Domicilio fiscal: {r.emisor.domicilio_fiscal || 'no configurado'}</span>
          {r.emisor.establecimiento && r.emisor.establecimiento !== r.emisor.domicilio_fiscal && (
            <span>Establecimiento: {r.emisor.establecimiento}</span>
          )}
          {(r.emisor.telefono || r.emisor.correo) && (
            <span>
              {r.emisor.telefono && <>Teléfono: {r.emisor.telefono}</>}
              {r.emisor.telefono && r.emisor.correo && ' · '}
              {r.emisor.correo && <>Correo: {r.emisor.correo}</>}
            </span>
          )}
        </div>
        <div className="vc-recuadro">
          <span>R.U.C. N° {r.emisor.ruc || '—'}</span>
          <strong>{r.titulo}</strong>
          <b>N° {r.numero}</b>
        </div>
      </header>

      {r.faltan_datos_emisor?.length > 0 && (
        <p className="vc-aviso" role="status">Falta configurar: {r.faltan_datos_emisor.join(', ')}.</p>
      )}

      <div className="vc-bloque">
        <dl>
          <div><dt>Fecha de emisión:</dt><dd>{fecha(r.fecha_emision)}</dd></div>
          <div><dt>Señor(es):</dt><dd>{k ? k.nombre : 'Cliente varios'}</dd></div>
          <div><dt>{k ? (k.tipo_documento === 'RUC' ? 'RUC' : k.tipo_documento) : 'Documento'}:</dt><dd>{k ? k.numero_documento : '—'}</dd></div>
          {k?.direccion && <div><dt>Dirección:</dt><dd>{k.direccion}</dd></div>}
        </dl>
        <dl>
          <div><dt>Tipo de moneda:</dt><dd>{r.moneda.nombre} ({r.moneda.codigo})</dd></div>
          {r.forma_pago && <div><dt>Forma de pago:</dt><dd>{r.forma_pago}</dd></div>}
          {r.tipo_cambio && <div><dt>Tipo de cambio:</dt><dd>S/ {Number(r.tipo_cambio).toFixed(3)}</dd></div>}
          <div><dt>Código de reserva:</dt><dd>{r.codigo_reserva || '—'}</dd></div>
        </dl>
      </div>

      <div className="vc-tabla-envoltura">
        <table className="vc-tabla">
          <thead>
            <tr>
              <th className="centro">Cant.</th><th className="centro">U.M.</th><th>Descripción</th>
              <th className="num">V. unitario</th><th className="num">P. unitario</th>
              <th className="num">{esFactura ? 'Valor de venta' : 'Importe'}</th>
            </tr>
          </thead>
          <tbody>
            {r.items.map((it, i) => (
              <tr key={i}>
                <td className="centro">{it.cantidad}</td>
                <td className="centro" title={it.unidad_texto}>{it.unidad}</td>
                <td>{it.descripcion}</td>
                <td className="num">{num(it.valor_unitario)}</td>
                <td className="num">{num(it.precio_unitario)}</td>
                <td className="num">{num(esFactura ? it.valor_venta : it.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="vc-nota">
        U.M.: ZZ = servicio · V. unitario: sin IGV · P. unitario: con IGV · {esFactura ? 'Valor de venta: sin IGV.' : 'Importe: con IGV.'}
      </p>

      <div className="vc-resumen">
        <section className="vc-observaciones">
          <h3>Observaciones</h3>
          <p>Pasajeros:</p>
          <ol>
            {r.pasajeros.map((p, i) => (
              <li key={i}>{p.nombre}{p.titular ? ' (titular)' : ''} - {p.documento}</li>
            ))}
          </ol>
        </section>
        <dl className="vc-totales">
          <div><dt>Op. gravada</dt><dd>{s} {num(t.op_gravada ?? t.valor_venta)}</dd></div>
          <div><dt>Op. exonerada</dt><dd>{s} {num(t.op_exonerada)}</dd></div>
          <div><dt>{t.exportacion ? 'Exportación' : 'Op. inafecta'}</dt><dd>{s} {num(t.op_inafecta)}</dd></div>
          <div><dt>IGV ({Math.round(t.igv_tasa * 100)} %)</dt><dd>{s} {num(t.igv)}</dd></div>
          <div className="vc-total"><dt>Importe total</dt><dd>{s} {num(t.total)}</dd></div>
        </dl>
      </div>

      <p className="vc-letras">{r.importe_letras}</p>
      {r.tipo_cambio && totalSoles != null && (
        <p className="vc-nota">
          Equivalente en soles: S/ {num(totalSoles)} (tipo de cambio S/ {Number(r.tipo_cambio).toFixed(3)} por US$ 1).
        </p>
      )}

      <footer className="vc-pie">
        {r.qr_png && <img className="vc-qr" src={r.qr_png} alt={`Código QR del comprobante ${r.numero}`} />}
        <div>
          <p className="vc-leyenda">{r.pie}</p>
          {r.valor_resumen && <p>Valor resumen: {r.valor_resumen}</p>}
          {r.emitido_por && <p>Emitido por: {r.emitido_por}</p>}
        </div>
      </footer>
    </article>
  );
}
