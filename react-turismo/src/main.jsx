import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './estilos/styles.css';
import { sinCorrectores } from './servicios/sinCorrectores.js';

// Antes de dibujar: que las extensiones de corrección no modifiquen los formularios
sinCorrectores(document.getElementById('root'));

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);