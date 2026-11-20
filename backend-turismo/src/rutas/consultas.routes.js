import { Router } from 'express';
import { requiereSesion, fallo } from '../middlewares/auth.middleware.js';
import { crearLimitador } from '../middlewares/limitar.js';
import { ROLES_CAJA, txt, DOCUMENTOS } from '../utils/comunes.js';
import { consultarFactiliza, consultarPersona, ErrorServicio } from '../servicios/factiliza.js';

// Reemplaza a consultas.routes.js (DNI con apiperu.dev) y consultas-ce.routes.js (CE y RUC).
// Ahora todo sale por Factiliza: una sola llave (FACTILIZA_TOKEN), una sola caché y timeout en todas.
// El token vive solo en el Backend. Nunca se envía al navegador.
const router = Router();

router.use(requiereSesion(ROLES_CAJA));
const limitar = crearLimitador({
  ventanaMs: 60_000,
  maximo: 20, // por usuario, para no gastar la cuota
  clave: (req) => req.usuario?.id ?? req.ip,
  mensaje: 'Demasiadas consultas. Espera un momento.',
});

const MSG_SERVICIO = 'No pudimos consultar el documento. Ingresa los datos a mano.';

// GET /api/consultas/dni/:numero  y  /api/consultas/ce/:numero
//   ->  { encontrado: true, nombres, apellidos } | { encontrado: false }
// Sin resultado NO es un error: pasa con menores de edad y con documentos que la fuente no tiene.
const buscarPersona = (tipo) => async (req, res, next) => {
  try {
    const regla = DOCUMENTOS[tipo];
    const numero = txt(req.params.numero).toUpperCase();
    if (!regla.re.test(numero)) return fallo(res, 400, `El ${regla.nombre} ${regla.msg}.`);

    const p = await consultarPersona(tipo, numero);
    if (!p) return res.json({ encontrado: false });
    res.json({ encontrado: true, nombres: p.nombres, apellidos: p.apellidos });
  } catch (e) {
    if (e instanceof ErrorServicio) {
      console.error(`Consulta de ${tipo} falló:`, e.message);
      return fallo(res, 502, MSG_SERVICIO);
    }
    next(e);
  }
};
router.get('/dni/:numero', limitar, buscarPersona('DNI'));
router.get('/ce/:numero', limitar, buscarPersona('CE'));

// GET /api/consultas/ruc/:numero  ->  { encontrado, razon_social, direccion, activo, estado, condicion }
// "activo" es true solo si el contribuyente está ACTIVO y HABIDO (conviene advertir antes de facturar).
router.get('/ruc/:numero', limitar, async (req, res, next) => {
  try {
    const numero = txt(req.params.numero);
    if (!/^(10|15|16|17|20)\d{9}$/.test(numero)) {
      return fallo(res, 400, 'El RUC debe tener 11 dígitos y empezar con 10, 15, 16, 17 o 20.');
    }

    const r = await consultarFactiliza(`/ruc/info/${numero}`);
    const d = r.cuerpo?.data;

    if (!r.ok || !d) {
      if (r.estado !== 400 && r.estado !== 404) {
        console.error('Factiliza RUC respondió', r.estado, JSON.stringify(r.cuerpo));
      }
      return res.json({ encontrado: false });
    }

    const razon = txt(d.nombre_o_razon_social);
    if (!razon) return res.json({ encontrado: false });

    const estado = txt(d.estado).toUpperCase();
    const condicion = txt(d.condicion).toUpperCase();
    res.json({
      encontrado: true,
      razon_social: razon,
      direccion: txt(d.direccion_completa) || txt(d.direccion),
      estado,
      condicion,
      activo: estado === 'ACTIVO' && condicion === 'HABIDO',
    });
  } catch (e) {
    if (e instanceof ErrorServicio) {
      console.error('Consulta de RUC falló:', e.message);
      return fallo(res, 502, 'No pudimos consultar el RUC. Ingresa los datos a mano.');
    }
    next(e);
  }
});

export default router;