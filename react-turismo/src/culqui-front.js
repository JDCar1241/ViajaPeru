// src/culqi-front.js
// Abre el formulario de tarjeta de Culqi (Custom Checkout) y devuelve el TOKEN.
// Los datos de la tarjeta van del navegador directo a Culqi: nunca pasan por tu Backend.
// Solo usa la llave PÚBLICA (pk_test_... / pk_live_...). La secreta vive solo en el Backend.
//
// Requiere en index.html:  <script src="https://js.culqi.com/checkout-js"></script>
// Requiere en react-turismo/.env:  VITE_CULQI_PUBLIC_KEY=pk_test_xxxxxxxx

export function pedirTokenTarjeta({ montoSoles, titulo = 'ViajaPeru', email }) {
  return new Promise((resolve, reject) => {
    const llave = import.meta.env.VITE_CULQI_PUBLIC_KEY;
    if (!llave) return reject(new Error('Falta VITE_CULQI_PUBLIC_KEY en el .env del Front.'));
    if (typeof window.CulqiCheckout !== 'function') {
      return reject(new Error('No cargó el formulario de Culqi. Revisa tu conexión y recarga la página.'));
    }

    const config = {
      settings: {
        title: titulo,
        currency: 'PEN',
        amount: Math.round(montoSoles * 100), // Culqi pide céntimos enteros
      },
      options: {
        lang: 'es',
        installments: false,
        paymentMethods: { tarjeta: true, yape: false },
      },
    };
    if (email) config.client = { email };

    const culqi = new window.CulqiCheckout(llave, config);

    // Culqi llama a esta función cuando crea el token o cuando falla.
    culqi.culqi = () => {
      if (culqi.token) {
        culqi.close?.();
        resolve(culqi.token.id); // tkn_test_xxx: esto es lo que se envía al Backend
      } else if (culqi.error) {
        culqi.close?.();
        reject(new Error(culqi.error.user_message || 'No pudimos procesar la tarjeta.'));
      }
    };

    culqi.open();
  });
}