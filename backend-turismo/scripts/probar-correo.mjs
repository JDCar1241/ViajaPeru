
import 'dotenv/config';
import { enviarCorreo } from '../src/servicios/correo.js';

try {
  const resultado = await enviarCorreo({
    destinatario: 'jcardenasv3.a@upao.edu.pe',
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
