// Íconos de línea, en lugar de emojis: se ven igual en todos los dispositivos y toman el color
// del texto (currentColor). Decorativos por defecto (aria-hidden); pasa "titulo" si deben leerse.
//
// <Icono nombre="calendario" />   <Icono nombre="check" tamano={28} />

const TRAZOS = {
  calendario: <><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></>,
  personas: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M16 4.8a3.3 3.3 0 0 1 0 6.4M18.2 14.8c1.8.7 2.9 2.4 3.3 5.2" /></>,
  recibo: <><path d="M5 2.5h14v19l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  tarjeta: <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19M6.5 15h4" /></>,
  celular: <><rect x="6.5" y="2.5" width="11" height="19" rx="2" /><path d="M10.5 18h3" /></>,
  candado: <><rect x="4.5" y="10.5" width="15" height="11" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></>,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  billetera: <><path d="M3 7.5a2 2 0 0 1 2-2h12.5v4" /><rect x="3" y="7.5" width="18" height="13" rx="2" /><path d="M16 14h2" /></>,
  globo: <><circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5c2.6 2.8 3.8 6 3.8 9.5S14.6 18.7 12 21.5C9.4 18.7 8.2 15.5 8.2 12S9.4 5.3 12 2.5z" /></>,
  maleta: <><rect x="3" y="7" width="18" height="13.5" rx="2" /><path d="M8.5 7V4.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12.5h18" /></>,
  reloj: <><circle cx="12" cy="12" r="9.5" /><path d="M12 6.5V12l3.5 2" /></>,
  libro: <><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15.5H5.5A1.5 1.5 0 0 0 4 20z" /><path d="M4 20a1.5 1.5 0 0 0 1.5 1.5H20M9 7.5h6M9 11h6" /></>,
  telefono: <path d="M5 3.5h3.5l1.8 4.6-2.3 1.4a11 11 0 0 0 6.5 6.5l1.4-2.3 4.6 1.8V19a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3 5.5a2 2 0 0 1 2-2z" />,
  correo: <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M3 6.5l9 6.5 9-6.5" /></>,
  ubicacion: <><path d="M12 21.5s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  documento: <><path d="M6 2.5h8l4.5 4.5v14.5H6z" /><path d="M14 2.5V7h4.5M9 12h6M9 16h6" /></>,
};

export default function Icono({ nombre, tamano = 20, titulo, className = '', ...props }) {
  const trazo = TRAZOS[nombre];
  if (!trazo) return null;
  return (
    <svg
      className={'icono ' + className}
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
      aria-label={titulo}
      {...props}
    >
      {trazo}
    </svg>
  );
}
