
import { useEffect, useState } from 'react';
import Inicio from './Inicio';
import Catalogo from './Catalogo';
import Detalle from './Detalle';
import Login from './Login';
import CambiarClave from './CambiarClave.jsx';
import Reserva from './Reserva.jsx';
import Confirmacion from './Confirmacion.jsx';
import MenuUsuario from './MenuUsuario.jsx';
import Cobros from './Cobros.jsx';
import Cobrar from './Cobrar.jsx';
import Comprobante from './Comprobante.jsx';
import Registro from './Registro.jsx';
import VerificaCorreo from './VerificaCorreo.jsx';
import MiCuenta from './cliente/MiCuenta.jsx';
import MisReservas from './cliente/MisReservas.jsx';
import MiReserva from './cliente/MiReserva.jsx';
import { useSesion } from './auth.js';
import ComprobanteCliente from './cliente/ComprobanteCliente.jsx';

const ANIO = new Date().getFullYear();

export default function App() {
  const [hash, setHash] = useState(window.location.hash);
  const sesion = useSesion();

  useEffect(() => {
    const f = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };

    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  const cmp = hash.match(/^#\/comprobante\/(\w+)/);
  const det = hash.match(/^#\/paquete\/(\w+)/);
  const res = hash.match(/^#\/reservar\/(\w+)\/(\w+)/);
  const cob = hash.match(/^#\/cobrar\/(\w+)/);
  const miReserva = hash.match(/^#\/mi-reserva\/(\d+)/);
  const miComprobante = hash.match(/^#\/mi-comprobante\/(\d+)/);

  const esCliente = sesion?.usuario?.rol === 'Cliente';

    let vista;

  if (miReserva) {
    vista = esCliente
      ? <MiReserva key={hash} />
      : <Inicio />;
  } else if (miComprobante) {
    vista = esCliente
      ? <ComprobanteCliente key={hash} id={miComprobante[1]} />
      : <Inicio />;
  } else if (hash.startsWith('#/mi-cuenta')) {
    vista = esCliente
      ? <MiCuenta />
      : <Inicio />;
  } else if (hash.startsWith('#/mis-reservas')) {
    vista = esCliente
      ? <MisReservas />
      : <Inicio />;
  } else if (det) {
    vista = <main><Detalle id={det[1]} /></main>;
  } else if (res) {
    vista = <Reserva key={hash} paqueteId={res[1]} salidaId={res[2]} />;
  } else if (cob) {
    vista = <Cobrar key={hash} id={cob[1]} />;
  } else if (cmp) {
    vista = <Comprobante key={hash} id={cmp[1]} />;
  } else if (hash.startsWith('#/cobros')) {
    vista = <Cobros />;
  } else if (hash.startsWith('#/reserva-confirmada')) {
    vista = <Confirmacion />;
  } else if (hash.startsWith('#/cambiar-clave')) {
    vista = <CambiarClave />;
  } else if (hash.startsWith('#/paquetes')) {
    vista = <main><Catalogo key={hash} /></main>;
  } else if (hash.startsWith('#/login')) {
    vista = <Login />;
  } else if (hash.startsWith('#/registro')) {
    vista = <Registro />;
  } else if (hash.startsWith('#/verifica-correo')) {
    vista = <VerificaCorreo />;
  } else {
    vista = <Inicio />;
  }

  return (
    <>
      <header>
        <a className="logo" href="#/">Viaja<span>Peru</span></a>
        <nav>
          <a href="#/paquetes">Paquetes</a>
          <MenuUsuario />
        </nav>
      </header>

      {vista}

      <footer>
        © {ANIO} ViajaPeru · Paquetes turísticos
      </footer>
    </>
  );
}
