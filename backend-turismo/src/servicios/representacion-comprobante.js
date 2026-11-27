import { EMPRESA } from '../config/empresa.js';

// Representación de la boleta o factura: UN solo lugar que arma todos los datos que se imprimen
// (PDF, correo, pantalla del personal y del cliente).
//
// Campos según el Reglamento de Comprobantes de Pago (R. de Superintendencia N.° 007-99/SUNAT, art. 8)
// y las reglas de la representación impresa:
//   Emisor:      apellidos y nombres o razón social, nombre comercial, RUC y domicilio fiscal
//   Documento:   denominación (BOLETA DE VENTA / FACTURA), serie y número correlativo, fecha de emisión
//   Adquirente:  boleta -> nombre y documento (obligatorio si el total pasa de S/ 700);
//                factura -> razón social, RUC y dirección
//   Detalle:     cantidad, unidad de medida, descripción del servicio, valor y precio unitario
//   Totales:     valor de venta (operación gravada), IGV con su tasa (en la factura, siempre
//                discriminado), importe total, importe en letras y moneda
//   Factura:     forma de pago (Contado)
//
// IGV: por defecto 18 % incluido en el precio. Se puede cambiar con variables de entorno
// (consúltalo con tu contador; p. ej. la venta de paquetes a no domiciliados puede ser exportación):
//   IGV_TASA        0.18
//   IGV_AFECTACION  gravado | exonerado | inafecto | exportacion
//
// Importante: mientras no se envíe a SUNAT por un OSE/PSE, esto NO es un comprobante electrónico
// válido; por eso el pie lo indica (PDF_PIE).

const TASA = (() => {
  const t = Number(process.env.IGV_TASA ?? 0.18);
  return Number.isFinite(t) && t >= 0 && t < 1 ? t : 0.18;
})();
const AFECTACION = ['gravado', 'exonerado', 'inafecto', 'exportacion'].includes(process.env.IGV_AFECTACION)
  ? process.env.IGV_AFECTACION
  : 'gravado';
const TEXTO_OPERACION = {
  gravado: 'Op. gravada',
  exonerado: 'Op. exonerada',
  inafecto: 'Op. inafecta',
  exportacion: 'Exportación de servicios',
};

export const PIE =
  process.env.PDF_PIE ||
  'Constancia de compra emitida por ViajaPeru. No constituye comprobante de pago electrónico de SUNAT.';

const MONEDAS = {
  PEN: { codigo: 'PEN', nombre: 'SOLES', simbolo: 'S/' },
  USD: { codigo: 'USD', nombre: 'DÓLARES AMERICANOS', simbolo: 'US$' },
};

const redondear = (n) => Math.round(Number(n) * 100) / 100;
export const numeroCompleto = (c) => `${c.serie}-${String(c.numero).padStart(8, '0')}`;

// ---- Importe en letras: "SON: MIL QUINIENTOS CON 00/100 SOLES" ----
const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ',
  'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE',
  'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE',
  'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS',
  'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

// 0..999. "apocopar": 1 -> "UN" y 21 -> "VEINTIÚN" (delante de MIL o MILLONES)
function hasta999(n, apocopar = false) {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const r = n % 100;
  let resto = '';
  if (r < 30) resto = UNIDADES[r];
  else resto = DECENAS[Math.floor(r / 10)] + (r % 10 ? ' Y ' + UNIDADES[r % 10] : '');
  if (apocopar) resto = resto.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN');
  return [CENTENAS[c], resto].filter(Boolean).join(' ');
}

export function enLetras(entero) {
  const n = Math.floor(Math.abs(entero));
  if (n === 0) return 'CERO';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes = [];
  if (millones) partes.push(millones === 1 ? 'UN MILLÓN' : `${hasta999(millones, true)} MILLONES`);
  if (miles) partes.push(miles === 1 ? 'MIL' : `${hasta999(miles, true)} MIL`);
  if (resto) partes.push(hasta999(resto));
  return partes.join(' ');
}

