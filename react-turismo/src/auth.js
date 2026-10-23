import { useEffect, useState } from 'react';
const KEY = 'vp_sesion';
const leer = () => { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; } };
let sesion = leer();

export const getSesion = () => sesion;
export function setSesion(s) {
  sesion = s;
  try { s ? sessionStorage.setItem(KEY, JSON.stringify(s)) : sessionStorage.removeItem(KEY); } catch {}
  window.dispatchEvent(new Event('vp-sesion'));
}
export function cerrarSesion() { setSesion(null); window.location.hash = '#/login'; }
export function useSesion() {
  const [s, setS] = useState(sesion);
  useEffect(() => {
    const f = () => setS(getSesion());
    window.addEventListener('vp-sesion', f);
    return () => window.removeEventListener('vp-sesion', f);
  }, []);
  return s; // { token, usuario: { nombre, rol } } o null
}