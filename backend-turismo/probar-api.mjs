// ViajaPeru · TUR-79 Pruebas automáticas del API
// Uso (con el Back encendido, en otra terminal):   node probar-api.mjs
// Otro puerto:                                      API=http://localhost:4000 node probar-api.mjs
// Requiere Node 18+ y los datos de prueba (02_datos_prueba.sql) cargados en Supabase.

const BASE = process.env.API || 'http://localhost:3000';
let ok = 0, fail = 0;

async function get(ruta) {
  const r = await fetch(BASE + ruta);
  let cuerpo = null;
  try { cuerpo = await r.json(); } catch {}
  return { status: r.status, cuerpo, headers: r.headers };
}
async function caso(nombre, fn) {
  try {
    await fn();
    ok++; console.log(`  OK     ${nombre}`);
  } catch (e) {
    fail++; console.log(`  FALLA  ${nombre}\n         -> ${e.message}`);
  }
}
const afirmar = (c, msg) => { if (!c) throw new Error(msg); };
const ordenado = (arr, asc) => arr.every((v, i) => i === 0 || (asc ? arr[i - 1] <= v : arr[i - 1] >= v));
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

console.log(`\nProbando ${BASE}\n`);

console.log('Servidor');
await caso('GET /api/salud responde ok', async () => {
  const r = await get('/api/salud');
  afirmar(r.status === 200 && r.cuerpo.ok === true, `status ${r.status}`);
});

console.log('\nCatálogo');
let lista = [];
await caso('lista base: 200 y tarjetas con los 4 campos', async () => {
  const r = await get('/api/paquetes');
  afirmar(r.status === 200 && Array.isArray(r.cuerpo), `status ${r.status}`);
  afirmar(r.cuerpo.length > 0, 'La lista vino vacía: ¿cargaste los datos de prueba?');
  lista = r.cuerpo;
  for (const p of lista) {
    for (const k of ['id', 'nombre', 'foto_url', 'costo', 'cupos_disponibles'])
      afirmar(k in p, `falta el campo ${k}`);
    afirmar(typeof p.costo === 'number', 'costo debe ser número');
  }
});
await caso('orden por defecto: costo ascendente', async () => {
  afirmar(ordenado(lista.map((p) => p.costo), true), 'no está ascendente');
});
await caso('ordenar_por=costo&orden=desc', async () => {
  const r = await get('/api/paquetes?ordenar_por=costo&orden=desc');
  afirmar(r.status === 200 && ordenado(r.cuerpo.map((p) => p.costo), false), 'no está descendente');
});
await caso('ordenar_por=capacidad&orden=desc', async () => {
  const r = await get('/api/paquetes?ordenar_por=capacidad&orden=desc');
  afirmar(r.status === 200 && ordenado(r.cuerpo.map((p) => p.cupos_disponibles), false), 'cupos no descendentes');
});
await caso('ordenar_por=capacidad&orden=asc', async () => {
  const r = await get('/api/paquetes?ordenar_por=capacidad&orden=asc');
  afirmar(r.status === 200 && ordenado(r.cuerpo.map((p) => p.cupos_disponibles), true), 'cupos no ascendentes');
});
await caso('lugar=Tarapoto devuelve solo coincidencias', async () => {
  const r = await get('/api/paquetes?lugar=Tarapoto');
  afirmar(r.status === 200 && r.cuerpo.length >= 1, 'sin resultados');
  afirmar(r.cuerpo.every((p) => /tarapoto/i.test(p.nombre)), 'hay paquetes que no son de Tarapoto');
});
await caso('lugar en minúsculas (tarapoto) también coincide', async () => {
  const r = await get('/api/paquetes?lugar=tarapoto');
  afirmar(r.cuerpo.length >= 1, 'no distingue mayúsculas');
});
await caso('lugar inexistente (París): [] con 200', async () => {
  const r = await get('/api/paquetes?lugar=' + encodeURIComponent('París'));
  afirmar(r.status === 200 && Array.isArray(r.cuerpo) && r.cuerpo.length === 0, `status ${r.status}`);
});
await caso('rango de fechas muy amplio devuelve resultados', async () => {
  const r = await get('/api/paquetes?fecha_desde=2020-01-01&fecha_hasta=2099-12-31');
  afirmar(r.status === 200 && r.cuerpo.length >= 1, 'sin resultados');
});
await caso('rango de fechas sin salidas (año 2099): []', async () => {
  const r = await get('/api/paquetes?fecha_desde=2099-01-01&fecha_hasta=2099-12-31');
  afirmar(r.status === 200 && r.cuerpo.length === 0, 'debería estar vacío');
});
await caso('no muestra salidas pasadas (hasta 2020): []', async () => {
  const r = await get('/api/paquetes?fecha_desde=2000-01-01&fecha_hasta=2020-12-31');
  afirmar(r.status === 200 && r.cuerpo.length === 0, 'aparecieron salidas pasadas');
});
await caso('paginación: limit=1 devuelve 1 y offset=1 otro distinto', async () => {
  const a = await get('/api/paquetes?limit=1&offset=0');
  const b = await get('/api/paquetes?limit=1&offset=1');
  afirmar(a.cuerpo.length === 1, 'limit=1 no se respetó');
  if (lista.length > 1) afirmar(b.cuerpo[0]?.id !== a.cuerpo[0].id, 'offset no avanza');
});
await caso('limit mayor a 50 se recorta (no falla)', async () => {
  const r = await get('/api/paquetes?limit=500');
  afirmar(r.status === 200 && r.cuerpo.length <= 50, `status ${r.status}`);
});
await caso('respuesta sin caché (Cache-Control: no-store)', async () => {
  const r = await get('/api/paquetes');
  afirmar((r.headers.get('cache-control') || '').includes('no-store'), 'falta no-store');
});

