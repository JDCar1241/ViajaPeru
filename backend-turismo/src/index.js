import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import paquetes from './paquetes.routes.js';
import auth from './auth.routes.js';
import reservas from './reservas.routes.js';
import cobros from './cobros.routes.js';
import consultas from './consultas.routes.js';
import comprobantes from './comprobantes.routes.js';
import registro from './registro.routes.js';
import { fallo } from './auth.middleware.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/salud', (_req, res) => res.json({ ok: true }));
app.use('/api/paquetes', paquetes);
app.use('/api/auth', auth);
app.use('/api/reservas', reservas);
app.use('/api/reservas', cobros);
app.use('/api/consultas', consultas);   // DNI, CE y RUC en un solo router
app.use('/api', comprobantes);
app.use('/api/clientes', registro);

app.use((_req, res) => fallo(res, 404, 'Ruta no encontrada'));

// Errores del cliente (JSON roto, cuerpo enorme) responden 4xx; solo lo inesperado es 500.
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return fallo(res, 400, 'El cuerpo de la petición no es un JSON válido.');
  if (err.type === 'entity.too.large') return fallo(res, 413, 'La petición es demasiado grande.');
  console.error(err);
  fallo(res, 500, 'Error interno del servidor');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API ViajaPeru en http://localhost:${PORT}`));