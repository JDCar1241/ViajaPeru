// Datos del vendedor: UN solo lugar para la web (pie de página, Contacto, Términos,
// Libro de Reclamaciones) y para el PDF del comprobante.
// Se completan con variables de entorno (en Render: Environment). Las vacías no se muestran.
//
//   EMPRESA_NOMBRE        Nombre comercial (ViajaPerú)
//   EMPRESA_RAZON_SOCIAL  Razón social o, con RUC 10, tu nombre completo
//   EMPRESA_RUC           11 dígitos (10... persona natural, 20... empresa)
//   EMPRESA_DIRECCION     Dirección fiscal o del local
//   EMPRESA_TELEFONO      Teléfono o WhatsApp de atención
//   EMPRESA_CORREO        Correo público de atención (también recibe los reclamos)
//   EMPRESA_HORARIO       Ej.: Lunes a viernes de 9:00 a 18:00

const v = (nombre) => (process.env[nombre] || '').trim();

export const EMPRESA = {
  nombre: v('EMPRESA_NOMBRE') || 'ViajaPerú',
  razon_social: v('EMPRESA_RAZON_SOCIAL') || v('EMPRESA_NOMBRE') || 'ViajaPerú',
  ruc: v('EMPRESA_RUC'),
  direccion: v('EMPRESA_DIRECCION'),
  telefono: v('EMPRESA_TELEFONO'),
  correo: v('EMPRESA_CORREO'),
  horario: v('EMPRESA_HORARIO'),
};

// Correo donde llegan los avisos internos (reclamos). Si no hay correo público,
// se usa el remitente de EMAIL_FROM (no se muestra en la web).
export function correoInterno() {
  if (EMPRESA.correo) return EMPRESA.correo;
  const m = v('EMAIL_FROM').match(/<\s*([^>]+)\s*>/);
  return m ? m[1].trim() : v('EMAIL_FROM') || null;
}
