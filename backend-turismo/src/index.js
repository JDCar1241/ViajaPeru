import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import paquetes from './paquetes.routes.js';
import auth from './auth.routes.js';
import reservas from './reservas.routes.js';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/salud', (_req, res) => res.json({ ok: true }));
app.use('/api/paquetes', paquetes);
app.use('/api/auth', auth);
app.use('/api/reservas', reservas);

app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API ViajaPeru en http://localhost:${PORT}`));