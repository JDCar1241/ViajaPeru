
import { Router } from 'express';
import { supabase } from './config/supabase.js';
import { requiereSesion, fallo } from './auth.middleware.js';
import { validarReserva, paraRpc } from './reservas.validacion.js';
import { verificarDocumento } from './verificacion-documentos.js';
import {
  txt,
  telefonoInternacionalValido,
  esTelefonoPeru,
  idValido,
} from './comunes.js';
import { generarPdf } from './comprobante.pdf.js';
import {
  crearCargo,
  reembolsar,
  ErrorPasarela,
} from './config/culqi.js';

const router = Router();

router.use(requiereSesion(['Cliente']));

const telefonoValido = (telefono) =>
  esTelefonoPeru(telefono) || telefonoInternacionalValido(telefono);

const MONEDAS = ['PEN', 'USD'];

const dosDecimales = (n) =>
  typeof n === 'number' &&
  Number.isFinite(n) &&
  Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

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
    .select('id, cliente_id, creado_por')
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
async function verificarIdentidad(persona, quien) {
  const apellidos = txt(persona.apellidos)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const apellidoPaterno = apellidos.shift() || '';
  const apellidoMaterno = apellidos.join(' ');

  const resultado = await verificarDocumento({
    tipo_documento: txt(persona.tipo_documento).toUpperCase(),
    numero_documento: txt(
      persona.nro_documento ??
      persona.numero_documento ??
      persona.dni
    ).toUpperCase(),
    nombres: txt(persona.nombres),
    apellido_paterno: apellidoPaterno,
    apellido_materno: apellidoMaterno,
  });

  if (!resultado.ok) {
    return {
      error: `No se pudo verificar la identidad ${quien}: ${resultado.motivo}`,
    };
  }

  return { ok: true };
}

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
// Permite mostrar la conversión antes de abrir Culqi.
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

// POST /api/portal-cliente/reservas/:id/pagar
// Body: { token: "tkn_...", moneda: "PEN" | "USD" }
router.post('/reservas/:id/pagar', async (req, res, next) => {
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

    if (!/^tkn_[A-Za-z0-9_]{4,60}$/.test(token)) {
      return fallo(res, 400, 'El token de tarjeta no es válido.');
    }

    if (!MONEDAS.includes(moneda)) {
      return fallo(res, 400, 'Selecciona soles o dólares.');
    }

    // Comprobar que la reserva pertenece a la cuenta.
    const propiedad = await comprobarPropiedad(req, id);

    if (propiedad.error) {
      return fallo(res, 404, propiedad.error);
    }

    // Obtener importe y estado reales desde Supabase.
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

    const total = Number(reserva.total);

    if (!dosDecimales(total) || total <= 0) {
      return fallo(res, 400, 'El importe de la reserva no es válido.');
    }

    const email =
      txt(propiedad.usuario.perfil.correo) ||
      txt(req.usuario.correo);

    if (!email) {
      return fallo(res, 400, 'Tu cuenta necesita un correo para pagar.');
    }

    // El importe original siempre está en soles.
    let tc = null;
    centimos = Math.round(total * 100);

    // Si se eligen dólares, convertir usando el tipo de cambio del servidor.
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

    // Procesar el cargo con Culqi.
    let cargo;

    try {
      cargo = await crearCargo({
        centimos,
        moneda,
        email,
        tokenId: token,
        descripcion: `Pago de reserva ${id}`,
        reservaId: id,
        metadata: {
          origen: 'portal_cliente',
          usuario_id: req.usuario.id,
          ...(tc ? { tipo_cambio: String(tc) } : {}),
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

      return fallo(res, 402, 'El pago con tarjeta no fue aprobado.');
    }

    // Validar el importe y la moneda devueltos por Culqi.
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

    // Registrar en la RPC el importe original en soles.
    const { data: pago, error: errPago } = await supabase.rpc(
      'registrar_pago',
      {
        p_reserva_id: id,
        p_pagos: [
          {
            metodo: 'Tarjeta',
            monto: total,
            referencia: cargoId,
          },
        ],
        p_cobrado_por: req.usuario.id,
      }
    );

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

      if (mensaje.includes('MONTO_NO_COINCIDE')) {
        return fallo(res, 400, 'El importe de la reserva cambió.');
      }

      if (
        mensaje.includes('DATOS_INVALIDOS') ||
        errPago.code === '23514'
      ) {
        return fallo(res, 400, 'Los datos del pago no son válidos.');
      }

      throw errPago;
    }

    // Guardar la moneda y el importe realmente cobrado.
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

    return res.status(201).json({
      mensaje: 'Pago realizado correctamente.',
      pago,
      reserva_id: id,
      estado: 'Pagada',
      tarjeta: {
        moneda,
        monto: centimos / 100,
        tipo_cambio: tc,
      },
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

    const { data, error } = await supabase.rpc('obtener_reserva', {
      p_id: id,
    });

    if (error) throw error;

    if (!data) {
      return fallo(res, 404, 'No se encontró la reserva.');
    }

    res.json(data);
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
        fecha_nacimiento: cliente.fecha_nacimiento,
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
        return fallo(res, 400, identidadTitular.error);
      }
    }

    // Verificar también a los acompañantes.
    for (const [i, acompanante] of v.acompanantes.entries()) {
      const identidad = await verificarIdentidad(
        acompanante,
        `del acompañante ${i + 1}`
      );

      if (identidad.error) {
        return fallo(res, 400, identidad.error);
      }
    }

    // Crear la reserva y descontar cupos de forma atómica.
    const { data, error } = await supabase.rpc('crear_reserva', {
      p_salida_id: salidaId,
      p_cliente: paraRpc(v.cliente),
      p_acompanantes: v.acompanantes.map(paraRpc),
      p_creado_por: req.usuario.id,
    });

    if (error) {
      const mensaje = error.message || '';

      if (mensaje.includes('CUPOS_INSUFICIENTES')) {
        return fallo(res, 409, 'No hay cupos suficientes en esta salida.');
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
