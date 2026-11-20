// Abre el formulario de tarjeta de Culqi (Custom Checkout) y devuelve el ID del TOKEN.
// Los datos de la tarjeta van del navegador directo a Culqi: nunca pasan por el Backend.
// Solo usa la llave PÚBLICA (pk_test_... / pk_live_...). La secreta vive solo en el Backend.
//
// Requiere en index.html:  <script src="https://js.culqi.com/checkout-js"></script>
// Requiere en react-turismo/.env:  VITE_CULQI_PUBLIC_KEY=pk_test_xxxxxxxx
//
// "centimos" es un ENTERO en la moneda elegida: S/ 350.50 = 35050; US$ 93.47 = 9347.
// Ojo: si la persona cierra el formulario sin pagar, Culqi no avisa y la promesa queda
// pendiente. La pantalla que lo use debe ofrecer un botón "Cancelar".

export const CULQI_KEY = import.meta.env.VITE_CULQI_PUBLIC_KEY;

export function pedirTokenTarjeta({ centimos, moneda = 'PEN', email, titulo = 'ViajaPeru' }) {
  return new Promise((resolve, reject) => {
    if (!CULQI_KEY) return reject(new Error('Falta VITE_CULQI_PUBLIC_KEY en el .env del Front.'));
    if (typeof window.CulqiCheckout !== 'function') {
      return reject(new Error('No cargó el formulario de Culqi. Revisa tu conexión y recarga la página.'));
    }

    const config = {
      settings: { title: titulo, currency: moneda, amount: centimos },
      options: { lang: 'es', installments: false, paymentMethods: { tarjeta: true, yape: false } },
    };
    if (email) config.client = { email };

    const culqi = new window.CulqiCheckout(CULQI_KEY, config);

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
