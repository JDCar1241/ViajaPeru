import { useId, useState } from 'react';
import '../estilos/reservas.css';
import './documentos.css';
import { PAISES, paisPorIso, separarTelefono, textoLargo } from '../utils/paises.js';

// Teléfono con código de país: selector de país + número nacional.
// value / onChange trabajan con el teléfono completo: "+51987654321" ('' si está vacío).
// Acepta también el formato antiguo de 9 dígitos sin código (se toma como Perú).
export default function Telefono({ etiqueta = 'Teléfono', value, onChange, error, disabled }) {
  const id = useId();
  const valor = String(value || '');

  // País elegido en el selector. Si el valor llega desde fuera con otro código
  // (por ejemplo al cargar el perfil), manda el código del valor.
  const [isoElegido, setIsoElegido] = useState(() => separarTelefono(valor)?.pais.iso || 'PE');
  const elegido = paisPorIso(isoElegido);
  const detectado = separarTelefono(valor);
  const pais = valor && detectado && !valor.startsWith(elegido.cod) ? detectado.pais : elegido;

  const numero = valor.startsWith(pais.cod)
    ? valor.slice(pais.cod.length)
    : /^\d+$/.test(valor) ? valor : '';

  const cambiarPais = (e) => {
    const nuevo = paisPorIso(e.target.value);
    setIsoElegido(nuevo.iso);
    const n = numero.slice(0, nuevo.max);
    onChange(n ? nuevo.cod + n : '');
  };

  const cambiarNumero = (e) => {
    const n = e.target.value.replace(/\D/g, '').slice(0, pais.max);
    onChange(n ? pais.cod + n : '');
  };

  return (
    <div className={'vp-campo' + (error ? ' vp-campo--error' : '')}>
      <label htmlFor={id}>{etiqueta}</label>
      <div className="vp-telefono">
        <select
          aria-label={`País de ${etiqueta.toLowerCase()}`}
          value={pais.iso}
          onChange={cambiarPais}
          disabled={disabled}
        >
          {PAISES.map((p) => (
            <option key={p.iso} value={p.iso}>{p.nombre} ({p.cod})</option>
          ))}
        </select>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder={`${textoLargo(pais)}`}
          maxLength={pais.max}
          value={numero}
          onChange={cambiarNumero}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? id + 'e' : undefined}
        />
      </div>
      {error && <p id={id + 'e'} className="vp-error" role="alert">{error}</p>}
    </div>
  );
}
