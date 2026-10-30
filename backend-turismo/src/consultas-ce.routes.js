import { Router } from 'express';
import { requiereSesion, fallo } from './auth.middleware.js';

const router = Router();
const ROLES = ['Recepcionista', 'Gerente'];
const BASE = 'https://api.factiliza.com/v1';

// Consulta a Factiliza. La llave solo vive en el Backend (.env y variables de Render).
async function consultar(ruta) {
  const token = process.env.FACTILIZA_TOKEN;
  if (!token) throw new Error('Falta FACTILIZA_TOKEN en el .env');
  const res = await fetch(`${BASE}${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
  const cuerpo = await res.json().catch(() => ({}));
  return { ok: res.ok, estado: res.status, cuerpo };
}

const texto = (v) => String(v || '').trim();

// GET /api/consultas/ce/:numero  ->  { encontrado, apellidos, nombres }
// Misma forma de respuesta que la consulta de DNI, así el Front no distingue.
router.get('/ce/:numero', requiereSesion(ROLES), async (req, res, next) => {
  try {
    const numero = texto(req.params.numero).toUpperCase();
    if (!/^[A-Z0-9]{6,12}$/.test(numero)) {
      return fallo(res, 400, 'El carnet de extranjería no es válido.');
    }

    const r = await consultar(`/cee/info/${encodeURIComponent(numero)}`);
    const d = r.cuerpo?.data;

    if (!r.ok || !d) {
      // No existe o la API falló: el Front deja ingresar los datos a mano.
      if (r.estado !== 400 && r.estado !== 404) {
        console.error('Factiliza CE respondió', r.estado, JSON.stringify(r.cuerpo));
      }
      return res.json({ encontrado: false });
    }

    const nombres = texto(d.nombres);
    const apellidos = [d.apellido_paterno, d.apellido_materno].map(texto).filter(Boolean).join(' ');

    if (!nombres && !apellidos) return res.json({ encontrado: false });
    res.json({ encontrado: true, apellidos, nombres });
  } catch (e) { next(e); }
});

// GET /api/consultas/ruc/:numero  ->  { encontrado, razon_social, direccion, activo, estado, condicion }
// "activo" es true solo si el contribuyente está ACTIVO y HABIDO (conviene advertir antes de facturar).
router.get('/ruc/:numero', requiereSesion(ROLES), async (req, res, next) => {
  try {
    const numero = texto(req.params.numero);
    if (!/^(10|15|16|17|20)\d{9}$/.test(numero)) {
      return fallo(res, 400, 'El RUC debe tener 11 dígitos y empezar con 10, 15, 16, 17 o 20.');
    }

    const r = await consultar(`/ruc/info/${numero}`);
    const d = r.cuerpo?.data;

    if (!r.ok || !d) {
      if (r.estado !== 400 && r.estado !== 404) {
        console.error('Factiliza RUC respondió', r.estado, JSON.stringify(r.cuerpo));
      }
      return res.json({ encontrado: false });
    }

    const razon = texto(d.nombre_o_razon_social);
    if (!razon) return res.json({ encontrado: false });

    const estado = texto(d.estado).toUpperCase();
    const condicion = texto(d.condicion).toUpperCase();
    res.json({
      encontrado: true,
      razon_social: razon,
      direccion: texto(d.direccion_completa) || texto(d.direccion),
      estado,
      condicion,
      activo: estado === 'ACTIVO' && condicion === 'HABIDO',
    });
  } catch (e) { next(e); }
});

export default router;