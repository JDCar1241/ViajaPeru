import { useCallback, useEffect, useState } from 'react';
import './cobros.css';
import { pedir } from '../../servicios/api.js';
import { useSesion } from '../../servicios/auth.js';
import { soles } from '../../utils/moneda.js';
import Confirmar from '../../componentes/Confirmar.jsx';

// HU-006 · El personal verifica en su app de Yape los pagos que enviaron los clientes.
// Confirmar: registra el pago, emite la boleta y la envía al correo del cliente.
// Rechazar: la reserva sigue pendiente y se avisa al cliente por correo.
const ROLES = ['Recepcionista', 'Administrador'];
const VISTAS = [['En verificación', 'Por verificar'], ['Confirmado', 'Confirmados'], ['Rechazado', 'Rechazados']];
const MOTIVOS = [
  'No encontramos un Yape con ese número de operación.',
  'El monto yapeado no coincide con el importe de la reserva.',
];

const fechaHora = (v) =>
  v ? new Date(v).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' }) : '';

export default function PagosYape() {
  const sesion = useSesion();
  const permitido = ROLES.includes(sesion?.usuario?.rol);

  const [vista, setVista] = useState('En verificación');
  const [filas, setFilas] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState(null); // { ok, texto }

  const [confirmando, setConfirmando] = useState(null); // solicitud
  const [rechazando, setRechazando] = useState(null);   // solicitud
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async (v) => {
    setEstado('cargando');
    setError('');
    try {
      const d = await pedir('/yape/solicitudes?estado=' + encodeURIComponent(v));
      setFilas(Array.isArray(d) ? d : []);
      setEstado('listo');
    } catch (e) {
      setError(e.message || 'No pudimos cargar los pagos.');
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    if (!sesion) { window.location.hash = '#/login'; return; }
    if (permitido) cargar(vista);
  }, [sesion, permitido, vista, cargar]);

  if (!sesion) return null;
  if (!permitido) return <main><div className="error"><strong>Tu rol no puede verificar pagos.</strong></div></main>;

  const confirmar = async () => {
    setOcupado(true);
    try {
      const r = await pedir(`/yape/solicitudes/${confirmando.id}/confirmar`, { method: 'POST', body: '{}' });
      setAviso({ ok: true, texto: `${confirmando.codigo}: ${r.mensaje}` });
      setConfirmando(null);
      cargar(vista);
    } catch (e) {
      setAviso({ ok: false, texto: `${confirmando.codigo}: ${e.message}` });
      setConfirmando(null);
    } finally {
      setOcupado(false);
    }
  };

  const rechazar = async () => {
    if (motivo.trim().length < 5) {
      setAviso({ ok: false, texto: 'Escribe el motivo del rechazo (mínimo 5 caracteres).' });
      setRechazando(null);
      return;
    }
    setOcupado(true);
    try {
      const r = await pedir(`/yape/solicitudes/${rechazando.id}/rechazar`, {
        method: 'POST',
        body: JSON.stringify({ motivo }),
      });
      setAviso({ ok: true, texto: `${rechazando.codigo}: ${r.mensaje}` });
      setRechazando(null);
      cargar(vista);
    } catch (e) {
      setAviso({ ok: false, texto: `${rechazando.codigo}: ${e.message}` });
      setRechazando(null);
    } finally {
      setOcupado(false);
    }
  };

  const porVerificar = vista === 'En verificación';

  return (
    <main>
      <h1>Pagos con Yape</h1>
      <p className="muted">
        {porVerificar
          ? 'Revisa en tu app de Yape que llegó cada pago (N° de operación y monto) antes de confirmarlo.'
          : 'Historial de pagos con Yape revisados.'}
      </p>

      <div className="cb-tabs" role="tablist">
        {VISTAS.map(([v, t]) => (
          <button key={v} role="tab" aria-selected={vista === v} className={'btn sm' + (vista === v ? '' : ' sec')}
                  onClick={() => { setAviso(null); setVista(v); }}>{t}</button>
        ))}
        <button className="btn sm sec" onClick={() => cargar(vista)}>Actualizar</button>
      </div>

      {aviso && <p className={aviso.ok ? 'vp-ok' : 'cb-error'} role="status" style={{ margin: '16px 0' }}>{aviso.texto}</p>}

      {estado === 'cargando' && <div className="skeleton" />}
      {estado === 'error' && (
        <div className="error"><strong>{error}</strong><p><button className="btn sec" onClick={() => cargar(vista)}>Reintentar</button></p></div>
      )}
      {estado === 'listo' && filas.length === 0 && (
        <div className="vacio"><strong>{porVerificar ? 'No hay pagos por verificar' : 'No hay pagos en esta lista'}</strong></div>
      )}

      {estado === 'listo' && filas.length > 0 && (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Enviado</th><th>Reserva</th><th>Cliente</th><th>N° operación</th><th>Monto Yape</th>
                {porVerificar ? <th></th> : <th>Revisión</th>}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td>{fechaHora(f.creado_en)}</td>
                  <td>
                    <strong>{f.codigo}</strong><br />
                    <span className="muted">{f.paquete} · salida {fechaHora(f.fecha_inicio_viaje)}</span>
                  </td>
                  <td>
                    {f.cliente.nombres} {f.cliente.apellidos}<br />
                    <span className="muted">{f.cliente.tipo_documento} {f.cliente.documento}{f.cliente.telefono ? ` · ${f.cliente.telefono}` : ''}</span>
                  </td>
                  <td><strong style={{ fontVariantNumeric: 'tabular-nums' }}>{f.numero_operacion}</strong></td>
                  <td>
                    <strong>{soles(f.monto)}</strong>
                    {f.saldo_a_usar > 0 && <><br /><span className="muted">+ {soles(f.saldo_a_usar)} de saldo a favor</span></>}
                  </td>
                  {porVerificar ? (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm" onClick={() => { setAviso(null); setConfirmando(f); }}>Confirmar</button>{' '}
                      <button className="btn sm sec" onClick={() => { setAviso(null); setMotivo(MOTIVOS[0]); setRechazando(f); }}>Rechazar</button>
                    </td>
                  ) : (
                    <td>
                      {fechaHora(f.revisado_en)}{f.revisado_por ? ` · ${f.revisado_por}` : ''}
                      {f.motivo_rechazo && <><br /><span className="muted">{f.motivo_rechazo}</span></>}
                      {f.estado === 'Confirmado' && <><br /><a href={'#/comprobante/' + f.reserva_id}>Ver comprobante</a></>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Confirmar
        abierto={!!confirmando}
        titulo="¿Confirmar este pago?"
        confirmar="Sí, el pago llegó"
        volver="No, volver"
        ocupado={ocupado}
        onConfirmar={confirmar}
        onCerrar={() => setConfirmando(null)}
      >
        {confirmando && (
          <>
            <p>
              Confirma solo si en tu app de Yape ves el pago de <strong>{soles(confirmando.monto)}</strong> con
              el N° de operación <strong>{confirmando.numero_operacion}</strong>.
            </p>
            <p>La reserva {confirmando.codigo} quedará pagada y se enviará la boleta al correo del cliente.</p>
          </>
        )}
      </Confirmar>

      <Confirmar
        abierto={!!rechazando}
        titulo="¿Rechazar este pago?"
        confirmar="Sí, rechazar"
        volver="No, volver"
        peligro
        ocupado={ocupado}
        onConfirmar={rechazar}
        onCerrar={() => setRechazando(null)}
      >
        {rechazando && (
          <>
            <p>La reserva {rechazando.codigo} seguirá pendiente y le avisaremos al cliente por correo con este motivo:</p>
            <select value={MOTIVOS.includes(motivo) ? motivo : ''} onChange={(e) => setMotivo(e.target.value)}
                    style={{ padding: 8, borderRadius: 8, font: 'inherit' }}>
              {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
              <option value="">Otro motivo…</option>
            </select>
            {!MOTIVOS.includes(motivo) && (
              <textarea rows={3} maxLength={300} value={motivo} placeholder="Escribe el motivo"
                        onChange={(e) => setMotivo(e.target.value)}
                        style={{ padding: 8, borderRadius: 8, font: 'inherit', width: '100%', boxSizing: 'border-box' }} />
            )}
          </>
        )}
      </Confirmar>
    </main>
  );
}
