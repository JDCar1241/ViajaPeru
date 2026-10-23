import { Router } from 'express';
import { requiereSesion, fallo } from './auth.middleware.js';

const router = Router();
const URL_API = 'https://apiperu.dev/api/dni';
const MAX_POR_MINUTO = 20; // por usuario, para no gastar la cuota del token

// Límite simple en memoria (suficiente para el proyecto)
const ventanas = new Map();
function limitar(req, res, next) {
  const id = req.usuario?.id ?? req.ip;
  const ahora = Date.now();
  const v = ventanas.get(id);
  if (!v || ahora - v.desde > 60_000) {
    ventanas.set(id, { n: 1, desde: ahora });
    return next();
  }
  if (++v.n > MAX_POR_MINUTO) return fallo(res, 429, 'Demasiadas consultas. Espera un momento.');
  next();
}

// GET /api/consultas/dni/:dni  ->  { encontrado: true, nombres, apellidos } | { encontrado: false }
// El token vive solo aquí (.env del Backend). Nunca se envía al navegador.
router.get('/dni/:dni', requiereSesion(['Recepcionista', 'Gerente']), limitar, async (req, res, next) => {
  try {
    const dni = req.params.dni;
    if (!/^\d{8}$/.test(dni)) return fallo(res, 400, 'El DNI debe tener 8 dígitos.');
    if (!process.env.APIPERU_TOKEN) return fallo(res, 503, 'La consulta de DNI no está configurada.');

    const ctrl = new AbortController();
    const corte = setTimeout(() => ctrl.abort(), 8000);
    let r;
    try {
      r = await fetch(URL_API, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.APIPERU_TOKEN}`,
        },
        body: JSON.stringify({ dni }),
        signal: ctrl.signal,
      });
    } catch (e) {
      console.error('apiperu.dev no respondió:', e.name);
      return fallo(res, 502, 'No pudimos consultar el DNI. Ingresa los datos a mano.');
    } finally {
      clearTimeout(corte);
    }

    if (r.status === 401 || r.status === 403 || r.status === 429) {
      console.error('apiperu.dev rechazó la consulta (revisa token o cuota):', r.status);
      return fallo(res, 502, 'No pudimos consultar el DNI. Ingresa los datos a mano.');
    }

    const j = await r.json().catch(() => null);
    // Sin resultado NO es un error: pasa con menores de edad y con DNI que la fuente no tiene
    if (!r.ok || !j?.success || !j.data) return res.json({ encontrado: false });

    const d = j.data;
    res.json({
      encontrado: true,
      nombres: d.nombres || '',
      apellidos: [d.apellido_paterno, d.apellido_materno].filter(Boolean).join(' '),
    });
  } catch (e) { next(e); }
});

export default router;