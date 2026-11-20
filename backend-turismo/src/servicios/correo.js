
import { Resend } from 'resend';

// Envío de correos (bienvenida, cancelación de reserva, comprobantes con el PDF adjunto).
// Proveedor según las variables de entorno:
//   BREVO_API_KEY  -> Brevo (gratis, 300 correos/día, envía a CUALQUIER destinatario
//                     con un remitente verificado, sin necesidad de dominio propio)
//   RESEND_API_KEY -> Resend (con el remitente de prueba onboarding@resend.dev
//                     solo llega al correo dueño de la cuenta de Resend)
// Si están las dos, se usa Brevo.
//
// EMAIL_FROM: "Nombre <correo@dominio>". Con Brevo debe ser un remitente verificado
// en Brevo > Senders (por ejemplo tu Gmail).

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const TIMEOUT_MS = 15_000;
const REMITENTE_RESEND_PRUEBA = 'ViajaPerú <onboarding@resend.dev>';

// "ViajaPerú <correo@gmail.com>" -> { name: 'ViajaPerú', email: 'correo@gmail.com' }
function separarRemitente(texto) {
  const t = String(texto || '').trim();
  const m = t.match(/^(.*)<\s*([^>]+)\s*>$/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, '') || 'ViajaPerú', email: m[2].trim() };
  return { name: 'ViajaPerú', email: t };
}

async function enviarConBrevo({ destinatario, asunto, html, adjuntos }) {
  if (!process.env.EMAIL_FROM) {
    throw new Error('Falta EMAIL_FROM (el remitente verificado en Brevo).');
  }

  let res;
  try {
    res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: separarRemitente(process.env.EMAIL_FROM),
        to: [{ email: destinatario }],
        subject: asunto,
        htmlContent: html,
        ...(adjuntos.length
          ? { attachment: adjuntos.map((a) => ({ name: a.nombre, content: a.contenido.toString('base64') })) }
          : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error('Sin conexión con Brevo: ' + (e.name === 'TimeoutError' ? 'tiempo agotado' : e.message));
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Ej.: 401 llave incorrecta | 400 remitente no verificado
    console.error('Error al enviar correo con Brevo:', res.status, JSON.stringify(data));
    throw new Error('No se pudo enviar el correo.');
  }

  console.log('Correo enviado con Brevo:', data?.messageId);
  return { id: data?.messageId };
}

// El cliente se crea recién al enviar el primer correo.
// "new Resend()" lanza un error si no hay llave, y si se creara al importar el archivo
// el servidor completo no arrancaría cuando falta RESEND_API_KEY.
let resend = null;

async function enviarConResend({ destinatario, asunto, html, adjuntos }) {
  resend ??= new Resend(process.env.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || REMITENTE_RESEND_PRUEBA,
    to: [destinatario],
    subject: asunto,
    html,
    ...(adjuntos.length
      ? { attachments: adjuntos.map((a) => ({ filename: a.nombre, content: a.contenido })) }
      : {}),
  });

  if (error) {
    console.error('Error al enviar correo con Resend:', error);
    throw new Error('No se pudo enviar el correo.');
  }

  console.log('Correo enviado con Resend:', data?.id);
  return data;
}

// adjuntos: [{ nombre: 'B001-00000001.pdf', contenido: Buffer }]  (opcional)
export async function enviarCorreo({ destinatario, asunto, html, adjuntos = [] }) {
  if (!destinatario || !asunto || !html) {
    throw new Error('Faltan datos para enviar el correo.');
  }

  const datos = { destinatario, asunto, html, adjuntos };
  if (process.env.BREVO_API_KEY) return enviarConBrevo(datos);
  if (process.env.RESEND_API_KEY) return enviarConResend(datos);

  throw new Error('Falta configurar BREVO_API_KEY o RESEND_API_KEY.');
}
