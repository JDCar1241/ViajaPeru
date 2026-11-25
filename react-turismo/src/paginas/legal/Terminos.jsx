import './legal.css';
import { useEmpresa } from '../../servicios/empresa.js';

export const ACTUALIZADO = '24 de noviembre de 2026';

// Quién vende: se muestra en Términos, Cancelaciones y Libro de Reclamaciones.
export function DatosVendedor() {
  const e = useEmpresa();
  return (
    <ul>
      <li><strong>Nombre comercial:</strong> {e.nombre}</li>
      <li><strong>Titular (razón social o nombre):</strong> {e.razon_social}</li>
      <li><strong>RUC:</strong> {e.ruc || 'en trámite'}</li>
      {e.direccion && <li><strong>Dirección:</strong> {e.direccion}</li>}
      {e.correo && <li><strong>Correo:</strong> <a href={'mailto:' + e.correo}>{e.correo}</a></li>}
      {e.telefono && <li><strong>Teléfono:</strong> {e.telefono}</li>}
    </ul>
  );
}

const SECCIONES = [
  ['vendedor', 'Quién vende'],
  ['servicio', 'Qué vendemos'],
  ['compra', 'Cómo comprar'],
  ['pago', 'Precios y pagos'],
  ['comprobante', 'Comprobante'],
  ['cancelacion', 'Cancelaciones'],
  ['cliente', 'Responsabilidades del cliente'],
  ['viajaperu', 'Responsabilidades de ViajaPerú'],
  ['datos', 'Datos personales'],
  ['reclamos', 'Reclamos'],
];