console.log('\nValidaciones (deben dar 400)');
for (const [nombre, ruta] of [
  ['fecha_desde con formato inválido', '/api/paquetes?fecha_desde=20-11-2026'],
  ['fecha_desde inexistente (mes 13)', '/api/paquetes?fecha_desde=2026-13-01'],
  ['fecha_desde mayor que fecha_hasta', '/api/paquetes?fecha_desde=2026-12-01&fecha_hasta=2026-11-01'],
  ['ordenar_por no permitido', '/api/paquetes?ordenar_por=nombre'],
  ['orden no permitido', '/api/paquetes?orden=arriba'],
  ['limit no numérico', '/api/paquetes?limit=abc'],
  ['limit en cero', '/api/paquetes?limit=0'],
  ['offset negativo', '/api/paquetes?offset=-1'],
  ['id de detalle no numérico', '/api/paquetes/abc'],
]) {
  await caso(nombre, async () => {
    const r = await get(ruta);
    afirmar(r.status === 400 && r.cuerpo?.error, `status ${r.status}`);
  });
}

console.log('\nDetalle');
await caso('detalle trae itinerario, aclaraciones y salidas', async () => {
  const r = await get(`/api/paquetes/${lista[0]?.id ?? 1}`);
  afirmar(r.status === 200, `status ${r.status}`);
  const p = r.cuerpo;
  afirmar(Array.isArray(p.itinerario), 'itinerario no es arreglo');
  afirmar('aclaraciones' in p, 'falta aclaraciones');
  afirmar(Array.isArray(p.salidas) && p.salidas.length >= 1, 'faltan salidas');
  afirmar(typeof p.costo === 'number', 'costo debe ser número');
  for (const s of p.salidas) {
    afirmar(ISO.test(s.fecha_inicio_viaje), `fecha no es ISO 8601: ${s.fecha_inicio_viaje}`);
    afirmar(s.estado === 'Activa', 'salida no activa');
    afirmar(new Date(s.fecha_inicio_viaje) > new Date(), 'salida ya pasada');
  }
});
await caso('salidas ordenadas por fecha', async () => {
  const r = await get(`/api/paquetes/${lista[0]?.id ?? 1}`);
  const f = r.cuerpo.salidas.map((s) => s.fecha_inicio_viaje);
  afirmar(ordenado(f, true), 'no están ordenadas');
});
await caso('paquete inexistente: 404', async () => {
  const r = await get('/api/paquetes/999999');
  afirmar(r.status === 404, `status ${r.status}`);
});
await caso('ruta desconocida: 404', async () => {
  const r = await get('/api/no-existe');
  afirmar(r.status === 404, `status ${r.status}`);
});

console.log(`\nResultado: ${ok} correctas, ${fail} con falla\n`);
process.exit(fail ? 1 : 0);
