
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import paquetes from './rutas/paquetes.routes.js';
import auth from './rutas/auth.routes.js';
import reservas from './rutas/reservas.routes.js';
import cobros from './rutas/cobros.routes.js';
import consultas from './rutas/consultas.routes.js';
import comprobantes from './rutas/comprobantes.routes.js';
import registro from './rutas/registro.routes.js';
import portalCliente from './rutas/portal-cliente.routes.js';
import guia from './rutas/guia.routes.js';
import adminCatalogo from './rutas/admin-catalogo.routes.js';
import reclamos from './rutas/reclamos.routes.js';
import { EMPRESA } from './config/empresa.js';

import { fallo } from './middlewares/auth.middleware.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  })
);

app.use(express.json({ limit: '100kb' }));

// Comprobar disponibilidad de la API.
app.get('/api/salud', (_req, res) => {
  res.json({ ok: true });
});

// Datos públicos del vendedor (pie de página, Contacto, Términos, Libro de Reclamaciones).
app.get('/api/empresa', (_req, res) => {
  res.json(EMPRESA);
});

// Rutas públicas.
app.use('/api/paquetes', paquetes);

// Autenticación.
app.use('/api/auth', auth);

// Reservas y operaciones del personal.
app.use('/api/reservas', reservas);
app.use('/api/reservas', cobros);

// Consultas de documentos para el personal.
app.use('/api/consultas', consultas);

// Comprobantes y emisión para el personal.
app.use('/api', comprobantes);

// Registro de clientes.
app.use('/api/clientes', registro);

// Portal exclusivo para usuarios con rol Cliente.
// Sus rutas verifican la propiedad de las reservas y comprobantes.
app.use('/api/portal-cliente', portalCliente);

// Guías turísticos: salidas asignadas y control de asistencia (HU-011).
app.use('/api/guia', guia);

// Administrador: paquetes, salidas y guía de cada salida (HU-009).
app.use('/api/admin', adminCatalogo);

// Libro de Reclamaciones: registro público y respuestas del Administrador.
app.use('/api/reclamos', reclamos);

// Ruta no encontrada.
app.use((_req, res) => {
  fallo(res, 404, 'Ruta no encontrada');
});

// Manejo centralizado de errores.
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return fallo(
      res,
      400,
      'El cuerpo de la petición no es un JSON válido.'
    );
  }

  if (err.type === 'entity.too.large') {
    return fallo(
      res,
      413,
      'La petición es demasiado grande.'
    );
  }

  console.error(err);

  fallo(res, 500, 'Error interno del servidor');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API ViajaPeru en http://localhost:${PORT}`);
});
