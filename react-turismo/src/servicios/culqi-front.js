// Abre el formulario de Culqi (Custom Checkout) y devuelve el ID del TOKEN.
// Los datos de la tarjeta / del Yape van del navegador directo a Culqi: nunca pasan por el Backend.
// Solo usa la llave PÚBLICA (pk_test_... / pk_live_...). La secreta vive solo en el Backend.
//
// Requiere en index.html:  <script src="https://js.culqi.com/checkout-js"></script>
// Requiere en react-turismo/.env:  VITE_CULQI_PUBLIC_KEY=pk_test_xxxxxxxx
//
// "centimos" es un ENTERO en la moneda elegida: S/ 350.50 = 35050; US$ 93.47 = 9347.
// Ojo: si la persona cierra el formulario sin pagar, Culqi no avisa y la promesa queda
// pendiente. La pantalla que lo use debe ofrecer un botón "Cancelar".
//
// Yape por Culqi: el cliente escribe su celular y el "código de aprobación" de su app Yape
// (dura 2 minutos). Culqi devuelve un token ype_... que el Backend cobra al instante.
// Solo soles y hasta S/ 2,000. En pruebas: celular 900 000 001 y cualquier código de 6 dígitos.

export const CULQI_KEY = import.meta.env.VITE_CULQI_PUBLIC_KEY;

export const YAPE_MAX_CENTIMOS = 200_000; // S/ 2,000 (límite de Culqi)

function pedirToken({ centimos, moneda, email, titulo, metodos, mensajeError }) {
  return new Promise((resolve, reject) => {
    if (!CULQI_KEY) return reject(new Error('Falta VITE_CULQI_PUBLIC_KEY en el .env del Front.'));
    if (typeof window.CulqiCheckout !== 'function') {
      return reject(new Error('No cargó el formulario de Culqi. Revisa tu conexión y recarga la página.'));
    }

    const config = {
      settings: { title: titulo, currency: moneda, amount: centimos },
      options: { lang: 'es', installments: false, paymentMethods: metodos },
    };
    if (email) config.client = { email };

    const culqi = new window.CulqiCheckout(CULQI_KEY, config);

    // Culqi llama a esta función cuando crea el token o cuando falla.
    culqi.culqi = () => {
      if (culqi.token) {
        culqi.close?.();
        resolve(culqi.token.id); // tkn_... o ype_...: esto es lo que se envía al Backend
      } else if (culqi.error) {
        culqi.close?.();
        reject(new Error(culqi.error.user_message || mensajeError));
      }
    };

    culqi.open();
  });
}

export function pedirTokenTarjeta({ centimos, moneda = 'PEN', email, titulo = 'ViajaPeru' }) {
  return pedirToken({
    centimos, moneda, email, titulo,
    metodos: { tarjeta: true, yape: false },
    mensajeError: 'No pudimos procesar la tarjeta.',
  });
}

export function pedirTokenYape({ centimos, email, titulo = 'ViajaPeru' }) {
  return pedirToken({
    centimos, moneda: 'PEN', email, titulo,
    metodos: { tarjeta: false, yape: true },
    mensajeError: 'No pudimos procesar el pago con Yape.',
  });
}
