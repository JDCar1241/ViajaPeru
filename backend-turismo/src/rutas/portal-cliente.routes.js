
import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { requiereSesion, fallo } from '../middlewares/auth.middleware.js';
import { validarReserva, paraRpc } from '../validaciones/reservas.validacion.js';
import { verificarDocumento, ErrorServicio } from '../servicios/verificacion-documentos.js';
import { crearLimitador } from '../middlewares/limitar.js';
import { enviarCorreo } from '../servicios/correo.js';
import {
  txt,
  telefonoInternacionalValido,
  esTelefonoPeru,
  idValido,
} from '../utils/comunes.js';
import { generarPdf } from '../servicios/comprobante.pdf.js';
import { emitirYEnviarComprobante } from '../servicios/comprobante-digital.js';
import {
  crearCargo,
  reembolsar,
  ErrorPasarela,
} from '../config/culqi.js';

const router = Router();

router.use(requiereSesion(['Cliente']));

const telefonoValido = (telefono) =>
  esTelefonoPeru(telefono) || telefonoInternacionalValido(telefono);

const MONEDAS = ['PEN', 'USD'];

// Cada intento de pago llega a Culqi: se limita por cuenta para frenar pruebas masivas de tarjetas.
const limitarPago = crearLimitador({
  ventanaMs: 15 * 60 * 1000,
  maximo: 8,
  clave: (req) => req.usuario.id,
  mensaje: 'Demasiados intentos de pago. Espera unos minutos antes de volver a intentarlo.',
});

const dosDecimales = (n) =>
  typeof n === 'number' &&
  Number.isFinite(n) &&
  Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

function escaparHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (caracter) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[caracter]);
}

// Tipo de cambio: soles por cada dólar.
async function tipoCambioUsd() {
  const { data, error } = await supabase
    .from('configuracion')
    .select('valor')
    .eq('clave', 'tipo_cambio_usd')
    .maybeSingle();

  if (error) throw error;

  const tc = Number(data?.valor);

  return Number.isFinite(tc) && tc >= 1 && tc <= 20
    ? tc
    : null;
}

// Obtiene el perfil autenticado y busca su registro en clientes.
async function obtenerClienteUsuario(req) {
  const { data: perfil, error } = await supabase
    .from('perfiles')
    .select(`
      id, nombre, rol, correo, tipo_documento, numero_documento,
      nombres, apellido_paterno, apellido_materno, telefono, fecha_nacimiento
    `)
    .eq('id', req.usuario.id)
    .eq('rol', 'Cliente')
    .maybeSingle();

  if (error) throw error;
  if (!perfil) return null;

  const tipo = txt(perfil.tipo_documento).toUpperCase();
  const documento = txt(perfil.numero_documento).toUpperCase();

  const cliente = {
    tipo_documento: tipo,
    dni: documento,
    apellidos: [perfil.apellido_paterno, perfil.apellido_materno]
      .map(txt)
      .filter(Boolean)
      .join(' '),
    nombres: txt(perfil.nombres),
    fecha_nacimiento: perfil.fecha_nacimiento,
    correo: txt(perfil.correo) || txt(req.usuario.correo),
    telefono: txt(perfil.telefono),
  };

  let clienteId = null;

  if (tipo && documento) {
    const { data: registro, error: errCliente } = await supabase
      .from('clientes')
      .select('id')
      .eq('tipo_documento', tipo)
      .eq('dni', documento)
      .maybeSingle();

    if (errCliente) throw errCliente;

    clienteId = registro?.id ?? null;
  }

  return { perfil, cliente, clienteId };
}

// Una reserva pertenece a la cuenta si:
// 1. El titular coincide con el cliente del perfil.
// 2. La cuenta autenticada fue quien creó la reserva.
function aplicarFiltroPropiedad(query, usuario, usuarioId) {
  if (usuario.clienteId) {
    return query.or(
      `cliente_id.eq.${usuario.clienteId},creado_por.eq.${usuarioId}`
    );
  }

  return query.eq('creado_por', usuarioId);
}

async function comprobarPropiedad(req, reservaId) {
  const usuario = await obtenerClienteUsuario(req);

  if (!usuario) {
    return { error: 'No se encontraron los datos de tu cuenta.' };
  }

  let consulta = supabase
    .from('reservas')
    .select('id, cliente_id, creado_por, estado')
    .eq('id', reservaId);

  consulta = aplicarFiltroPropiedad(
    consulta,
    usuario,
    req.usuario.id
  );

  const { data: reserva, error } = await consulta.maybeSingle();

  if (error) throw error;

  if (!reserva) {
    return { error: 'La reserva no existe o no te pertenece.' };
  }

  return { usuario, reserva };
}

