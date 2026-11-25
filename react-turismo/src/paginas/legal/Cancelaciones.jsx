import './legal.css';
import { useEmpresa } from '../../servicios/empresa.js';
import { ACTUALIZADO, DatosVendedor } from './Terminos.jsx';

// Debe coincidir con lo que hace el sistema (portal-cliente.routes.js · cancelar):
// solo reservas pagadas, hasta 48 h antes, 100% como saldo a favor. Nunca se devuelve dinero.
export default function Cancelaciones() {
  const e = useEmpresa();

  return (
    <main className="legal">
      <div className="cabecera">
        <div>
          <span className="etiqueta">Información legal</span>
          <h1>Cambios, cancelaciones y devoluciones</h1>
          <p className="legal__actualizado">Última actualización: {ACTUALIZADO}</p>
        </div>
      </div>

      <div className="legal__resumen">
        <div>
          <strong>Hasta 48 horas antes</strong>
          <span>Cancelas desde Mis reservas y recibes el 100% como saldo a favor, sin penalidad.</span>
        </div>
        <div>
          <strong>Menos de 48 horas</strong>
          <span>Ya no se puede cancelar ni se devuelve el importe.</span>
        </div>
        <div>
          <strong>Si {e.nombre} cancela</strong>
          <span>Recibes el 100% como saldo a favor para reservar otra salida.</span>
        </div>
      </div>

      <p>
        En {e.nombre} <strong>no se devuelve dinero</strong>: lo que corresponda devolver se acredita como{' '}
        <strong>saldo a favor</strong>, un crédito en soles que queda en tu cuenta y se usa para pagar reservas dentro de
        esta web.
      </p>

      <section className="tarjeta">
        <h2>1. Si cancelas tu reserva</h2>
        <ul>
          <li>
            Puedes cancelar una reserva <strong>pagada</strong> hasta <strong>48 horas antes</strong> de la fecha y hora de
            salida, desde <a href="#/mis-reservas">Mis reservas</a> con el botón "Cancelar reserva".
          </li>
          <li>
            Se te acredita el <strong>100% del importe pagado como saldo a favor</strong>, sin penalidades. Te enviamos la
            confirmación por correo.
          </li>
          <li>
            El saldo a favor no vence y puedes usarlo, total o parcialmente, para pagar cualquier otra reserva en{' '}
            {e.nombre}. No es canjeable por dinero en efectivo ni transferible a otra persona.
          </li>
          <li>
            Dentro de las 48 horas previas a la salida, o si no te presentas el día del viaje, la reserva ya no puede
            cancelarse y no se devuelve el importe, porque los servicios (transporte, hospedaje, entradas) ya están
            contratados para ti.
          </li>
          <li>
            Si la reserva se pagó con saldo a favor, o está a nombre de otro titular, la cancelación se atiende
            comunicándote con nosotros por los canales de <a href="#/contacto">Contacto</a>.
          </li>
          <li>
            Una reserva <strong>pendiente de pago</strong> no genera ningún cobro: si no la pagas, no queda confirmada.
          </li>
        </ul>
      </section>

      <section className="tarjeta">
        <h2>2. Cambios de fecha (reprogramación)</h2>
        <p>
          Para viajar en otra fecha, cancela tu reserva con al menos 48 horas de anticipación y usa el saldo a favor para
          reservar la nueva salida que elijas, sujeta a los cupos disponibles. Si el nuevo paquete cuesta más, pagas solo la
          diferencia; si cuesta menos, el resto queda como saldo a favor.
        </p>
      </section>

      <section className="tarjeta">
        <h2>3. Si {e.nombre} cancela o cambia la salida</h2>
        <p>
          Si cancelamos una salida (por ejemplo, por fenómenos naturales, cierre de vías, disposiciones de las autoridades
          o porque no se alcanzó el mínimo de viajeros), te avisamos por correo y te acreditamos el{' '}
          <strong>100% de lo pagado como saldo a favor</strong>, sin importar cuánto falte para la salida.
        </p>
        <p>
          Lo mismo aplica si cambiamos la fecha de salida y la nueva fecha no te conviene.
        </p>
      </section>

      <section className="tarjeta">
        <h2>4. Cómo funciona el saldo a favor</h2>
        <ul>
          <li>Se acredita al instante y lo ves en tu cuenta, en <a href="#/mis-reservas">Mis reservas</a>.</li>
          <li>Al pagar una reserva eliges usarlo: cubre todo el importe o una parte, y el resto lo pagas con tarjeta o Yape.</li>
          <li>No vence, no es canjeable por dinero en efectivo y no es transferible a otra persona.</li>
          <li>
            Si por un error de la pasarela se te cobró dos veces o un importe distinto al de tu reserva, ese cobro indebido
            sí se anula y se devuelve a tu tarjeta o Yape.
          </li>
        </ul>
      </section>

      <section className="tarjeta">
        <h2>5. ¿Dudas o desacuerdos?</h2>
        <p>
          Escríbenos por los canales de <a href="#/contacto">Contacto</a> o registra un reclamo en el{' '}
          <a href="#/libro-reclamaciones">Libro de Reclamaciones</a>. Esta política forma parte de los{' '}
          <a href="#/terminos">Términos y condiciones</a> del vendedor:
        </p>
        <DatosVendedor />
      </section>
    </main>
  );
}
