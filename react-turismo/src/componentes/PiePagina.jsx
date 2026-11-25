import './pie-pagina.css';
import Icono from './Icono.jsx';
import { useEmpresa, enlaceTelefono } from '../servicios/empresa.js';

const ANIO = new Date().getFullYear();

// Pie de página común: qué vende ViajaPerú, contacto, información legal y Libro de Reclamaciones.
export default function PiePagina() {
  const e = useEmpresa();

  return (
    <footer className="vp-pie">
      <div className="vp-pie__columnas">
        <section className="vp-pie__marca">
          <a className="logo" href="#/">Viaja<span>Peru</span></a>
          <p>Paquetes y tours de viaje por el Perú: reserva en línea y paga con tarjeta o Yape.</p>
          <a className="vp-pie__libro" href="#/libro-reclamaciones">
            <Icono nombre="libro" tamano={26} />
            <span>Libro de<br />Reclamaciones</span>
          </a>
        </section>

        <nav aria-label="Información">
          <h2>Información</h2>
          <a href="#/paquetes">Paquetes turísticos</a>
          <a href="#/terminos">Términos y condiciones</a>
          <a href="#/cancelaciones">Cambios, cancelaciones y devoluciones</a>
          <a href="#/libro-reclamaciones">Libro de Reclamaciones</a>
          <a href="#/contacto">Contacto</a>
        </nav>

        <section aria-label="Contacto">
          <h2>Contacto</h2>
          <ul className="vp-pie__contacto">
            {e.telefono && (
              <li><Icono nombre="telefono" tamano={16} /><a href={enlaceTelefono(e.telefono)}>{e.telefono}</a></li>
            )}
            {e.correo && (
              <li><Icono nombre="correo" tamano={16} /><a href={'mailto:' + e.correo}>{e.correo}</a></li>
            )}
            {e.direccion && <li><Icono nombre="ubicacion" tamano={16} /><span>{e.direccion}</span></li>}
            {e.horario && <li><Icono nombre="reloj" tamano={16} /><span>{e.horario}</span></li>}
            <li><Icono nombre="documento" tamano={16} /><a href="#/contacto">Ver todos los canales</a></li>
          </ul>
        </section>
      </div>

      <p className="vp-pie__legal">
        © {ANIO} {e.razon_social}
        {e.ruc ? ` · RUC ${e.ruc}` : ''}
        {' · '}Pagos procesados de forma segura por Culqi.
      </p>
    </footer>
  );
}
