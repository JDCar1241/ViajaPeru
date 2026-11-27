import PDFDocument from 'pdfkit';
import { representacion, formatoImporte, numeroCompleto } from './representacion-comprobante.js';

export { numeroCompleto };

const NAVY = '#0A2540', BLUE = '#1456D6', GRIS = '#55657A', LINEA = '#DCE4EF', SKY = '#EAF2FF', ROJO = '#B3261E';
const LIMA = { timeZone: 'America/Lima' };
const fFecha = (v) => new Date(v).toLocaleDateString('es-PE', { ...LIMA, day: '2-digit', month: '2-digit', year: 'numeric' });
const num = (n) => Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Recibe lo que devuelve obtener_comprobante y entrega el PDF en un Buffer.
// Todos los datos salen de representacion() (los mismos que ven el personal y el cliente).
export function generarPdf(c) {
  const r = representacion(c);
  const m = r.moneda.codigo;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `${r.titulo} ${r.numero}`, Author: r.emisor.razon_social } });
    const partes = [];
    doc.on('data', (p) => partes.push(p));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const X = 48, ANCHO = 499;
    const dato = (etiqueta, valor, x, y, w) => {
      doc.font('Helvetica').fontSize(7.5).fillColor(GRIS).text(etiqueta.toUpperCase(), x, y, { width: w });
      doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text(valor || '—', x, y + 11, { width: w });
    };

    // ---- Emisor ----
    doc.font('Helvetica-Bold').fontSize(22).fillColor(NAVY).text(r.emisor.nombre_comercial, X, 46, { width: 310 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text(r.emisor.razon_social, X, doc.y + 2, { width: 310 });
    doc.font('Helvetica').fontSize(9).fillColor(GRIS);
    doc.text(`Domicilio fiscal: ${r.emisor.domicilio_fiscal || 'no configurado'}`, X, doc.y + 2, { width: 310 });
    if (r.emisor.establecimiento && r.emisor.establecimiento !== r.emisor.domicilio_fiscal) {
      doc.text(`Establecimiento (punto de emisión): ${r.emisor.establecimiento}`, X, doc.y + 2, { width: 310 });
    }
    const yEmisor = doc.y;

    // ---- Recuadro: RUC, denominación, serie y número ----
    doc.roundedRect(372, 44, 175, 78, 8).lineWidth(1.5).strokeColor(BLUE).stroke();
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY)
      .text(`R.U.C. ${r.emisor.ruc || '— (no configurado)'}`, 372, 54, { width: 175, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(r.titulo, 372, 72, { width: 175, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(14).fillColor(BLUE).text(r.numero, 372, 94, { width: 175, align: 'center' });

    let y = Math.max(yEmisor, 122) + 12;
    if (r.faltan_datos_emisor.length) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(ROJO)
        .text(`Falta configurar: ${r.faltan_datos_emisor.join(', ')}.`, X, y, { width: ANCHO });
      y = doc.y + 6;
    }
    doc.moveTo(X, y).lineTo(X + ANCHO, y).lineWidth(1).strokeColor(LINEA).stroke();
    y += 12;

    // ---- Datos del comprobante ----
    // Columnas iguales según cuántos datos haya (forma de pago y tipo de cambio son opcionales)
    const campos = [
      ['Fecha de emisión', fFecha(r.fecha_emision)],
      ['Moneda', `${r.moneda.nombre} (${m})`],
      r.forma_pago && ['Forma de pago', r.forma_pago],
      r.tipo_cambio && ['Tipo de cambio', `S/ ${r.tipo_cambio.toFixed(3)}`],
      ['Código de reserva', r.codigo_reserva],
    ].filter(Boolean);
    const anchoCol = ANCHO / campos.length;
    let yDatos = y;
    campos.forEach(([etiqueta, valor], i) => {
      dato(etiqueta, valor, X + i * anchoCol, y, anchoCol - 10);
      yDatos = Math.max(yDatos, doc.y);
    });
    y = yDatos + 14;

    // ---- Adquirente ----
    const k = r.adquirente;
    doc.font('Helvetica').fontSize(7.5).fillColor(GRIS).text(r.tipo === 'Factura' ? 'ADQUIRENTE (SEÑOR(ES))' : 'ADQUIRENTE', X, y);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY);
    if (!k) doc.text('Cliente varios (boleta sin identificar, hasta S/ 700)', X, y + 11, { width: ANCHO });
    else {
      doc.text(`${k.nombre}`, X, y + 11, { width: ANCHO });
      doc.font('Helvetica').fontSize(9.5).fillColor(GRIS).text(`${k.tipo_documento} N.° ${k.numero_documento}`, X, doc.y + 1, { width: ANCHO });
      if (k.direccion) doc.text(`Dirección: ${k.direccion}`, X, doc.y + 1, { width: ANCHO });
    }
    y = doc.y + 16;

    // ---- Detalle (cantidad, unidad, descripción, valor y precio unitario, importe) ----
    // Columnas numéricas alineadas a la derecha; la última es más ancha para "VALOR DE VENTA" (factura)
    const COL = { cant: X + 6, um: X + 40, desc: X + 80, vu: X + 268, pu: X + 334, imp: X + 400 };
    doc.rect(X, y, ANCHO, 22).fill(SKY);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY);
    doc.text('CANT.', COL.cant, y + 7).text('U.M.', COL.um, y + 7).text('DESCRIPCIÓN', COL.desc, y + 7)
      .text('V. UNIT.', COL.vu, y + 7, { width: 62, align: 'right' })
      .text('P. UNIT.', COL.pu, y + 7, { width: 58, align: 'right' })
      .text(r.columna_importe.toUpperCase(), COL.imp, y + 7, { width: 93, align: 'right' });
    y += 22;
    for (const it of r.items) {
      doc.font('Helvetica').fontSize(9).fillColor(NAVY);
      doc.text(String(it.cantidad), COL.cant, y + 7).text(`${it.unidad}`, COL.um, y + 7);
      doc.text(it.descripcion, COL.desc, y + 7, { width: 180 });
      const alto = Math.max(doc.y - y, 22);
      doc.text(num(it.valor_unitario), COL.vu, y + 7, { width: 62, align: 'right' })
        .text(num(it.precio_unitario), COL.pu, y + 7, { width: 58, align: 'right' })
        .text(num(r.tipo === 'Factura' ? it.valor_venta : it.importe), COL.imp, y + 7, { width: 93, align: 'right' });
      y += alto + 6;
      doc.moveTo(X, y).lineTo(X + ANCHO, y).lineWidth(0.5).strokeColor(LINEA).stroke();
    }
    doc.font('Helvetica').fontSize(7.5).fillColor(GRIS).text(`U.M.: ZZ = servicio. V. unit.: valor unitario sin IGV. P. unit.: precio unitario con IGV.${r.tipo === 'Factura' ? ' Valor de venta: sin IGV.' : ' Importe: con IGV.'}`, X, y + 4, { width: ANCHO });
    y = doc.y + 12;

    // ---- Pasajeros ----
    doc.font('Helvetica-Bold').fontSize(8).fillColor(GRIS).text('PASAJEROS', X, y);
    y = doc.y + 3;
    doc.font('Helvetica').fontSize(9).fillColor(NAVY);
    r.pasajeros.forEach((p, i) => {
      if (y > 700) { doc.addPage(); y = 48; }
      doc.text(`${i + 1}. ${p.nombre}${p.titular ? ' (titular)' : ''} · ${p.documento}`, X, y, { width: 300 });
      y = doc.y + 2;
    });

    // ---- Totales ----
    if (y > 640) { doc.addPage(); y = 48; }
    let yt = Math.max(y + 10, doc.y + 10);
    const filaTotal = (etiqueta, valor, fuerte = false) => {
      doc.font(fuerte ? 'Helvetica-Bold' : 'Helvetica').fontSize(fuerte ? 12 : 9.5).fillColor(fuerte ? BLUE : NAVY);
      doc.text(etiqueta, X + 260, yt, { width: 140, align: 'right' });
      doc.text(valor, X + 405, yt, { width: 94, align: 'right' });
      yt += fuerte ? 20 : 15;
    };
    filaTotal(r.totales.operacion, formatoImporte(r.totales.valor_venta, m));
    filaTotal(`IGV (${Math.round(r.totales.igv_tasa * 100)} %)`, formatoImporte(r.totales.igv, m));
    filaTotal('IMPORTE TOTAL', formatoImporte(r.totales.total, m), true);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text(r.importe_letras, X, yt + 4, { width: ANCHO });
    if (r.tipo_cambio) {
      doc.font('Helvetica').fontSize(8.5).fillColor(GRIS)
        .text(`Equivalente en soles: ${formatoImporte(c.total, 'PEN')} (tipo de cambio S/ ${r.tipo_cambio.toFixed(3)} por US$ 1).`, X, doc.y + 3, { width: ANCHO });
    }

    // ---- Pie ----
    let yp = doc.y + 18;
    if (yp > 760) { doc.addPage(); yp = 48; }
    doc.font('Helvetica').fontSize(8.5).fillColor(GRIS);
    if (r.emitido_por) doc.text(`Emitido por: ${r.emitido_por}`, X, yp, { width: ANCHO });
    doc.fontSize(8).text(r.pie, X, doc.y + 4, { width: ANCHO });
    doc.end();
  });
}
