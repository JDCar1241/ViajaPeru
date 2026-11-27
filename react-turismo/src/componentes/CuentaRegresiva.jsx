import { useEffect, useRef, useState } from 'react';
import '../estilos/reservas.css';

// Tiempo que queda de un apartado de cupos (compra online, supabase/16-apartar-cupos.sql).
// <CuentaRegresiva hasta="2026-11-27T15:30:00Z" texto="Tus cupos están apartados" onVencer={…} />
// onVencer se llama una sola vez, cuando el tiempo llega a cero.
const restante = (hasta) => Math.max(0, new Date(hasta).getTime() - Date.now());

const horaLima = (iso) =>
  new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });

export default function CuentaRegresiva({ hasta, texto, onVencer }) {
  const [ms, setMs] = useState(() => restante(hasta));
  const avisado = useRef(false);
  // El aviso se guarda en una ref: así el intervalo no se reinicia cada vez que el padre se vuelve a dibujar
  const alVencer = useRef(onVencer);
  useEffect(() => { alVencer.current = onVencer; }, [onVencer]);

  useEffect(() => {
    avisado.current = false;
    const tic = () => {
      const r = restante(hasta);
      setMs(r);
      if (r === 0 && !avisado.current) {
        avisado.current = true;
        alVencer.current?.();
      }
    };
    const id = setInterval(tic, 1000);
    return () => clearInterval(id);
  }, [hasta]);

  const min = Math.floor(ms / 60000);
  const seg = Math.floor((ms % 60000) / 1000);
  const poco = ms < 5 * 60000;

  return (
    <p className={'vp-plazo' + (poco ? ' vp-plazo--poco' : '')} role="timer" aria-live={poco ? 'polite' : 'off'}>
      {ms > 0 ? (
        <>
          {texto} hasta las <strong>{horaLima(hasta)}</strong>
          {' · '}quedan <strong>{min}:{String(seg).padStart(2, '0')}</strong> min
        </>
      ) : (
        <>Se acabó el tiempo. Los cupos se liberarán en unos minutos.</>
      )}
    </p>
  );
}
