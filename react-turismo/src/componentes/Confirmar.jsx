import { useEffect, useId, useRef } from 'react';
import './confirmar.css';

// Ventana de confirmación propia (reemplaza a window.confirm, cuyos botones "Aceptar/Cancelar" confunden).
// Usa <dialog>: el navegador bloquea el resto de la página, mantiene el foco dentro y cierra con Esc.
//
// <Confirmar abierto={x} titulo="…" confirmar="Sí, cancelar reserva" volver="No, volver"
//            peligro onConfirmar={…} onCerrar={…}>contenido</Confirmar>
export default function Confirmar({
  abierto,
  titulo,
  children,
  confirmar = 'Confirmar',
  volver = 'Volver',
  peligro = false,
  ocupado = false,
  onConfirmar,
  onCerrar,
}) {
  const ref = useRef(null);
  const idTitulo = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  // Esc o clic fuera de la ventana = volver (salvo mientras se procesa)
  const cancelar = (e) => {
    e.preventDefault();
    if (!ocupado) onCerrar();
  };

  return (
    <dialog
      ref={ref}
      className="vp-dialogo"
      aria-labelledby={idTitulo}
      onCancel={cancelar}
      onClick={(e) => { if (e.target === ref.current) cancelar(e); }}
    >
      <div className="vp-dialogo__caja">
        <h2 id={idTitulo}>{titulo}</h2>
        <div className="vp-dialogo__cuerpo">{children}</div>
        <div className="vp-dialogo__botones">
          <button type="button" className="vp-dialogo__volver" onClick={onCerrar} disabled={ocupado} autoFocus>
            {volver}
          </button>
          <button
            type="button"
            className={'vp-dialogo__si' + (peligro ? ' vp-dialogo__si--peligro' : '')}
            onClick={onConfirmar}
            disabled={ocupado}
          >
            {ocupado ? 'Procesando…' : confirmar}
          </button>
        </div>
      </div>
    </dialog>
  );
}
