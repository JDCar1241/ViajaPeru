export const soles = (n) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);
// Trabajamos en céntimos para evitar errores de decimales
export const cent = (v) => Math.round((parseFloat(v) || 0) * 100);