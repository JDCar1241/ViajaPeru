import { useEffect, useState } from 'react';
import { pedir } from './api.js';

// Datos públicos del vendedor (se configuran en el Backend con las variables EMPRESA_*).
// Se piden una sola vez y se comparten entre el pie de página y las páginas legales.
const BASE = { nombre: 'ViajaPerú', razon_social: 'ViajaPerú', ruc: '', direccion: '', telefono: '', correo: '', horario: '' };

let cache = null;
let enCurso = null;

function cargar() {
  if (!enCurso) {
    enCurso = pedir('/empresa')
      .then((d) => { cache = { ...BASE, ...d }; return cache; })
      .catch(() => { enCurso = null; return BASE; });
  }
  return enCurso;
}

export function useEmpresa() {
  const [empresa, setEmpresa] = useState(cache || BASE);

  useEffect(() => {
    if (cache) return;
    let vivo = true;
    cargar().then((d) => { if (vivo) setEmpresa(d); });
    return () => { vivo = false; };
  }, []);

  return empresa;
}

// "999 888 777" -> enlace tel: sin espacios
export const enlaceTelefono = (t) => 'tel:' + String(t || '').replace(/[^\d+]/g, '');
