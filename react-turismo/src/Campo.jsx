import { useId } from 'react';
import './reservas.css';
import './documentos.css';

// Si recibe "opciones" [{valor, texto}] se dibuja como lista desplegable; si no, como input.
export default function Campo({ etiqueta, error, opciones, ...props }) {
  const id = useId();
  const comunes = { id, 'aria-invalid': !!error, 'aria-describedby': error ? id + 'e' : undefined };
  return (
    <div className={'vp-campo' + (error ? ' vp-campo--error' : '')}>
      <label htmlFor={id}>{etiqueta}</label>
      {opciones ? (
        <select {...comunes} {...props}>
          {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
        </select>
      ) : (
        <input {...comunes} {...props} />
      )}
      {error && <p id={id + 'e'} className="vp-error" role="alert">{error}</p>}
    </div>
  );
}