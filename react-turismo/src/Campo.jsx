import { useId } from 'react';
import './reservas.css';
export default function Campo({ etiqueta, error, ...props }) {
  const id = useId();
  return (
    <div className={'vp-campo' + (error ? ' vp-campo--error' : '')}>
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} aria-invalid={!!error} aria-describedby={error ? id + 'e' : undefined} {...props} />
      {error && <p id={id + 'e'} className="vp-error" role="alert">{error}</p>}
    </div>
  );
}