// Verifica identidad del titular o acompañante.
// Devuelve { ok } | { error, estado } (estado = código HTTP a responder).
async function verificarIdentidad(persona, quien) {
  const tipo = txt(persona.tipo_documento).toUpperCase();

  // El pasaporte solo se puede validar con su MRZ, que las reservas en línea no piden.
  if (tipo === 'PASAPORTE') {
    return {
      estado: 400,
      error: `El pasaporte ${quien} no se puede verificar en línea. Usa DNI o carné de extranjería, o reserva en nuestras oficinas.`,
    };
  }

  const apellidos = txt(persona.apellidos)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const apellidoPaterno = apellidos.shift() || '';
  const apellidoMaterno = apellidos.join(' ');

  let resultado;

  try {
    resultado = await verificarDocumento({
      tipo_documento: tipo,
      numero_documento: txt(
        persona.nro_documento ??
        persona.numero_documento ??
        persona.dni
      ).toUpperCase(),
      nombres: txt(persona.nombres),
      apellido_paterno: apellidoPaterno,
      apellido_materno: apellidoMaterno,
    });
  } catch (e) {
    // Factiliza caído o sin llave: no es culpa del usuario.
    if (e instanceof ErrorServicio) {
      console.error(`Verificación de identidad ${quien} falló:`, e.message);
      return {
        estado: 503,
        error: 'No pudimos verificar los documentos en este momento. Inténtalo de nuevo en unos minutos.',
      };
    }
    throw e;
  }

  if (resultado.ok) return { ok: true };

  // Muchos menores de edad no figuran en la fuente: sin resultado no es motivo para rechazarlos.
  // Si SÍ figuran y los nombres no coinciden, se rechaza igual que a un adulto.
  if (resultado.noEncontrado && persona.es_menor) return { ok: true };

  return {
    estado: 400,
    error: `No se pudo verificar la identidad ${quien}: ${resultado.motivo}`,
  };
}

