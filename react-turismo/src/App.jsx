
import { useEffect, useState } from 'react';
import Inicio from './paginas/publico/Inicio';
import Catalogo from './paginas/publico/Catalogo';
import Detalle from './paginas/publico/Detalle';
import Login from './paginas/publico/Login';
import CambiarClave from './paginas/publico/CambiarClave.jsx';
import Reserva from './paginas/reservas/Reserva.jsx';
import Confirmacion from './paginas/reservas/Confirmacion.jsx';
import MenuUsuario from './componentes/MenuUsuario.jsx';
import Cobros from './paginas/personal/Cobros.jsx';
import PagosYape from './paginas/personal/PagosYape.jsx';
import Cobrar from './paginas/personal/Cobrar.jsx';
import Comprobante from './paginas/personal/Comprobante.jsx';
import Registro from './paginas/publico/Registro.jsx';
import VerificaCorreo from './paginas/publico/VerificaCorreo.jsx';
import MiCuenta from './paginas/cliente/MiCuenta.jsx';
import MisReservas from './paginas/cliente/MisReservas.jsx';
import MiReserva from './paginas/cliente/MiReserva.jsx';
import { useSesion } from './servicios/auth.js';
import ComprobanteCliente from './paginas/cliente/ComprobanteCliente.jsx';
import CuentaConfirmada from './paginas/publico/CuentaConfirmada.jsx';
import MisSalidas from './paginas/guia/MisSalidas.jsx';
import Asistencia from './paginas/guia/Asistencia.jsx';
import AdminPaquetes from './paginas/admin/AdminPaquetes.jsx';
import AdminPaquete from './paginas/admin/AdminPaquete.jsx';

// Vuelta desde el enlace de confirmación del correo (Supabase pone el token o el error en el hash)
const esRetornoDeConfirmacion = (hash) =>
  /(^#|&)access_token=/.test(hash) || /(^#|&)error_code=/.test(hash);

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
  const guiaSalida = hash.match(/^#\/guia\/salida\/(\d+)/);
  const adminPaquete = hash.match(/^#\/admin\/paquete\/(nuevo|\d+)/);

  const esCliente = sesion?.usuario?.rol === 'Cliente';

    let vista;

  if (esRetornoDeConfirmacion(hash)) {
    // Vuelta desde el enlace de confirmación del correo (Supabase)
    vista = <CuentaConfirmada />;
  } else if (adminPaquete) {
    vista = <AdminPaquete key={hash} id={adminPaquete[1]} />;
  } else if (hash.startsWith('#/admin/paquetes')) {
    vista = <AdminPaquetes />;
  } else if (guiaSalida) {
    vista = <Asistencia key={hash} id={guiaSalida[1]} />;
  } else if (hash.startsWith('#/guia')) {
    vista = <MisSalidas />;
  } else if (miReserva) {
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
  } else if (hash.startsWith('#/pagos-yape')) {
    vista = <PagosYape />;
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
