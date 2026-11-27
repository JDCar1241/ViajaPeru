import PDFDocument from 'pdfkit';
import { representacion, formatoImporte, numeroCompleto, qrPng } from './representacion-comprobante.js';

export { numeroCompleto };

// Formato de la representación impresa (como la de SUNAT): emisor y recuadro con RUC, denominación y
// número; bloque del adquirente; detalle con bordes; resumen de operaciones e IGV; importe en letras;
// código QR y leyenda al pie. Todos los datos salen de representacion() (los mismos de la pantalla).

const NAVY = '#0A2540', BLUE = '#1456D6', GRIS = '#55657A', LINEA = '#B8C4D6', SKY = '#EAF2FF', ROJO = '#B3261E';
const LIMA = { timeZone: 'America/Lima' };
const fFecha = (v) => new Date(v).toLocaleDateString('es-PE', { ...LIMA, day: '2-digit', month: '2-digit', year: 'numeric' });
const num = (n) => Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function generarPdf(c) {
  const r = representacion(c);
  const qr = await qrPng(r.qr_texto);
  const m = r.moneda.codigo;
  const esFactura = r.tipo === 'Factura';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `${r.titulo} ${r.numero}`, Author: r.emisor.razon_social } });
    const partes = [];
    doc.on('data', (p) => partes.push(p));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const X = 40, ANCHO = 515, DER = X + ANCHO;
    const linea = (x1, y1, x2, y2) => doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(0.6).strokeColor(LINEA).stroke();
    const caja = (x, y, w, h) => doc.rect(x, y, w, h).lineWidth(0.8).strokeColor(LINEA).stroke();

    // ================= 1. EMISOR + RECUADRO DEL RUC =================
    const anchoEmisor = 320;
    doc.font('Helvetica-Bold').fontSize(20).fillColor(NAVY).text(r.emisor.nombre_comercial, X, 42, { width: anchoEmisor });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text(r.emisor.razon_social, X, doc.y + 2, { width: anchoEmisor });
    doc.font('Helvetica').fontSize(8.5).fillColor(GRIS);
    doc.text(`Domicilio fiscal: ${r.emisor.domicilio_fiscal || 'no configurado'}`, X, doc.y + 2, { width: anchoEmisor });
    if (r.emisor.establecimiento && r.emisor.establecimiento !== r.emisor.domicilio_fiscal) {
      doc.text(`Establecimiento: ${r.emisor.establecimiento}`, X, doc.y + 1, { width: anchoEmisor });
    }
    const contacto = [r.emisor.telefono && `Teléfono: ${r.emisor.telefono}`, r.emisor.correo && `Correo: ${r.emisor.correo}`].filter(Boolean).join('   ');
    if (contacto) doc.text(contacto, X, doc.y + 1, { width: anchoEmisor });
    const yFinEmisor = doc.y;

    const RX = DER - 185, RW = 185, RY = 40, RH = 82;
    doc.roundedRect(RX, RY, RW, RH, 6).lineWidth(1.4).strokeColor(NAVY).stroke();
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(`R.U.C. N° ${r.emisor.ruc || '—'}`, RX, RY + 12, { width: RW, align: 'center' });
    doc.rect(RX + 1, RY + 30, RW - 2, 22).fill(NAVY);
    doc.font('Helvetica-Bold').fontSize(r.titulo.length > 18 ? 9 : 10.5).fillColor('#FFFFFF').text(r.titulo, RX, RY + 37, { width: RW, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text(`N° ${r.numero}`, RX, RY + 60, { width: RW, align: 'center' });

    let y = Math.max(yFinEmisor, RY + RH) + 10;
    if (r.faltan_datos_emisor.length) {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(ROJO).text(`Falta configurar: ${r.faltan_datos_emisor.join(', ')}.`, X, y, { width: ANCHO });
      y = doc.y + 6;
    }

    // ================= 2. DATOS DEL COMPROBANTE Y DEL ADQUIRENTE =================
    const k = r.adquirente;
    const izquierda = [
      ['Fecha de emisión', fFecha(r.fecha_emision)],
      ['Señor(es)', k ? k.nombre : 'Cliente varios'],
      [k ? (k.tipo_documento === 'RUC' ? 'RUC' : k.tipo_documento) : 'Documento', k ? k.numero_documento : '—'],
      ...(k?.direccion ? [['Dirección', k.direccion]] : []),
    ];
    const derecha = [
      ['Tipo de moneda', `${r.moneda.nombre} (${m})`],
      ...(r.forma_pago ? [['Forma de pago', r.forma_pago]] : []),
      ...(r.tipo_cambio ? [['Tipo de cambio', `S/ ${r.tipo_cambio.toFixed(3)}`]] : []),
      ['Código de reserva', r.codigo_reserva || '—'],
    ];
    const yCaja = y;
    const fila = (pares, x, w) => {
      let yy = yCaja + 8;
      for (const [et, val] of pares) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY).text(`${et}:`, x, yy, { width: 92 });
        doc.font('Helvetica').fontSize(8.5).fillColor(NAVY).text(val, x + 94, yy, { width: w - 100 });
        yy = Math.max(doc.y, yy + 11) + 3;
      }
      return yy;
    };
    const yIzq = fila(izquierda, X + 8, 300);
    const yDer = fila(derecha, X + 320, ANCHO - 320);
    const hCaja = Math.max(yIzq, yDer) - yCaja + 4;
    caja(X, yCaja, ANCHO, hCaja);
    y = yCaja + hCaja + 12;

    // ================= 3. DETALLE =================
    const cols = [
      { t: 'CANT.', w: 38, a: 'center' },
      { t: 'U.M.', w: 36, a: 'center' },
      { t: 'DESCRIPCIÓN', w: 231, a: 'left' },
      { t: 'V. UNITARIO', w: 70, a: 'right' },
      { t: 'P. UNITARIO', w: 64, a: 'right' },
      { t: (esFactura ? 'VALOR DE VENTA' : 'IMPORTE'), w: 76, a: 'right' },
    ];
    const xs = cols.reduce((acc, c0, i) => [...acc, i === 0 ? X : acc[i - 1] + cols[i - 1].w], []);
    doc.rect(X, y, ANCHO, 20).fill(SKY);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(NAVY);
    cols.forEach((c0, i) => doc.text(c0.t, xs[i] + 4, y + 7, { width: c0.w - 8, align: c0.a }));
    const yTablaIni = y;
    y += 20;
    for (const it of r.items) {
      const valores = [
        String(it.cantidad), it.unidad, it.descripcion,
        num(it.valor_unitario), num(it.precio_unitario), num(esFactura ? it.valor_venta : it.importe),
      ];
      doc.font('Helvetica').fontSize(8.5).fillColor(NAVY);
      const alto = Math.max(20, doc.heightOfString(it.descripcion, { width: cols[2].w - 8 }) + 12);
      valores.forEach((v, i) => doc.text(v, xs[i] + 4, y + 6, { width: cols[i].w - 8, align: cols[i].a }));
      y += alto;
      linea(X, y, DER, y);
    }
    caja(X, yTablaIni, ANCHO, y - yTablaIni);
    xs.slice(1).forEach((x) => linea(x, yTablaIni, x, y));
    doc.font('Helvetica').fontSize(7).fillColor(GRIS).text(
      `U.M.: ZZ = servicio. V. unitario: sin IGV. P. unitario: con IGV. ${esFactura ? 'Valor de venta: sin IGV.' : 'Importe: con IGV.'}`,
      X, y + 4, { width: ANCHO });
    y = doc.y + 10;

    // ================= 4. OBSERVACIONES (pasajeros) Y RESUMEN =================
    const TX = DER - 210, TW = 210;
    const yBloque = y;

    doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY).text('OBSERVACIONES', X, y);
    doc.font('Helvetica').fontSize(8.5).fillColor(NAVY);
    doc.text('Pasajeros:', X, doc.y + 3, { width: TX - X - 16 });
    r.pasajeros.forEach((p, i) => {
      doc.text(`${i + 1}. ${p.nombre}${p.titular ? ' (titular)' : ''} - ${p.documento}`, X + 6, doc.y + 1, { width: TX - X - 22 });
    });
    const yObs = doc.y;

    const filasTotal = [
      ['Op. gravada', r.totales.op_gravada],
      ['Op. exonerada', r.totales.op_exonerada],
      [r.totales.exportacion ? 'Exportación' : 'Op. inafecta', r.totales.op_inafecta],
      [`IGV (${Math.round(r.totales.igv_tasa * 100)} %)`, r.totales.igv],
    ];
    let yt = yBloque;
    for (const [et, val] of filasTotal) {
      doc.font('Helvetica').fontSize(8.5).fillColor(NAVY);
      doc.text(et, TX + 8, yt + 5, { width: 110 });
      doc.text(formatoImporte(val, m), TX + 110, yt + 5, { width: TW - 118, align: 'right' });
      yt += 17;
      linea(TX, yt, DER, yt);
    }
    doc.rect(TX, yt, TW, 22).fill(NAVY);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF');
    doc.text('IMPORTE TOTAL', TX + 8, yt + 7, { width: 110 });
    doc.text(formatoImporte(r.totales.total, m), TX + 100, yt + 7, { width: TW - 108, align: 'right' });
    yt += 22;
    caja(TX, yBloque, TW, yt - yBloque);

    y = Math.max(yObs, yt) + 10;
    doc.rect(X, y, ANCHO, 20).lineWidth(0.8).strokeColor(LINEA).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY).text(r.importe_letras, X + 8, y + 6, { width: ANCHO - 16 });
    y += 20;
    if (r.tipo_cambio) {
      doc.font('Helvetica').fontSize(8).fillColor(GRIS)
        .text(`Equivalente en soles: ${formatoImporte(c.total, 'PEN')} (tipo de cambio S/ ${r.tipo_cambio.toFixed(3)} por US$ 1).`, X, y + 4, { width: ANCHO });
      y = doc.y;
    }

    // ================= 5. QR Y LEYENDA =================
    y += 14;
    if (y > 700) { doc.addPage(); y = 40; }
    const QR = 86;
    doc.image(qr, X, y, { width: QR, height: QR });
    const tx = X + QR + 14, tw = ANCHO - QR - 14;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY).text(r.pie, tx, y + 6, { width: tw });
    if (r.valor_resumen) doc.font('Helvetica').fontSize(8).fillColor(GRIS).text(`Valor resumen: ${r.valor_resumen}`, tx, doc.y + 4, { width: tw });
    if (r.emitido_por) doc.font('Helvetica').fontSize(8).fillColor(GRIS).text(`Emitido por: ${r.emitido_por}`, tx, doc.y + 4, { width: tw });

    doc.end();
  });
}
