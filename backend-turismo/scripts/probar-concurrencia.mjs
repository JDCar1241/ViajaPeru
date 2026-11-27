// ViajaPeru · Prueba de concurrencia: varias reservas simultáneas no deben sobrevender una salida.
// Requiere supabase/16-apartar-cupos.sql ejecutado y el archivo .env del Backend.
//
// Uso:   node scripts/probar-concurrencia.mjs [cupos=10] [intentos=40]
//
// Qué hace:
//   1. Crea una salida de prueba con N cupos en el primer paquete (a 2 años, para no cruzarse con ventas reales).
//   2. Lanza M apartados de 1 persona AL MISMO TIEMPO (Promise.all), cada uno con un cliente distinto.
//   3. Comprueba que se apartaron exactamente N, que el resto recibió CUPOS_INSUFICIENTES y que el
//      stock quedó en 0 (nunca negativo).
//   4. Borra todo lo que creó (reservas, clientes y la salida), aunque la prueba falle.
import 'dotenv/config';
import { supabase } from '../src/config/supabase.js';

const CUPOS = Number(process.argv[2] || 10);
const INTENTOS = Number(process.argv[3] || 40);
const PREFIJO = '99'; // DNI de prueba: 99000001, 99000002…

let salidaId = null;
let ok = true;
const afirmar = (condicion, mensaje) => {
  console.log(`  ${condicion ? 'OK   ' : 'FALLA'}  ${mensaje}`);
  if (!condicion) ok = false;
};

try {
  const { data: paquete, error: e1 } = await supabase.from('paquetes').select('id, nombre').order('id').limit(1).maybeSingle();
  if (e1) throw e1;
  if (!paquete) throw new Error('No hay paquetes en la base.');

  const fecha = new Date();
  fecha.setUTCFullYear(fecha.getUTCFullYear() + 2);
  const { data: salida, error: e2 } = await supabase
    .from('salidas')
    .insert({ paquete_id: paquete.id, fecha_inicio_viaje: fecha.toISOString(), cupos_totales: CUPOS, cupos_disponibles: CUPOS })
    .select('id')
    .single();
  if (e2) throw e2;
  salidaId = salida.id;
  console.log(`\nSalida de prueba #${salidaId} (${paquete.nombre}) con ${CUPOS} cupos · ${INTENTOS} apartados simultáneos\n`);

  const intento = (i) =>
    supabase.rpc('apartar_cupos', {
      p_salida_id: salidaId,
      p_personas: 1,
      p_cliente: {
        tipo_documento: 'DNI',
        dni: PREFIJO + String(i).padStart(6, '0'),
        apellidos: 'PRUEBA CONCURRENCIA',
        nombres: `CLIENTE ${i}`,
        correo: `prueba${i}@ejemplo.com`,
        telefono: '+51900000000',
      },
      p_usuario: null,
    });

  const inicio = Date.now();
  const resultados = await Promise.all(Array.from({ length: INTENTOS }, (_, i) => intento(i + 1)));
  const ms = Date.now() - inicio;

  const exitos = resultados.filter((r) => !r.error).length;
  const sinCupos = resultados.filter((r) => r.error?.message?.includes('CUPOS_INSUFICIENTES')).length;
  const otros = resultados.filter((r) => r.error && !r.error.message?.includes('CUPOS_INSUFICIENTES'));

  const { data: final, error: e3 } = await supabase.from('salidas').select('cupos_disponibles').eq('id', salidaId).single();
  if (e3) throw e3;
  const { data: reservas, error: e4 } = await supabase.from('reservas').select('num_personas').eq('salida_id', salidaId);
  if (e4) throw e4;
  const apartadas = reservas.reduce((s, r) => s + r.num_personas, 0);

  console.log(`  (${INTENTOS} peticiones en ${ms} ms)`);
  afirmar(exitos === Math.min(CUPOS, INTENTOS), `apartados exitosos: ${exitos} (esperado ${Math.min(CUPOS, INTENTOS)})`);
  afirmar(sinCupos === Math.max(INTENTOS - CUPOS, 0), `rechazados por falta de cupos: ${sinCupos}`);
  afirmar(otros.length === 0, `otros errores: ${otros.length}${otros[0] ? ' -> ' + otros[0].error.message : ''}`);
  afirmar(final.cupos_disponibles === Math.max(CUPOS - INTENTOS, 0), `cupos disponibles al final: ${final.cupos_disponibles}`);
  afirmar(apartadas + final.cupos_disponibles === CUPOS, `apartados + libres = ${apartadas + final.cupos_disponibles} (= ${CUPOS} totales, sin sobreventa)`);
} catch (e) {
  ok = false;
  console.error('\nError en la prueba:', e.message || e);
} finally {
  // Limpieza: reservas de la salida de prueba, sus clientes y la salida
  if (salidaId) {
    const { data: rs } = await supabase.from('reservas').select('id, cliente_id').eq('salida_id', salidaId);
    const ids = (rs || []).map((r) => r.id);
    const clientes = [...new Set((rs || []).map((r) => r.cliente_id))];
    if (ids.length) {
      await supabase.from('acompanantes').delete().in('reserva_id', ids);
      await supabase.from('reservas').delete().in('id', ids);
    }
    if (clientes.length) await supabase.from('clientes').delete().in('id', clientes).like('dni', PREFIJO + '%');
    const { error } = await supabase.from('salidas').delete().eq('id', salidaId);
    console.log(error ? `\nNo se pudo borrar la salida de prueba #${salidaId}: ${error.message}` : '\nDatos de prueba borrados.');
  }
  console.log(ok ? '\nRESULTADO: sin sobreventa.\n' : '\nRESULTADO: revisar las fallas.\n');
  process.exit(ok ? 0 : 1);
}
