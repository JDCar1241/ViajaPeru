import PDFDocument from 'pdfkit';

const NAVY = '#0A2540', BLUE = '#1456D6', GRIS = '#55657A', LINEA = '#DCE4EF', SKY = '#EAF2FF';
const EMPRESA = {
  nombre: process.env.EMPRESA_NOMBRE || 'ViajaPeru',
  ruc: process.env.EMPRESA_RUC || '',
  direccion: process.env.EMPRESA_DIRECCION || '',
};
const PIE = process.env.PDF_PIE ||
  'Constancia de compra emitida por ViajaPeru. No constituye comprobante de pago electrónico de SUNAT.';

const LIMA = { timeZone: 'America/Lima' };
const soles = (n) => 'S/ ' + Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fFecha = (v) => new Date(v).toLocaleDateString('es-PE', { ...LIMA, day: 'numeric', month: 'long', year: 'numeric' });
const fFechaHora = (v) => new Date(v).toLocaleString('es-PE', { ...LIMA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const numeroCompleto = (c) => `${c.serie}-${String(c.numero).padStart(8, '0')}`;
const nombreDe = (p) => `${p.apellidos} ${p.nombres}`.trim();

// Recibe lo que devuelve la función obtener_comprobante y entrega el PDF en un Buffer.
export function generarPdf(c) {
  return new Promise((resolve, reject) => {
    const d = c.detalle;
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `${c.tipo} ${numeroCompleto(c)}`, Author: EMPRESA.nombre } });
    const partes = [];
    doc.on('data', (p) => partes.push(p));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const X = 48, ANCHO = 499;
    const dato = (etiqueta, valor, x, y, w) => {
      doc.font('Helvetica').fontSize(8).fillColor(GRIS).text(etiqueta.toUpperCase(), x, y, { width: w });
      doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(valor || '—', x, y + 12, { width: w });
    };

    // Cabecera: marca y datos de la empresa
    doc.font('Helvetica-Bold').fontSize(26).fillColor(NAVY).text('Viaja', X, 48, { continued: true }).fillColor(BLUE).text('Peru');
    doc.font('Helvetica').fontSize(9).fillColor(GRIS);
    let yEmp = 82;
    for (const linea of [EMPRESA.nombre !== 'ViajaPeru' ? EMPRESA.nombre : '', EMPRESA.direccion]) {
      if (linea) { doc.text(linea, X, yEmp, { width: 300 }); yEmp += 12; }
    }

    // Recuadro con tipo, serie y número
    doc.roundedRect(372, 44, 175, 70, 8).lineWidth(1.5).strokeColor(BLUE).stroke();
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY)
      .text(c.tipo === 'Factura' ? 'FACTURA' : 'BOLETA DE VENTA', 372, 54, { width: 175, align: 'center' });
    if (EMPRESA.ruc) doc.font('Helvetica').fontSize(9).fillColor(GRIS).text(`RUC ${EMPRESA.ruc}`, 372, 70, { width: 175, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(15).fillColor(BLUE).text(numeroCompleto(c), 372, 88, { width: 175, align: 'center' });

    doc.moveTo(X, 128).lineTo(X + ANCHO, 128).lineWidth(1).strokeColor(LINEA).stroke();

    // Datos de la compra
    dato('Código de reserva', d.codigo, X, 142, 230);
    dato('Fecha de emisión', fFechaHora(c.emitido_en), X + 250, 142, 249);
    dato('Paquete turístico', d.paquete, X, 176, 230);
    dato('Inicio del viaje', fFecha(d.fecha_inicio_viaje), X + 250, 176, 249);

    // Comprador
    const k = c.comprador;
    let y = 214;
    doc.font('Helvetica').fontSize(8).fillColor(GRIS).text('COMPRADOR', X, y);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY);
    if (!k) doc.text('Cliente varios (boleta simple)', X, y + 12);
    else {
      doc.text(`${k.tipo_documento} ${k.numero_documento} · ${k.nombre}`, X, y + 12, { width: ANCHO });
      if (k.direccion) doc.font('Helvetica').fontSize(10).fillColor(GRIS).text(k.direccion, X, doc.y + 2, { width: ANCHO });
    }
    y = Math.max(doc.y, y + 28) + 22;

    // Tabla de pasajeros
    const COL = { n: X + 8, doc: X + 36, nom: X + 172, costo: X + 380 };
    const cabeceraTabla = () => {
      doc.rect(X, y, ANCHO, 22).fill(SKY);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY);
      doc.text('N°', COL.n, y + 7).text('DOCUMENTO', COL.doc, y + 7).text('PASAJERO', COL.nom, y + 7)
        .text('COSTO', COL.costo, y + 7, { width: 111, align: 'right' });
      y += 22;
    };
    cabeceraTabla();

    const pasajeros = [{ ...d.titular, titular: true }, ...(d.acompanantes || [])];
    pasajeros.forEach((p, i) => {
      if (y > 730) { doc.addPage(); y = 48; cabeceraTabla(); }
      doc.font('Helvetica').fontSize(10).fillColor(NAVY);
      doc.text(String(i + 1), COL.n, y + 8)
        .text(`${p.tipo_documento} ${p.numero_documento}`, COL.doc, y + 8, { width: 130 })
        .text(nombreDe(p) + (p.titular ? ' (titular)' : ''), COL.nom, y + 8, { width: 200 });
      doc.text(soles(d.costo_individual), COL.costo, y + 8, { width: 111, align: 'right' });
      y += 28;
      doc.moveTo(X, y).lineTo(X + ANCHO, y).lineWidth(0.5).strokeColor(LINEA).stroke();
    });

    // Totales
    if (y > 700) { doc.addPage(); y = 48; }
    y += 14;
    doc.font('Helvetica').fontSize(10).fillColor(GRIS)
      .text(`Costo individual ${soles(d.costo_individual)} × ${d.num_personas} ${d.num_personas === 1 ? 'persona' : 'personas'}`, X, y, { width: 300 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GRIS).text('TOTAL', X + 300, y + 2, { width: 80, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(16).fillColor(BLUE).text(soles(c.total), X + 380, y - 2, { width: 111, align: 'right' });
    y += 44;

    // Pie
    if (y > 760) { doc.addPage(); y = 48; }
    doc.font('Helvetica').fontSize(9).fillColor(GRIS);
    if (c.emitido_por_nombre) doc.text(`Emitido por: ${c.emitido_por_nombre}`, X, y, { width: ANCHO });
    doc.fontSize(8).text(PIE, X, doc.y + 6, { width: ANCHO });
    doc.end();
  });
}