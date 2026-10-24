import { useEffect, useState } from 'react';
import './cobros.css';
import { pedir } from './api-reservas.js';
import { useSesion } from './auth.js';
import { soles } from './moneda.js';

const ROLES = ['Recepcionista', 'Gerente'];
const fecha = (v) => new Date(v).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });

export default function Cobros() {
  const sesion = useSesion();
  const [q, setQ] = useState('');
  const [filas, setFilas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [vista, setVista] = useState('Pendiente'); // Pendiente | Pagada

  const buscar = (texto = '', v = vista) => {
    setEstado('cargando');
    pedir('/reservas?estado=' + v + '&q=' + encodeURIComponent(texto.trim()))
      .then((d) => { setFilas(d); setEstado(d.length ? 'listo' : 'vacio'); })
      .catch(() => setEstado('error'));
  };
  useEffect(() => { if (!sesion) { window.location.hash = '#/login'; return; } buscar(q, vista); }, [sesion, vista]);

  if (!sesion) return null;
  if (!ROLES.includes(sesion.usuario.rol)) return <main><div className="error"><strong>Tu rol no puede cobrar reservas.</strong></div></main>;

  return (
    <main>
      <h1>Cobrar reservas</h1>
      <p className="muted">{vista === 'Pendiente' ? 'Reservas pendientes de pago.' : 'Reservas pagadas: emite o descarga su comprobante.'} Busca por documento del cliente o por código.</p>
      <div className="cb-tabs" role="tablist">
        {[['Pendiente', 'Pendientes de pago'], ['Pagada', 'Pagadas']].map(([v, t]) => (
          <button key={v} role="tab" aria-selected={vista === v} className={'btn sm' + (vista === v ? '' : ' sec')} onClick={() => setVista(v)}>{t}</button>
        ))}
      </div>
      <form className="filtros" onSubmit={(e) => { e.preventDefault(); buscar(q); }}>
        <label className="fld lg">Documento o código
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej. 71234567 o VP-000012" />
        </label>
        <button className="btn">Buscar</button>
      </form>

      {estado === 'cargando' && <div className="skeleton" />}
      {estado === 'error' && <div className="error"><strong>No pudimos cargar las reservas.</strong><p><button className="btn sec" onClick={() => buscar(q)}>Reintentar</button></p></div>}
      {estado === 'vacio' && <div className="vacio"><strong>{vista === 'Pendiente' ? 'No hay reservas pendientes' : 'No hay reservas pagadas'}</strong><p className="muted">Prueba con otro Documento o código.</p></div>}
      {estado === 'listo' && (
        <div className="scroll">
          <table>
            <thead><tr><th>Código</th><th>Cliente</th><th>Paquete</th><th>Salida</th><th>Personas</th><th>Total</th><th></th></tr></thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td><strong>{f.codigo}</strong></td>
                  <td>{f.cliente.nombres} {f.cliente.apellidos}<br /><span className="muted">{f.cliente.tipo_documento || 'DNI'} {f.cliente.numero_documento || f.cliente.dni}</span></td>
                  <td>{f.paquete.nombre}</td>
                  <td>{fecha(f.fecha_inicio_viaje)}</td>
                  <td>{f.num_personas}</td>
                  <td><strong>{soles(f.total)}</strong></td>
                  <td>{vista === 'Pendiente'
                    ? <a className="btn sm" href={'#/cobrar/' + f.id}>Cobrar</a>
                    : <a className="btn sm" href={'#/comprobante/' + f.id}>Comprobante</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}