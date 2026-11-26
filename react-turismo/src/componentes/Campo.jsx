import { useId, useState } from 'react';
import '../estilos/reservas.css';
import './documentos.css';
import Icono from './Icono.jsx';

// Si recibe "opciones" [{valor, texto}] se dibuja como lista desplegable; si no, como input.
// Con type="password" agrega un botón de ojo para mostrar u ocultar la contraseña
// (se oculta el ojo propio de algunos navegadores para que no aparezcan dos).
export default function Campo({ etiqueta, error, opciones, ...props }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const comunes = { id, 'aria-invalid': !!error, 'aria-describedby': error ? id + 'e' : undefined };
  const esClave = props.type === 'password';

  return (
    <div className={'vp-campo' + (error ? ' vp-campo--error' : '')}>
      <label htmlFor={id}>{etiqueta}</label>
      {opciones ? (
        <select {...comunes} {...props}>
          {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
        </select>
      ) : esClave ? (
        <div className="vp-clave">
          <input {...comunes} {...props} type={visible ? 'text' : 'password'} />
          <button
            type="button"
            className="vp-clave__ojo"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={visible}
            aria-controls={id}
            disabled={props.disabled}
          >
            <Icono nombre={visible ? 'ojoTachado' : 'ojo'} tamano={20} />
          </button>
        </div>
      ) : (
        <input {...comunes} {...props} />
      )}
      {error && <p id={id + 'e'} className="vp-error" role="alert">{error}</p>}
    </div>
  );
}