export function importeEnLetras(monto, moneda = 'PEN') {
  const centimos = Math.round(Number(monto) * 100);
  const entero = Math.floor(centimos / 100);
  const dec = String(centimos % 100).padStart(2, '0');
  return `SON: ${enLetras(entero)} CON ${dec}/100 ${(MONEDAS[moneda] || MONEDAS.PEN).nombre}`;
}

export const formatoImporte = (n, moneda = 'PEN') =>
  `${(MONEDAS[moneda] || MONEDAS.PEN).simbolo} ${Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fechaLima = (v) =>
  v ? new Date(v).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' }) : '';

// Recibe lo que devuelve obtener_comprobante (17-moneda.sql) y arma la representación.
export function representacion(c) {
  const d = c.detalle || {};
  const moneda = c.moneda || d.moneda || 'PEN';
  const total = redondear(c.total_moneda ?? d.total_moneda ?? c.total);
  const cantidad = Math.max(Number(d.num_personas) || 1, 1);

  const gravado = AFECTACION === 'gravado';
  const valorVenta = gravado ? redondear(total / (1 + TASA)) : total;
  const igv = redondear(total - valorVenta);

  const pasajeros = [{ ...(d.titular || {}), titular: true }, ...(d.acompanantes || [])].map((p) => ({
    documento: `${p.tipo_documento || 'DNI'} ${p.numero_documento || ''}`.trim(),
    nombre: `${p.apellidos || ''} ${p.nombres || ''}`.trim(),
    titular: !!p.titular,
  }));

  const salida = fechaLima(d.fecha_inicio_viaje);
  const descripcion =
    `Paquete turístico "${d.paquete || ''}"` +
    (salida ? ` - salida del ${salida}` : '') +
    (d.codigo ? ` - reserva ${d.codigo}` : '');

  const k = c.comprador;
  const esFactura = c.tipo === 'Factura';

  // Datos del emisor que faltan configurar (variables EMPRESA_* en el Backend)
  const faltan = [];
  if (!EMPRESA.ruc) faltan.push('RUC (EMPRESA_RUC)');
  if (!EMPRESA.direccion) faltan.push('domicilio fiscal (EMPRESA_DIRECCION)');
  if (!EMPRESA.razon_social || EMPRESA.razon_social === EMPRESA.nombre) {
    faltan.push('apellidos y nombres o razón social (EMPRESA_RAZON_SOCIAL)');
  }

  return {
    titulo: esFactura ? 'FACTURA' : 'BOLETA DE VENTA',
    tipo: c.tipo,
    serie: c.serie,
    numero: numeroCompleto(c),
    fecha_emision: c.emitido_en,
    emisor: {
      razon_social: EMPRESA.razon_social,
      nombre_comercial: EMPRESA.nombre,
      ruc: EMPRESA.ruc || null,
      domicilio_fiscal: EMPRESA.direccion || null,
    },
    faltan_datos_emisor: faltan,
    adquirente: k
      ? {
          tipo_documento: k.tipo_documento,
          numero_documento: k.numero_documento,
          nombre: k.nombre,
          direccion: k.direccion || null,
        }
      : null, // boleta sin datos del comprador (hasta S/ 700): "Cliente varios"
    moneda: MONEDAS[moneda] || MONEDAS.PEN,
    tipo_cambio: moneda === 'USD' && c.tipo_cambio ? Number(c.tipo_cambio) : null,
    forma_pago: esFactura ? 'Contado' : null,
    items: [
      {
        cantidad,
        unidad: 'ZZ',
        unidad_texto: 'Servicio',
        descripcion,
        valor_unitario: redondear(valorVenta / cantidad),
        precio_unitario: redondear(total / cantidad),
        importe: total,
      },
    ],
    pasajeros,
    totales: {
      operacion: TEXTO_OPERACION[AFECTACION],
      valor_venta: valorVenta,
      igv_tasa: gravado ? TASA : 0,
      igv,
      total,
    },
    importe_letras: importeEnLetras(total, moneda),
    codigo_reserva: d.codigo || null,
    emitido_por: c.emitido_por_nombre || null,
    pie: PIE,
  };
}
