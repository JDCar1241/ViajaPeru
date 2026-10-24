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

export default function App() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const f = () => { setHash(window.location.hash); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  const cmp = hash.match(/^#\/comprobante\/(\w+)/);
  const det = hash.match(/^#\/paquete\/(\w+)/);
  const res = hash.match(/^#\/reservar\/(\w+)\/(\w+)/);
  const cob = hash.match(/^#\/cobrar\/(\w+)/);
  let vista;
  if (det) vista = <main><Detalle id={det[1]} /></main>;
  else if (res) vista = <Reserva key={hash} paqueteId={res[1]} salidaId={res[2]} />;
  else if (cob) vista = <Cobrar key={hash} id={cob[1]} />;
  else if (cmp) vista = <Comprobante key={hash} id={cmp[1]} />;
  else if (hash.startsWith('#/cobros')) vista = <Cobros />;
  else if (hash.startsWith('#/reserva-confirmada')) vista = <Confirmacion />;
  else if (hash.startsWith('#/cambiar-clave')) vista = <CambiarClave />;
  else if (hash.startsWith('#/paquetes')) vista = <main><Catalogo key={hash} /></main>;
  else if (hash.startsWith('#/login')) vista = <Login />;
  else vista = <Inicio />;

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
      <footer>© {new Date().getFullYear()} ViajaPeru · Paquetes turísticos</footer>
    </>
  );
}