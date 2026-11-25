import './legal.css';
import Icono from '../../componentes/Icono.jsx';
import { useEmpresa, enlaceTelefono } from '../../servicios/empresa.js';

export default function Contacto() {
  const e = useEmpresa();

  const canales = [
    e.telefono && { icono: 'telefono', titulo: 'Teléfono / WhatsApp', valor: e.telefono, href: enlaceTelefono(e.telefono) },
    e.correo && { icono: 'correo', titulo: 'Correo', valor: e.correo, href: 'mailto:' + e.correo },
    e.direccion && { icono: 'ubicacion', titulo: 'Dirección', valor: e.direccion },
    e.horario && { icono: 'reloj', titulo: 'Horario de atención', valor: e.horario },
  ].filter(Boolean);

  return (
    <main className="legal">
      <div className="cabecera">
        <div>
          <span className="etiqueta">Atención al cliente</span>
          <h1>Contacto</h1>
          <p>Escríbenos o llámanos para consultas sobre paquetes, reservas, pagos o cancelaciones.</p>
        </div>
      </div>

      <section className="tarjeta">
        <h2>{e.nombre}</h2>
        {canales.length > 0 ? (
          <div className="contacto__lista">
            {canales.map((c) => (
              <div key={c.icono} className="contacto__item">
                <span className="contacto__icono"><Icono nombre={c.icono} tamano={22} /></span>
                <div>
                  <small>{c.titulo}</small>
                  {c.href ? <a href={c.href}>{c.valor}</a> : <strong>{c.valor}</strong>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Pronto publicaremos nuestros canales de atención.</p>
        )}
        <p className="muted">
          {e.razon_social}{e.ruc ? ` · RUC ${e.ruc}` : ''}
        </p>
      </section>

      <div className="acciones">
        <a className="btn" href="#/libro-reclamaciones">
          <Icono nombre="libro" tamano={18} style={{ marginRight: 8 }} />
          Libro de Reclamaciones
        </a>
        <a className="btn sec" href="#/cancelaciones">Política de cancelaciones</a>
        <a className="btn sec" href="#/terminos">Términos y condiciones</a>
      </div>
    </main>
  );
}