// GET /api/portal-cliente/saldo
router.get('/saldo', async (req, res, next) => {
  try {
    const usuario = await obtenerClienteUsuario(req);

    if (!usuario) {
      return fallo(res, 404, 'No se encontraron los datos de tu perfil.');
    }

    if (!usuario.clienteId) {
      return res.json({
        saldo_disponible: 0,
      });
    }

    const { data, error } = await supabase
      .from('saldos_cliente')
      .select('saldo_disponible')
      .eq('cliente_id', usuario.clienteId)
      .maybeSingle();

    if (error) throw error;

    res.json({
      saldo_disponible: Number(data?.saldo_disponible || 0),
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/portal-cliente/perfil
router.get('/perfil', async (req, res, next) => {
  try {
    const usuario = await obtenerClienteUsuario(req);

    if (!usuario) {
      return fallo(res, 404, 'No se encontraron los datos de tu perfil.');
    }

    const { perfil } = usuario;

    res.json({
      nombre: perfil.nombre,
      nombres: perfil.nombres,
      apellido_paterno: perfil.apellido_paterno,
      apellido_materno: perfil.apellido_materno,
      correo: perfil.correo || req.usuario.correo,
      tipo_documento: perfil.tipo_documento,
      numero_documento: perfil.numero_documento,
      telefono: perfil.telefono,
      fecha_nacimiento: perfil.fecha_nacimiento,
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/portal-cliente/reservas
router.get('/reservas', async (req, res, next) => {
  try {
    const usuario = await obtenerClienteUsuario(req);

    if (!usuario) {
      return fallo(res, 404, 'No se encontraron los datos de tu perfil.');
    }

    let consulta = supabase
      .from('reservas')
      .select('id, estado, total, num_personas, creado_en, pagada_en')
      .order('creado_en', { ascending: false });

    consulta = aplicarFiltroPropiedad(
      consulta,
      usuario,
      req.usuario.id
    );

    const { data: reservas, error } = await consulta;

    if (error) throw error;

    const detalle = await Promise.all(
      (reservas || []).map(async (r) => {
        const { data, error: err } = await supabase.rpc('obtener_reserva', {
          p_id: r.id,
        });

        if (err) throw err;

        return {
          ...data,
          id: r.id,
          estado: r.estado,
          total: r.total,
          personas: r.num_personas,
          creado_en: r.creado_en,
          pagada_en: r.pagada_en,
        };
      })
    );

    res.json(detalle);
  } catch (e) {
    next(e);
  }
});

// GET /api/portal-cliente/reservas/:id/tipo-cambio
router.get('/reservas/:id/tipo-cambio', async (req, res, next) => {
  try {
    const id = idValido(req.params.id);

    if (!id) {
      return fallo(res, 400, 'El número de reserva no es válido.');
    }

    const propiedad = await comprobarPropiedad(req, id);

    if (propiedad.error) {
      return fallo(res, 404, propiedad.error);
    }

    const { data: reserva, error } = await supabase.rpc('obtener_reserva', {
      p_id: id,
    });

    if (error) throw error;

    if (!reserva) {
      return fallo(res, 404, 'No se encontró la reserva.');
    }

    if (reserva.estado !== 'Pendiente') {
      return fallo(res, 409, 'Esta reserva ya no está pendiente de pago.');
    }

    const tc = await tipoCambioUsd();

    if (!tc) {
      return fallo(res, 503, 'El tipo de cambio no está configurado.');
    }

    const total = Number(reserva.total);

    if (!Number.isFinite(total) || total <= 0) {
      return fallo(res, 400, 'El importe de la reserva no es válido.');
    }

    const centimosUsd = Math.round(Math.round(total * 100) / tc);

    res.json({
      moneda_base: 'PEN',
      total_soles: total,
      tipo_cambio: tc,
      total_dolares: centimosUsd / 100,
    });
  } catch (e) {
    next(e);
  }
});

// Saldo a favor disponible del cliente (0 si no tiene registro de cliente o de saldo).
async function saldoDisponible(clienteId) {
  if (!clienteId) return 0;

  const { data, error } = await supabase
    .from('saldos_cliente')
    .select('saldo_disponible')
    .eq('cliente_id', clienteId)
    .maybeSingle();

  if (error) throw error;

  return Number(data?.saldo_disponible || 0);
}

// =============================================
// YAPE (HU-006): el cliente yapea y envía el N° de operación; el personal lo verifica.
// Requiere supabase/10-yape-manual.sql
// =============================================

const faltaSqlYape = (error) => ['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code);

async function configYape() {
  const { data, error } = await supabase
    .from('configuracion')
    .select('clave, valor')
    .in('clave', ['yape_numero', 'yape_titular', 'yape_qr_url']);
  if (error) throw error;

  const c = Object.fromEntries((data || []).map((f) => [f.clave, txt(f.valor)]));
  if (!/^9\d{8}$/.test(c.yape_numero || '')) return null;

  return {
    numero: c.yape_numero,
    titular: c.yape_titular || null,
    qr_url: /^https:\/\//.test(c.yape_qr_url || '') ? c.yape_qr_url : null,
  };
}

// Última solicitud de Yape de la reserva (o null)
async function ultimaSolicitudYape(reservaId) {
  const { data, error } = await supabase
    .from('solicitudes_yape')
    .select('id, numero_operacion, monto, saldo_a_usar, estado, motivo_rechazo, creado_en, revisado_en')
    .eq('reserva_id', reservaId)
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (faltaSqlYape(error)) return null;
    throw error;
  }
  return data;
}

async function yapeEnVerificacion(reservaId) {
  return (await ultimaSolicitudYape(reservaId))?.estado === 'En verificación';
}

// Cada envío crea trabajo para el personal: se limita por cuenta.
const limitarYape = crearLimitador({
  ventanaMs: 15 * 60 * 1000,
  maximo: 6,
  clave: (req) => req.usuario.id,
  mensaje: 'Demasiados envíos seguidos. Espera unos minutos antes de volver a intentarlo.',
});

// GET /api/portal-cliente/yape  -> { numero, titular, qr_url }
router.get('/yape', async (_req, res, next) => {
  try {
    const yape = await configYape();
    if (!yape) return fallo(res, 503, 'El pago con Yape no está disponible en este momento.');
    res.set('Cache-Control', 'no-store');
    res.json(yape);
  } catch (e) { next(e); }
});

// POST /api/portal-cliente/reservas/:id/yape   { numero_operacion, usar_saldo?: boolean }
// No cobra nada: registra que el cliente yapeó, para que el personal lo verifique.
router.post('/reservas/:id/yape', limitarYape, async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return fallo(res, 400, 'El número de reserva no es válido.');

    const operacion = txt(req.body?.numero_operacion).replace(/\s+/g, '');
    if (!/^\d{4,20}$/.test(operacion)) {
      return fallo(res, 400, 'Escribe el número de operación que aparece en tu Yape (solo números).');
    }
    const usarSaldo = req.body?.usar_saldo === true;

    if (!(await configYape())) return fallo(res, 503, 'El pago con Yape no está disponible en este momento.');

    const propiedad = await comprobarPropiedad(req, id);
    if (propiedad.error) return fallo(res, 404, propiedad.error);

    const { data: reserva, error: errReserva } = await supabase
      .from('reservas')
      .select('id, estado, total, cliente_id')
      .eq('id', id)
      .maybeSingle();
    if (errReserva) throw errReserva;
    if (!reserva) return fallo(res, 404, 'No se encontró la reserva.');
    if (reserva.estado !== 'Pendiente') return fallo(res, 409, 'Esta reserva ya no está pendiente de pago.');

    // Mismo cálculo que con tarjeta: se usa todo el saldo posible y el resto se yapea.
    const totalCent = Math.round(Number(reserva.total) * 100);
    const clienteSaldo = propiedad.usuario.clienteId;
    let saldoCent = 0;
    if (usarSaldo) {
      saldoCent = Math.min(Math.round((await saldoDisponible(clienteSaldo)) * 100), totalCent);
      if (saldoCent <= 0) return fallo(res, 400, 'No tienes saldo a favor disponible.');
    }
    const restoCent = totalCent - saldoCent;
    if (restoCent <= 0) {
      return fallo(res, 400, 'Tu saldo cubre todo el importe: paga con tu saldo a favor, sin Yape.');
    }

    const { data, error } = await supabase
      .from('solicitudes_yape')
      .insert({
        reserva_id: id,
        // El saldo se descuenta del cliente de la cuenta; si no tiene registro, del titular.
        cliente_id: saldoCent > 0 ? clienteSaldo : (clienteSaldo || reserva.cliente_id),
        numero_operacion: operacion,
        monto: restoCent / 100,
        saldo_a_usar: saldoCent / 100,
        creado_por: req.usuario.id,
      })
      .select('id, numero_operacion, monto, saldo_a_usar, estado, creado_en')
      .single();

    if (error) {
      if (error.code === '23505') {
        return (error.message || '').includes('ux_yape_operacion')
          ? fallo(res, 409, 'Ese número de operación ya fue registrado. Revisa el número en tu Yape.')
          : fallo(res, 409, 'Ya enviaste un pago por Yape para esta reserva y lo estamos verificando.');
      }
      if (faltaSqlYape(error)) return fallo(res, 503, 'El pago con Yape no está disponible en este momento.');
      throw error;
    }

    res.status(201).json({
      mensaje: 'Recibimos tu pago por Yape. Lo verificaremos y te enviaremos la boleta por correo.',
      yape: data,
    });
  } catch (e) { next(e); }
});

// Culqi limita cada pago con Yape a S/ 2,000.
const YAPE_MAX_CENT = 200_000;

// POST /api/portal-cliente/reservas/:id/pagar
// { token?, moneda?: 'PEN' | 'USD', usar_saldo?: boolean }
// token: tkn_... (tarjeta) o ype_... (Yape por Culqi: se confirma al instante, solo soles).
// Con usar_saldo se gasta TODO el saldo posible (hasta el total de la reserva).
// Si el saldo cubre el total no hace falta tarjeta ni Yape; si no, el resto se cobra con el token.
router.post('/reservas/:id/pagar', limitarPago, async (req, res, next) => {
  let cargoId = null;
  let centimos = 0;

  const devolverCargo = async () => {
    if (!cargoId) return;

    try {
      await reembolsar({ cargoId, centimos });
      console.warn(`Reembolso OK. Reserva ${req.params.id}`);
      cargoId = null;
    } catch (e) {
      console.error(
        'URGENTE: no se pudo reembolsar el cargo de Culqi.',
        {
          reserva: req.params.id,
          cargoId,
          detalle: e.detalle || e,
        }
      );
    }
  };

  try {
    const id = idValido(req.params.id);

    if (!id) {
      return fallo(res, 400, 'El número de reserva no es válido.');
    }

    const token = txt(req.body?.token);
    const moneda = req.body?.moneda || 'PEN';
    const esYape = token.startsWith('ype_');
    const usarSaldo = req.body?.usar_saldo === true;

    if (!MONEDAS.includes(moneda)) {
      return fallo(res, 400, 'Selecciona soles o dólares.');
    }

    const propiedad = await comprobarPropiedad(req, id);

    if (propiedad.error) {
      return fallo(res, 404, propiedad.error);
    }

    const { data: reserva, error: errReserva } =
      await supabase.rpc('obtener_reserva', {
        p_id: id,
      });

    if (errReserva) throw errReserva;

    if (!reserva) {
      return fallo(res, 404, 'No se encontró la reserva.');
    }

    if (reserva.estado !== 'Pendiente') {
      return fallo(res, 409, 'Esta reserva ya no está pendiente de pago.');
    }

    // Si ya envió un pago por Yape que se está verificando, no se cobra dos veces.
    if (await yapeEnVerificacion(id)) {
      return fallo(res, 409, 'Ya enviaste un pago por Yape para esta reserva y lo estamos verificando.');
    }

    const total = Number(reserva.total);

    if (!dosDecimales(total) || total <= 0) {
      return fallo(res, 400, 'El importe de la reserva no es válido.');
    }

    // ---- Saldo a favor: se usa todo lo posible, sin pasar del total ----
    const totalCent = Math.round(total * 100);
    const clienteId = propiedad.usuario.clienteId;
    let saldoCent = 0;

    if (usarSaldo) {
      const saldo = await saldoDisponible(clienteId);
      saldoCent = Math.min(Math.round(saldo * 100), totalCent);

      if (saldoCent <= 0) {
        return fallo(res, 400, 'No tienes saldo a favor disponible.');
      }
    }

    const restoCent = totalCent - saldoCent; // lo que se cobra con tarjeta (en soles)

    // ---- Tarjeta (solo si queda algo por pagar) ----
    let tc = null;
    let cargo = null;

    if (restoCent > 0) {
      if (!/^(tkn|ype)_[A-Za-z0-9_]{4,60}$/.test(token)) {
        return fallo(res, 400, 'El token de pago no es válido.');
      }

      // Yape por Culqi: solo soles y hasta S/ 2,000 por pago (límite de Culqi).
      if (esYape && moneda !== 'PEN') {
        return fallo(res, 400, 'Yape solo acepta pagos en soles.');
      }
      if (esYape && restoCent > YAPE_MAX_CENT) {
        return fallo(res, 400, 'Yape acepta pagos de hasta S/ 2,000. Usa tarjeta para este importe.');
      }

      const email =
        txt(propiedad.usuario.perfil.correo) ||
        txt(req.usuario.correo);

      if (!email) {
        return fallo(res, 400, 'Tu cuenta necesita un correo para pagar.');
      }

      centimos = restoCent;

      if (moneda === 'USD') {
        tc = await tipoCambioUsd();

        if (!tc) {
          return fallo(res, 503, 'El tipo de cambio no está configurado.');
        }

        centimos = Math.round(centimos / tc);

        if (centimos <= 0) {
          return fallo(res, 400, 'El importe en dólares es demasiado pequeño.');
        }
      }

      try {
        cargo = await crearCargo({
          centimos,
          moneda,
          email,
          tokenId: token,
          descripcion: `Reserva ${reserva.codigo || id}`.slice(0, 80),
          reservaId: id,
          metadata: {
            origen: 'portal_cliente',
            usuario_id: req.usuario.id,
            ...(tc ? { tipo_cambio: String(tc) } : {}),
            ...(saldoCent ? { saldo_usado: String(saldoCent / 100) } : {}),
          },
        });
      } catch (e) {
        if (e instanceof ErrorPasarela) {
          if (e.detalle?.sin_respuesta) {
            console.error(
              'Culqi no respondió. Revisar su panel antes de reintentar.',
              id,
              e.detalle
            );

            return fallo(res, 504, e.message);
          }

          console.error('Culqi rechazó el cargo:', e.detalle || e);

          return fallo(res, 402, e.message);
        }

        throw e;
      }

      cargoId = cargo?.id || null;

      if (
        !cargoId ||
        (cargo.outcome && cargo.outcome.type !== 'venta_exitosa')
      ) {
        console.error('Cargo no aprobado:', JSON.stringify(cargo));

        if (cargoId) {
          await devolverCargo();
        }

        return fallo(res, 402, esYape ? 'El pago con Yape no fue aprobado.' : 'El pago con tarjeta no fue aprobado.');
      }

      const monedaCargo = String(
        cargo.currency || cargo.currency_code || ''
      ).toUpperCase();

      const montoCargo = Number(cargo.amount);

      const montoDifiere =
        !Number.isFinite(montoCargo) || montoCargo !== centimos;

      const monedaDifiere =
        monedaCargo !== '' && monedaCargo !== moneda;

      if (montoDifiere || monedaDifiere) {
        console.error('El cargo no coincide con lo solicitado:', {
          solicitado: { centimos, moneda },
          recibido: {
            id: cargoId,
            amount: cargo.amount,
            currency: monedaCargo,
          },
        });

        await devolverCargo();

        return fallo(
          res,
          502,
          'El cobro no coincidió con lo solicitado. Revisa tu reserva antes de intentar nuevamente.'
        );
      }
    }

    // ---- Registrar el pago (si falla con un cargo ya hecho, se devuelve el dinero) ----
    const lineaTarjeta = cargoId
      ? [esYape
          ? { metodo: 'QR', medio: 'Yape', monto: restoCent / 100, referencia: cargoId }
          : { metodo: 'Tarjeta', monto: restoCent / 100, referencia: cargoId }]
      : [];

    const { data: pago, error: errPago } = saldoCent > 0
      ? await supabase.rpc('registrar_pago_con_saldo', {
          p_reserva_id: id,
          p_cliente_id: clienteId,
          p_monto_saldo: saldoCent / 100,
          p_pagos: lineaTarjeta,
          p_cobrado_por: req.usuario.id,
        })
      : await supabase.rpc('registrar_pago', {
          p_reserva_id: id,
          p_pagos: lineaTarjeta,
          p_cobrado_por: req.usuario.id,
        });

    if (errPago) {
      await devolverCargo();

      const mensaje = errPago.message || '';

      if (mensaje.includes('RESERVA_NO_ENCONTRADA')) {
        return fallo(res, 404, 'La reserva no existe.');
      }

      if (
        mensaje.includes('RESERVA_NO_PENDIENTE') ||
        errPago.code === '23505'
      ) {
        return fallo(res, 409, 'La reserva ya no está pendiente de pago.');
      }

      if (mensaje.includes('SALDO_INSUFICIENTE')) {
        return fallo(res, 409, 'Tu saldo a favor cambió. Revisa el importe e inténtalo de nuevo.');
      }

      if (mensaje.includes('MONTO_NO_COINCIDE')) {
        return fallo(res, 400, 'El importe de la reserva cambió.');
      }

      if (
        mensaje.includes('DATOS_INVALIDOS') ||
        mensaje.includes('MONTO_SALDO_INVALIDO') ||
        errPago.code === '23514'
      ) {
        return fallo(res, 400, 'Los datos del pago no son válidos.');
      }

      // La función del saldo no existe: falta ejecutar supabase/07-pagar-con-saldo.sql
      if (errPago.code === 'PGRST202') {
        console.error('Falta la función registrar_pago_con_saldo en la base.');
        return fallo(res, 503, 'El pago con saldo no está disponible en este momento.');
      }

      throw errPago;
    }

    if (cargoId) {
      const { error: errMoneda } = await supabase
        .from('pago_detalles')
        .update({
          moneda,
          monto_moneda: centimos / 100,
          tipo_cambio: tc,
        })
        .eq('referencia', cargoId);

      if (errMoneda) {
        console.error(
          'El pago quedó registrado, pero no se pudo guardar la moneda.',
          cargoId,
          errMoneda
        );
      }
    }

    // HU-007: boleta automática a nombre del titular, enviada por correo con el PDF.
    const comprobante = await emitirYEnviarComprobante(id, req.usuario.id);

    return res.status(201).json({
      mensaje: comprobante
        ? 'Pago realizado correctamente. Te enviamos tu boleta por correo.'
        : 'Pago realizado correctamente.',
      pago,
      comprobante_id: comprobante?.id ?? null,
      reserva_id: id,
      estado: 'Pagada',
      saldo_utilizado: saldoCent / 100,
      tarjeta: cargoId
        ? { moneda, monto: centimos / 100, tipo_cambio: tc }
        : null,
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/portal-cliente/reservas/:id
router.get('/reservas/:id', async (req, res, next) => {
  try {
    const id = idValido(req.params.id);

    if (!id) {
      return fallo(res, 400, 'El número de reserva no es válido.');
    }

    const propiedad = await comprobarPropiedad(req, id);

    if (propiedad.error) {
      return fallo(res, 404, propiedad.error);
    }

    // Obtener las fechas directamente de la tabla reservas.
    const { data: datosReserva, error: errDatos } = await supabase
      .from('reservas')
      .select('id, estado, total, num_personas, creado_en, pagada_en, saldo_utilizado, saldo_acreditado')
      .eq('id', id)
      .maybeSingle();

    if (errDatos) throw errDatos;

    if (!datosReserva) {
      return fallo(res, 404, 'No se encontró la reserva.');
    }

    // Obtener el resto de la información de la reserva.
    const { data, error } = await supabase.rpc('obtener_reserva', {
      p_id: id,
    });

    if (error) throw error;

    if (!data) {
      return fallo(res, 404, 'No se encontró la reserva.');
    }

    // Combinar los datos sin perder la información de obtener_reserva.
    res.json({
      ...data,
      id: datosReserva.id,
      estado: datosReserva.estado,
      total: datosReserva.total,
      personas: datosReserva.num_personas,
      creado_en: datosReserva.creado_en,
      pagada_en: datosReserva.pagada_en,
      saldo_utilizado: Number(datosReserva.saldo_utilizado || 0),
      saldo_acreditado: Number(datosReserva.saldo_acreditado || 0),
      // Último pago enviado por Yape (en verificación, confirmado o rechazado)
      yape: await ultimaSolicitudYape(id),
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/portal-cliente/reservas
router.post('/reservas', async (req, res, next) => {
  try {
    const usuario = await obtenerClienteUsuario(req);

    if (!usuario) {
      return fallo(res, 400, 'No se encontraron los datos de tu perfil.');
    }

    const body = req.body || {};

    const modoManual =
      body.modo_titular === 'manual' ||
      body.usar_datos_cuenta === false;

    let titular;

    if (modoManual) {
      const c = body.cliente || {};

      titular = {
        tipo_documento: txt(c.tipo_documento).toUpperCase(),
        nro_documento: txt(
          c.nro_documento ?? c.numero_documento ?? c.dni
        ).toUpperCase(),
        apellidos: txt(c.apellidos),
        nombres: txt(c.nombres),
        fecha_nacimiento: txt(c.fecha_nacimiento),
        correo: txt(c.correo),
        telefono: txt(c.telefono),
      };
    } else {
      const cliente = usuario.cliente;

      titular = {
        tipo_documento: cliente.tipo_documento,
        nro_documento: cliente.dni,
        apellidos: cliente.apellidos,
        nombres: cliente.nombres,
        fecha_nacimiento:
          txt(body.cliente?.fecha_nacimiento) ||
          cliente.fecha_nacimiento,
        correo: cliente.correo,
        telefono: cliente.telefono,
      };
    }

    if (
      !titular.tipo_documento ||
      !titular.nro_documento ||
      !titular.nombres ||
      !titular.apellidos ||
      !titular.fecha_nacimiento ||
      !titular.correo ||
      !titular.telefono
    ) {
      return fallo(
        res,
        400,
        modoManual
          ? 'Completa todos los datos del titular.'
          : 'Completa tus datos personales antes de reservar.'
      );
    }

    const salidaId = idValido(body.salida_id);

    if (!salidaId) {
      return fallo(res, 400, 'La salida no es válida.');
    }

    const { data: salida, error: errSalida } = await supabase
      .from('salidas')
      .select('id, fecha_inicio_viaje')
      .eq('id', salidaId)
      .maybeSingle();

    if (errSalida) throw errSalida;

    if (!salida) {
      return fallo(res, 404, 'La salida no existe.');
    }

    const datos = {
      cliente: titular,
      acompanantes: body.acompanantes,
    };

    const v = validarReserva(datos, salida.fecha_inicio_viaje, {
      telefonoValido,
    });

    if (v.error) {
      return fallo(res, 400, v.error);
    }

    // El titular manual debe demostrar su identidad.
    if (modoManual) {
      const identidadTitular = await verificarIdentidad(
        v.cliente,
        'del titular'
      );

      if (identidadTitular.error) {
        return fallo(res, identidadTitular.estado, identidadTitular.error);
      }
    }

    // Verificar también a los acompañantes.
    for (const [i, acompanante] of v.acompanantes.entries()) {
      const identidad = await verificarIdentidad(
        acompanante,
        `del acompañante ${i + 1}`
      );

      if (identidad.error) {
        return fallo(res, identidad.estado, identidad.error);
      }
    }

    const { data, error } = await supabase.rpc('crear_reserva', {
      p_salida_id: salidaId,
      p_cliente: paraRpc(v.cliente),
      p_acompanantes: v.acompanantes.map(paraRpc),
      p_creado_por: req.usuario.id,
    });

    if (error) {
      const mensaje = error.message || '';

      if (mensaje.includes('CUPOS_INSUFICIENTES')) {
        return fallo(res, 409, 'La cantidad de pasajeros excede la capacidad disponible del paquete.');
      }

      if (mensaje.includes('SALIDA_NO_DISPONIBLE')) {
        return fallo(res, 409, 'La salida no está disponible.');
      }

      if (mensaje.includes('CLIENTE_MENOR')) {
        return fallo(
          res,
          400,
          'Debes ser mayor de edad para realizar la reserva.'
        );
      }

      console.error('Error SQL al crear reserva:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });

      if (
        mensaje.includes('DATOS_INVALIDOS') ||
        error.code === '23514'
      ) {
        return fallo(res, 400, 'Los datos de la reserva no son válidos.');
      }

      throw error;
    }

    res.status(201).json(data);
  } catch (e) {
    next(e);
  }
});

// POST /api/portal-cliente/reservas/:id/cancelar
router.post('/reservas/:id/cancelar', async (req, res, next) => {
  try {
    const id = idValido(req.params.id);

    if (!id) {
      return fallo(res, 400, 'El número de reserva no es válido.');
    }

    const propiedad = await comprobarPropiedad(req, id);

    if (propiedad.error) {
      return fallo(res, 404, propiedad.error);
    }

    const { usuario, reserva } = propiedad;

    // Regla del negocio: desde el portal solo se cancelan reservas YA PAGADAS
    // (el importe vuelve como saldo a favor). Una pendiente simplemente no se paga.
    if (reserva.estado === 'Cancelada') {
      return fallo(res, 409, 'Esta reserva ya se encuentra cancelada.');
    }

    if (reserva.estado !== 'Pagada') {
      return fallo(res, 409, 'Solo puedes cancelar reservas que ya fueron pagadas.');
    }

    // El cliente_id procede del perfil autenticado.
    if (!usuario.clienteId) {
      return fallo(
        res,
        400,
        'No se encontró el registro de cliente asociado a tu cuenta.'
      );
    }

    // La base acredita el saldo al TITULAR de la reserva. Si la cuenta reservó para otra
    // persona, ese saldo no sería de la cuenta: se atiende por ViajaPerú.
    if (reserva.cliente_id !== usuario.clienteId) {
      return fallo(
        res,
        409,
        'Esta reserva está a nombre de otro titular. Para cancelarla, comunícate con ViajaPerú.'
      );
    }

    const { data: resultado, error } = await supabase.rpc(
      'cancelar_reserva_cliente',
      {
        p_reserva_id: id,
        p_cliente_id: usuario.clienteId,
        p_cancelada_por: req.usuario.id,
        p_motivo: 'Cancelación solicitada por el cliente',
      }
    );

    if (error) {
      const mensaje = String(error.message || '');

      console.error('Error al cancelar reserva:', {
        reserva: id,
        code: error.code,
        message: mensaje,
        details: error.details,
      });

      if (mensaje.includes('LIMITE_CANCELACION_48_HORAS')) {
        return fallo(
          res,
          409,
          'No es posible cancelar esta reserva porque se encuentra dentro de las 48 horas previas al inicio del viaje. Para más información, comunícate con ViajaPerú.'
        );
      }

      if (mensaje.includes('RESERVA_PAGADA_CON_SALDO')) {
        return fallo(
          res,
          409,
          'Esta reserva fue pagada utilizando tu saldo a favor y no puede cancelarse desde el portal de cliente. Para más información, comunícate con ViajaPerú.'
        );
      }

      if (mensaje.includes('RESERVA_YA_CANCELADA')) {
        return fallo(res, 409, 'Esta reserva ya se encuentra cancelada.');
      }

      if (
        mensaje.includes('RESERVA_NO_ENCONTRADA') ||
        mensaje.includes('RESERVA_NO_PERTENECE_CLIENTE')
      ) {
        return fallo(res, 404, 'La reserva no existe o no te pertenece.');
      }

      if (mensaje.includes('SALIDA_EN_PROCESO_DE_CANCELACION')) {
        return fallo(
          res,
          409,
          'Esta salida ya fue cancelada por ViajaPerú.'
        );
      }

      if (mensaje.includes('ESTADO_RESERVA_NO_VALIDO')) {
        return fallo(
          res,
          409,
          'El estado de esta reserva no permite cancelarla.'
        );
      }

      if (
        mensaje.includes('SALIDA_NO_ENCONTRADA') ||
        mensaje.includes('PAGO_NO_ENCONTRADO') ||
        mensaje.includes('IMPORTE_PAGADO_NO_COINCIDE')
      ) {
        console.error('Error de integridad al cancelar reserva:', mensaje);

        return fallo(
          res,
          500,
          'No pudimos procesar la cancelación en este momento. Inténtalo nuevamente más tarde.'
        );
      }

      throw error;
    }

    if (!resultado?.ok) {
      return fallo(
        res,
        409,
        resultado?.mensaje || 'No se pudo cancelar la reserva.'
      );
    }

    // Consultar los datos para preparar el correo.
    const { data: detalle, error: errDetalle } = await supabase.rpc(
      'obtener_reserva',
      { p_id: id }
    );

    if (errDetalle) {
      console.error(
        'No se pudo consultar el detalle para el correo de cancelación:',
        errDetalle
      );
    }

    const acreditado = Number(resultado.saldo_acreditado || 0);
    const saldoDisponible = Number(resultado.saldo_disponible || 0);

    const correo =
      txt(usuario.perfil.correo) ||
      txt(usuario.cliente.correo);

    // El correo es posterior a la operación: un fallo de Resend
    // no debe deshacer una cancelación ya confirmada.
    if (correo) {
      const paquete = escaparHtml(detalle?.paquete?.nombre || 'No disponible');
      const codigo = escaparHtml(detalle?.codigo || id);

      const fechaViaje = escaparHtml(
        detalle?.fecha_inicio_viaje
          ? new Date(detalle.fecha_inicio_viaje).toLocaleString('es-PE', {
              dateStyle: 'long',
              timeStyle: 'short',
              timeZone: 'America/Lima',
            })
          : 'No disponible'
      );

      const fechaCancelacion = new Date().toLocaleString('es-PE', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'America/Lima',
      });

      const formatoSoles = (monto) =>
        Number(monto).toLocaleString('es-PE', {
          style: 'currency',
          currency: 'PEN',
        });

      // Solo una reserva PAGADA genera saldo. En una pendiente la base devuelve
      // saldo_disponible = null: mostrar "S/ 0.00" sería falso si el cliente ya tenía saldo.
      const seccionSaldo = acreditado > 0
        ? `
          <h3>Saldo a favor generado</h3>
          <p><strong>Importe acreditado:</strong> ${formatoSoles(acreditado)}</p>
          <p><strong>Saldo disponible después de la cancelación:</strong> ${formatoSoles(saldoDisponible)}</p>

          <p>Este saldo es válido exclusivamente en ViajaPerú, no tiene fecha de vencimiento
          y podrás utilizarlo en futuras reservas.</p>

          <p>No es canjeable por dinero en efectivo ni transferible.</p>`
        : '<p>Como la reserva aún no estaba pagada, no se generó saldo a favor.</p>';

      const html = `
        <div style="font-family:Arial,sans-serif;color:#243247;max-width:600px;margin:auto">
          <h2 style="color:#1456D6">Cancelación de reserva confirmada</h2>

          <p>Hemos confirmado la cancelación de tu reserva en ViajaPerú.</p>

          <h3>Datos de la reserva</h3>
          <p><strong>Reserva:</strong> ${codigo}</p>
          <p><strong>Paquete:</strong> ${paquete}</p>
          <p><strong>Fecha de viaje:</strong> ${fechaViaje}</p>
          <p><strong>Fecha de cancelación:</strong> ${escaparHtml(fechaCancelacion)}</p>

          ${seccionSaldo}

          <p>Gracias por confiar en ViajaPerú.</p>
        </div>
      `;

      try {
        await enviarCorreo({
          destinatario: correo,
          // El asunto es texto plano: va sin escapar (escaparHtml solo aplica al cuerpo HTML).
          asunto: `Cancelación confirmada - Reserva ${detalle?.codigo || id}`,
          html,
        });
      } catch (e) {
        console.error('La reserva se canceló, pero falló el correo:', {
          reserva: id,
          destinatario: correo,
          error: e.message || e,
        });
      }
    } else {
      console.warn(
        `Reserva ${id} cancelada, pero el cliente no tiene correo registrado.`
      );
    }

    return res.json({
      mensaje: 'Reserva cancelada correctamente.',
      reserva_id: id,
      estado: resultado.estado,
      saldo_acreditado: acreditado,
      saldo_disponible: saldoDisponible,
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/portal-cliente/reservas/:id/comprobante
router.get('/reservas/:id/comprobante', async (req, res, next) => {
  try {
    const id = idValido(req.params.id);

    if (!id) {
      return fallo(res, 400, 'El número de reserva no es válido.');
    }

    const propiedad = await comprobarPropiedad(req, id);

    if (propiedad.error) {
      return fallo(res, 404, propiedad.error);
    }

    const { data, error } = await supabase.rpc('comprobante_de_reserva', {
      p_reserva_id: id,
    });

    if (error) throw error;

    if (!data) {
      return fallo(res, 404, 'Esta reserva todavía no tiene comprobante.');
    }

    res.json(data);
  } catch (e) {
    next(e);
  }
});

// GET /api/portal-cliente/comprobantes/:id/pdf
router.get('/comprobantes/:id/pdf', async (req, res, next) => {
  try {
    const comprobanteId = idValido(req.params.id);

    if (!comprobanteId) {
      return fallo(res, 400, 'El número de comprobante no es válido.');
    }

    const usuario = await obtenerClienteUsuario(req);

    if (!usuario) {
      return fallo(res, 404, 'No se encontraron los datos de tu perfil.');
    }

    const { data: comprobante, error: errComp } = await supabase
      .from('comprobantes')
      .select('id, reserva_id')
      .eq('id', comprobanteId)
      .maybeSingle();

    if (errComp) throw errComp;

    if (!comprobante) {
      return fallo(res, 404, 'El comprobante no existe.');
    }

    let consultaReserva = supabase
      .from('reservas')
      .select('id')
      .eq('id', comprobante.reserva_id);

    consultaReserva = aplicarFiltroPropiedad(
      consultaReserva,
      usuario,
      req.usuario.id
    );

    const { data: reserva, error: errReserva } =
      await consultaReserva.maybeSingle();

    if (errReserva) throw errReserva;

    if (!reserva) {
      return fallo(res, 404, 'El comprobante no existe o no te pertenece.');
    }

    const { data, error } = await supabase.rpc('obtener_comprobante', {
      p_id: comprobanteId,
    });

    if (error) throw error;

    if (!data) {
      return fallo(res, 404, 'No se pudo encontrar el comprobante.');
    }

    const pdf = await generarPdf(data);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="comprobante-${comprobanteId}.pdf"`
    );

    res.send(pdf);
  } catch (e) {
    next(e);
  }
});

export default router;
