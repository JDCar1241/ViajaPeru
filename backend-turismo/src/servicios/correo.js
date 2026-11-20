
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const REMITENTE =
  process.env.EMAIL_FROM || 'ViajaPerú <onboarding@resend.dev>';

export async function enviarCorreo({ destinatario, asunto, html }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Falta configurar RESEND_API_KEY.');
  }

  if (!destinatario || !asunto || !html) {
    throw new Error('Faltan datos para enviar el correo.');
  }

  const { data, error } = await resend.emails.send({
    from: REMITENTE,
    to: [destinatario],
    subject: asunto,
    html,
  });

  if (error) {
    console.error('Error al enviar correo con Resend:', error);
    throw new Error('No se pudo enviar el correo.');
  }

  console.log('Correo enviado correctamente:', data?.id);

  return data;
}
