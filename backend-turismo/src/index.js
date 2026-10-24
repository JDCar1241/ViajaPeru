import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import paquetes from './paquetes.routes.js';
import auth from './auth.routes.js';
import reservas from './reservas.routes.js';
import cobros from './cobros.routes.js';
import consultas from './consultas.routes.js';
import comprobantes from './comprobantes.routes.js';   // junto a los otros imports


const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/salud', (_req, res) => res.json({ ok: true }));
app.use('/api/paquetes', paquetes);
app.use('/api/auth', auth);
app.use('/api/reservas', reservas);
app.use('/api/reservas', cobros);
app.use('/api/consultas', consultas);
app.use('/api', comprobantes);                          // junto a los otros app.use, antes del "Ruta no encontrada"

app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API ViajaPeru en http://localhost:${PORT}`));