export default function Terminos() {
  const e = useEmpresa();

  return (
    <main className="legal">
      <div className="cabecera">
        <div>
          <span className="etiqueta">Información legal</span>
          <h1>Términos y condiciones</h1>
          <p className="legal__actualizado">Última actualización: {ACTUALIZADO}</p>
        </div>
      </div>

      <ul className="legal__indice">
        {SECCIONES.map(([id, t]) => <li key={id}><a href={'#/terminos'} onClick={(ev) => { ev.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }}>{t}</a></li>)}
      </ul>

      <p>
        Estos términos regulan la compra de paquetes turísticos en este sitio web. Al reservar o pagar un paquete
        declaras que los leíste y los aceptas, junto con la{' '}
        <a href="#/cancelaciones">Política de cambios, cancelaciones y devoluciones</a>.
      </p>

      <section id="vendedor" className="tarjeta">
        <h2>1. Quién vende</h2>
        <p>Los paquetes son ofrecidos y vendidos por:</p>
        <DatosVendedor />
      </section>

      <section id="servicio" className="tarjeta">
        <h2>2. Qué vendemos</h2>
        <p>
          Vendemos paquetes y tours turísticos dentro del Perú. La página de cada paquete muestra, antes de comprar:
        </p>
        <ul>
          <li>el destino, la duración y una foto referencial;</li>
          <li>el <strong>itinerario</strong> día por día;</li>
          <li>la <strong>información importante</strong>: qué incluye y qué no incluye el paquete, y lo que debes llevar;</li>
          <li>el <strong>precio por persona en soles</strong>;</li>
          <li>las <strong>salidas programadas</strong> con su fecha, hora y cupos disponibles.</li>
        </ul>
        <p>Lo que no figure como incluido en la página del paquete no forma parte del servicio contratado.</p>
      </section>

      <section id="compra" className="tarjeta">
        <h2>3. Cómo comprar</h2>
        <ol>
          <li>Elige un paquete en <a href="#/paquetes">Paquetes</a> y la salida que prefieras.</li>
          <li>Inicia sesión o crea tu cuenta (necesitamos un correo verificado para enviarte la confirmación).</li>
          <li>Registra al titular y a los acompañantes con su documento de identidad.</li>
          <li>Tu reserva queda registrada como <strong>pendiente de pago</strong> y recibe un código (por ejemplo VP-000123).</li>
          <li>Paga en línea desde la reserva o desde <a href="#/mis-reservas">Mis reservas</a>.</li>
          <li>Cuando el pago es aprobado, la reserva pasa a <strong>pagada</strong> y te enviamos el comprobante por correo.</li>
        </ol>
        <p>Una reserva no está confirmada hasta que su pago es aprobado.</p>
      </section>

      <section id="pago" className="tarjeta">
        <h2>4. Precios y medios de pago</h2>
        <ul>
          <li>Los precios se muestran en soles (S/) por persona. El total de la reserva es el precio por la cantidad de viajeros.</li>
          <li>
            Pagos en línea con <strong>tarjeta de crédito o débito</strong> (Visa, Mastercard, American Express y Diners)
            y con <strong>Yape</strong>, procesados por Culqi. Yape acepta pagos de hasta S/ 2,000 por operación.
          </li>
          <li>
            Con tarjeta también puedes pagar en dólares: antes de confirmar te mostramos el tipo de cambio y el importe
            exacto que se cobrará.
          </li>
          <li>Puedes usar tu <strong>saldo a favor</strong> (generado por cancelaciones) para pagar total o parcialmente.</li>
          <li>
            {e.nombre} no guarda los datos de tu tarjeta: los recibe y protege directamente la pasarela de pagos Culqi.
          </li>
          <li>En nuestra oficina también aceptamos efectivo, tarjeta, Yape y Plin.</li>
        </ul>
      </section>

      <section id="comprobante" className="tarjeta">
        <h2>5. Comprobante</h2>
        <p>
          Al aprobarse el pago emitimos tu boleta a nombre del titular de la reserva y te la enviamos por correo en PDF.
          También puedes verla y descargarla cuando quieras desde <a href="#/mis-reservas">Mis reservas</a>.
          Si necesitas factura, solicítala en nuestra oficina indicando tu RUC antes de pagar.
        </p>
      </section>

      <section id="cancelacion" className="tarjeta">
        <h2>6. Cancelaciones, cambios y devoluciones</h2>
        <p>
          Puedes cancelar una reserva pagada hasta <strong>48 horas antes</strong> de la salida y recibir el 100% como
          saldo a favor. Si {e.nombre} cancela una salida, también recibes el 100% como saldo a favor.{' '}
          {e.nombre} no devuelve dinero: el saldo a favor es un crédito en soles que se usa para pagar reservas en esta web.
          Todos los detalles están en la{' '}
          <a href="#/cancelaciones">Política de cambios, cancelaciones y devoluciones</a>.
        </p>
      </section>

      <section id="cliente" className="tarjeta">
        <h2>7. Responsabilidades del cliente</h2>
        <ul>
          <li>Registrar datos verdaderos y completos del titular y de cada acompañante.</li>
          <li>Llevar al viaje el documento de identidad vigente registrado en la reserva.</li>
          <li>Presentarse en el punto y la hora de salida indicados. Si no te presentas, el servicio se considera prestado.</li>
          <li>Leer el itinerario y la información importante del paquete antes de pagar.</li>
          <li>Seguir las indicaciones del guía y respetar las normas de los lugares visitados.</li>
          <li>Los menores de edad deben viajar acompañados por un adulto responsable.</li>
        </ul>
      </section>

      <section id="viajaperu" className="tarjeta">
        <h2>8. Responsabilidades de {e.nombre}</h2>
        <ul>
          <li>Prestar los servicios tal como se describen en la página del paquete.</li>
          <li>Informar por correo cualquier cambio en la salida con la mayor anticipación posible.</li>
          <li>
            Ante fenómenos naturales, cierre de vías, disposiciones de las autoridades u otros casos de fuerza mayor,
            podemos modificar el orden del itinerario o reprogramar la salida para proteger la seguridad de los viajeros.
            Si la salida se cancela, se aplica lo indicado en la política de cancelaciones.
          </li>
          <li>Atender tus consultas y reclamos dentro de los plazos de ley.</li>
        </ul>
      </section>

      <section id="datos" className="tarjeta">
        <h2>9. Datos personales</h2>
        <p>
          Usamos tus datos y los de tus acompañantes solo para gestionar la reserva, emitir el comprobante, comunicarnos
          contigo y cumplir obligaciones legales, conforme a la Ley N.° 29733, Ley de Protección de Datos Personales.
          No los vendemos ni los compartimos con terceros ajenos al servicio. Puedes pedir el acceso, la rectificación
          o la eliminación de tus datos escribiéndonos{e.correo ? <> a <a href={'mailto:' + e.correo}>{e.correo}</a></> : ''}.
        </p>
      </section>

      <section id="reclamos" className="tarjeta">
        <h2>10. Reclamos y legislación aplicable</h2>
        <p>
          Puedes registrar un reclamo o una queja en nuestro{' '}
          <a href="#/libro-reclamaciones">Libro de Reclamaciones virtual</a>; te responderemos en un plazo máximo de
          15 días hábiles. Estos términos se rigen por las leyes del Perú, incluido el Código de Protección y Defensa del
          Consumidor (Ley N.° 29571).
        </p>
      </section>
    </main>
  );
}
