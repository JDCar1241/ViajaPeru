// Envía un correo de prueba con Resend.
// Uso (desde backend-turismo):   node scripts/probar-correo.mjs destinatario@correo.com
import 'dotenv/config';
import { enviarCorreo } from '../src/servicios/correo.js';

const destinatario = process.argv[2];
if (!destinatario) {
  console.error('Uso: node scripts/probar-correo.mjs destinatario@correo.com');
  process.exit(1);
}

try {
  const resultado = await enviarCorreo({
    destinatario,
    asunto: 'Prueba de correo - ViajaPerú',
    html: `
      <h2>¡Hola!</h2>
      <p>Este es un correo de prueba del sistema ViajaPerú.</p>
      <p>La configuración de correo está funcionando.</p>
    `,
  });

  console.log('Prueba completada:', resultado);
} catch (error) {
  console.error('Falló la prueba:', error.message);
  process.exitCode = 1;
}
