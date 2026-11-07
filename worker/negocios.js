// Verificación automática de los negocios que piden videos con influencers.
//
//   POST /api/negocios/registro   el negocio se registra con su RUC y recibe la respuesta al toque:
//                                 verificado (con su código), en revisión (con el motivo) o no entra (con el motivo)
//   GET  /panel/negocios/         panel privado con todos los registros (la misma contraseña del panel de TikTok)
//   POST /panel/negocios/decidir  aprobar, rechazar o pausar un registro desde el panel
//   revisarRucs(env)              lo llama el cron diario: vuelve a consultar el RUC de los negocios aprobados
//
// Secretos (Cloudflare → Workers → tato-pe → Configuración → Variables y secretos):
//   RUC_API_TOKEN      token del servicio de consulta de RUC. Sin él, todos los registros pasan a revisión.
//   RUC_API_URL        opcional. Por defecto, el servicio de Decolecta (ver RUC_URL_POR_DEFECTO).
//   ANTHROPIC_API_KEY  opcional. Una segunda lectura con IA de lo que el negocio va a promocionar.
// Almacenamiento: KV con el binding NEGOCIOS_KV.
//   negocio:<ruc>   el registro completo (JSON)
//   codigo:<código> el RUC al que pertenece un código de verificación
//   ruc:<ruc>       la respuesta del servicio de RUC, guardada 24 horas para no pagar dos veces la misma consulta
//   ip:<día>:<ip>   cuántos registros hizo una conexión hoy (se borra solo)
//   correo-negocio:<correo>  los RUC registrados con ese correo (para entrar a /negocio/ con un código)
//   correo-ok:<token>        el correo que ya se confirmó con código en ese formulario (1 hora)
//
// Las reglas (rubros, actividades y palabras) están en src/data/negocios.json.

import reglas from '../src/data/negocios.json' with { type: 'json' };
import { page, html, json, esc } from './ui.js';
import { comprobarCodigoCorreo, configCorreo } from './correo.js';
import { avisar, avisarTato } from './avisos.js';
import { crearSesionNegocio } from './seguridad.js';

const RUC_URL_POR_DEFECTO = 'https://api.decolecta.com/v1/sunat/ruc/full?numero={ruc}';
const MAX_POR_IP_AL_DIA = 8;
const DIAS_ENTRE_REVISIONES = 7;
const REVISIONES_POR_DIA = 20;
const MODELO_IA = 'claude-haiku-5-5';
const ORIGEN = 'https://tato.pe';

const RUBROS = Object.fromEntries(reglas.rubros.map((r) => [r.id, r]));

// ---------- Utilidades de texto ----------

/** minúsculas, sin tildes y con espacios simples, para comparar palabras */
export function normalizar(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const limpiar = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** El RUC tiene 11 dígitos, empieza en 10, 15, 16, 17 o 20 y su último dígito es de verificación (módulo 11). */
export function rucValido(ruc) {
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(ruc[i]), 0);
  const resto = 11 - (suma % 11);
  const dv = resto === 10 ? 0 : resto === 11 ? 1 : resto;
  return dv === Number(ruc[10]);
}

function codigoNuevo() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I para que no se confundan al dictarlo
  const b = crypto.getRandomValues(new Uint8Array(5));
  return 'TS-' + [...b].map((x) => letras[x % letras.length]).join('');
}

// ---------- Datos del formulario ----------

/** Lee y valida lo que manda el formulario. Devuelve { datos } o { error } con un mensaje para el negocio. */
export function leerSolicitud(body) {
  if (!body || typeof body !== 'object') return { error: 'No llegaron los datos del formulario.' };
  const ruc = String(body.ruc ?? '').replace(/\D/g, '');
  if (!rucValido(ruc)) return { error: 'Revisa tu RUC: tiene que tener 11 números y ser válido.' };
  const rubro = String(body.rubro ?? '');
  if (!RUBROS[rubro]) return { error: 'Elige el rubro de tu negocio.' };
  const promociona = limpiar(body.promociona, 600);
  if (promociona.length < 10) return { error: 'Cuéntanos en una línea qué vas a promocionar.' };
  const nombre = limpiar(body.contactoNombre, 120);
  if (nombre.length < 3) return { error: 'Escribe tu nombre.' };
  const dni = String(body.dni ?? '').replace(/\D/g, '');
  if (!/^\d{8}$/.test(dni)) return { error: 'Tu DNI tiene que tener 8 números.' };
  const whatsapp = String(body.whatsapp ?? '').replace(/\D/g, '').replace(/^51(?=9\d{8}$)/, '');
  if (!/^9\d{8}$/.test(whatsapp)) return { error: 'Tu WhatsApp tiene que ser un celular de 9 números que empiece con 9.' };
  const correo = limpiar(body.correo, 160).toLowerCase();
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return { error: 'Revisa tu correo.' };
  const acepta = body.acepta || {};
  if (!acepta.real || !acepta.etiquetas || !acepta.uso || !acepta.datos) return { error: 'Para registrarte tienes que marcar los cuatro compromisos.' };
  return {
    datos: {
      ruc,
      negocio: {
        nombreComercial: limpiar(body.nombreComercial, 120),
        rubro,
        promociona,
        redes: limpiar(body.redes, 300),
      },
      contacto: { nombre, dni, whatsapp, correo },
      para: { influencer: limpiar(body.influencer, 80), paquete: limpiar(body.paquete, 80) },
    },
  };
}

// ---------- Consulta del RUC ----------

const elegir = (o, ...claves) => {
  for (const k of claves) if (o && o[k] != null && o[k] !== '') return o[k];
  return '';
};

/** Lleva la respuesta del servicio a un mismo formato. Acepta nombres en camelCase o con guion bajo. */
export function normalizarSunat(d) {
  const r = d && typeof d === 'object' && d.data && typeof d.data === 'object' ? d.data : d;
  let actividad = elegir(r, 'actividad_economica', 'actividadEconomica', 'actividad', 'actividades_economicas', 'actividadesEconomicas');
  if (Array.isArray(actividad)) actividad = actividad.map((a) => (typeof a === 'string' ? a : elegir(a, 'descripcion', 'nombre', 'actividad'))).join(' / ');
  return {
    razonSocial: String(elegir(r, 'razon_social', 'razonSocial', 'nombre_o_razon_social', 'nombre')).trim(),
    estado: String(elegir(r, 'estado')).trim().toUpperCase(),
    condicion: String(elegir(r, 'condicion')).trim().toUpperCase(),
    actividad: String(actividad).trim(),
    tipo: String(elegir(r, 'tipo', 'tipo_contribuyente', 'tipoContribuyente')).trim(),
    direccion: String(elegir(r, 'direccion')).trim(),
    distrito: String(elegir(r, 'distrito')).trim(),
    provincia: String(elegir(r, 'provincia')).trim(),
    departamento: String(elegir(r, 'departamento')).trim(),
  };
}

/** Consulta el RUC. Devuelve { ok: true, sunat } o { ok: false, motivo: 'no_encontrado' | 'sin_servicio' | 'formato' | 'error' }. */
export async function consultarRuc(env, ruc, { usarCache = true } = {}) {
  if (!env.RUC_API_TOKEN) return { ok: false, motivo: 'sin_servicio' };
  if (usarCache) {
    const guardado = await env.NEGOCIOS_KV.get(`ruc:${ruc}`, 'json');
    if (guardado) return { ok: true, sunat: guardado };
  }
  const url = (env.RUC_API_URL || RUC_URL_POR_DEFECTO).replace('{ruc}', ruc);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${env.RUC_API_TOKEN}`, Accept: 'application/json' }, signal: ctrl.signal });
  } catch (e) {
    console.error('RUC: el servicio no respondió', e);
    return { ok: false, motivo: 'error' };
  } finally {
    clearTimeout(t);
  }
  if (res.status === 404 || res.status === 422) return { ok: false, motivo: 'no_encontrado' };
  if (!res.ok) {
    console.error('RUC: el servicio respondió', res.status);
    return { ok: false, motivo: 'error' };
  }
  const data = await res.json().catch(() => null);
  const sunat = normalizarSunat(data);
  // Respuesta sin razón social o sin estado: lo más probable es que el servicio cambió su formato.
  // Pasa a revisión (no se rechaza a nadie por eso) y queda en los registros del Worker para corregir normalizarSunat().
  if (!sunat.razonSocial || !sunat.estado) {
    console.error('RUC: respuesta con un formato que no reconozco', JSON.stringify(data)?.slice(0, 300));
    return { ok: false, motivo: 'formato' };
  }
  sunat.consultado = new Date().toISOString();
  await env.NEGOCIOS_KV.put(`ruc:${ruc}`, JSON.stringify(sunat), { expirationTtl: 86400 });
  return { ok: true, sunat };
}

// ---------- Reglas ----------

const contiene = (texto, frase) => {
  const t = ` ${normalizar(texto).replace(/[^a-z0-9ñ ]/g, ' ')} `;
  return t.includes(` ${normalizar(frase)} `);
};
const mayus = (s) => normalizar(s).toUpperCase();

/** Los temas de `palabras` que menciona un texto (por ejemplo, lo que un negocio quiere promocionar en un pedido). */
export function palabrasSospechosas(texto) {
  return reglas.palabras.filter((g) => g.textos.some((x) => contiene(texto, x))).map((g) => g.motivo);
}

/**
 * Decide el semáforo de una solicitud.
 *   verde:    RUC activo y habido, rubro permitido y nada raro en lo que va a promocionar.
 *   amarillo: hay que pedirle permisos o revisarlo (Tato decide desde el panel).
 *   rojo:     RUC con problemas o actividad que no entra.
 * motivos: frases para el negocio. notas: detalle para el panel.
 */
export function clasificar(datos, consulta) {
  const motivos = [];
  const notas = [];
  let semaforo = 'verde';
  const subir = (nivel) => {
    if (nivel === 'rojo' || (nivel === 'amarillo' && semaforo === 'verde')) semaforo = nivel;
  };

  // 1. SUNAT
  if (!consulta.ok) {
    if (consulta.motivo === 'no_encontrado') {
      subir('rojo');
      motivos.push('No encontramos ese RUC en SUNAT. Revisa el número.');
    } else {
      subir('amarillo');
      motivos.push('No pudimos consultar SUNAT en este momento, así que revisamos tu RUC y te escribimos.');
      notas.push({
        sin_servicio: 'Falta el secreto RUC_API_TOKEN: no hubo consulta automática.',
        formato: 'El servicio de RUC respondió con un formato que no reconozco: revisar normalizarSunat() en worker/negocios.js.',
      }[consulta.motivo] || 'El servicio de RUC no respondió.');
    }
  } else {
    const s = consulta.sunat;
    if (s.estado !== 'ACTIVO') {
      subir('rojo');
      motivos.push(`Tu RUC figura en SUNAT con estado ${s.estado.toLowerCase()}. Solo trabajamos con RUC activos.`);
    }
    if (s.condicion !== 'HABIDO') {
      subir('rojo');
      motivos.push(`Tu RUC figura en SUNAT como ${s.condicion.toLowerCase()}. Solo trabajamos con RUC habidos.`);
    }
    const act = mayus(s.actividad);
    for (const g of reglas.actividades.no_entra) {
      if (g.textos.some((x) => act.includes(x))) {
        subir('rojo');
        motivos.push(`Tu actividad en SUNAT es de ${g.motivo}, y con eso no trabajan nuestros influencers.`);
      }
    }
    const permiso = reglas.actividades.pide_permiso.find((g) => g.textos.some((x) => act.includes(x)));
    if (permiso && datos.negocio.rubro !== permiso.rubro && RUBROS[permiso.rubro]?.nivel === 'permiso') {
      const r = RUBROS[permiso.rubro];
      subir('amarillo');
      motivos.push(`Tu actividad en SUNAT es de ${r.nombre.toLowerCase()}: te pediremos ${r.pide}.`);
      notas.push(`Actividad SUNAT: ${s.actividad}`);
    }
    if (datos.ruc.startsWith('10') && datos.ruc.slice(2, 10) !== datos.contacto.dni) {
      subir('amarillo');
      motivos.push('El DNI que escribiste no es el de tu RUC de persona natural. Te escribimos para confirmar quién eres.');
      notas.push(`DNI del RUC: ${datos.ruc.slice(2, 10)} · DNI escrito: ${datos.contacto.dni}`);
    }
    if (/^1[567]/.test(datos.ruc)) {
      subir('amarillo');
      notas.push('RUC de un tipo poco común (empieza en 15, 16 o 17): revisar a mano.');
    }
  }

  // 2. Rubro que eligió
  const r = RUBROS[datos.negocio.rubro];
  if (r.nivel === 'permiso') {
    subir('amarillo');
    motivos.push(`Tu rubro pide ${r.pide}. Te lo pedimos por WhatsApp antes de seguir.`);
  } else if (r.nivel === 'revisar') {
    subir('amarillo');
    motivos.push('Revisamos tu rubro y te escribimos por WhatsApp.');
  }

  // 3. Lo que dice que va a promocionar
  const texto = `${datos.negocio.promociona} ${datos.negocio.nombreComercial}`;
  for (const g of reglas.palabras) {
    const hit = g.textos.find((x) => contiene(texto, x));
    if (hit) {
      subir('amarillo');
      motivos.push(`Lo que vas a promocionar menciona ${g.motivo}. Lo revisamos y te escribimos.`);
      notas.push(`Palabra: «${hit}»`);
    }
  }

  return { semaforo, motivos: [...new Set(motivos)], notas };
}

/** Segunda lectura con IA (opcional). Solo puede mandar a revisión, nunca aprobar ni rechazar sola. */
async function revisarConIA(env, datos, sunat) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODELO_IA,
        max_tokens: 200,
        system: 'Revisas pedidos de negocios peruanos que quieren un video publicitario con la imagen de un influencer. Responde solo un JSON {"nivel":"ok"|"revisar","motivo":"..."}. Usa "revisar" si el negocio promociona apuestas, inversiones o criptomonedas con ganancias, préstamos informales, política, armas, tabaco o vapeadores, contenido para adultos, productos que prometen curas o resultados milagrosos, o algo que parezca engañoso o ilegal en el Perú. El motivo va en una frase corta en español.',
        messages: [{ role: 'user', content: JSON.stringify({ rubro: RUBROS[datos.negocio.rubro]?.nombre, promociona: datos.negocio.promociona, nombreComercial: datos.negocio.nombreComercial, actividadSunat: sunat?.actividad || '' }) }],
      }),
    });
    if (!res.ok) return null;
    const out = await res.json();
    const text = out?.content?.[0]?.text || '';
    const m = text.match(/\{[\s\S]*\}/);
    const r = m ? JSON.parse(m[0]) : null;
    return r && (r.nivel === 'ok' || r.nivel === 'revisar') ? { nivel: r.nivel, motivo: String(r.motivo || '').slice(0, 200) } : null;
  } catch (e) {
    console.error('IA: no se pudo revisar', e);
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ---------- POST /api/negocios/registro ----------

const MENSAJES = {
  verde: (s, codigo) => `Listo: ${s} quedó verificado. Tu código es ${codigo}. Ya puedes pedir videos con nuestros influencers.`,
  amarillo: () => 'Recibimos tus datos. Antes de seguir tenemos que revisar algo, y te escribimos por WhatsApp.',
  rojo: () => 'Por ahora no podemos tomar pedidos de este negocio.',
};

export async function handleRegistro(request, env) {
  if (request.method !== 'POST') return json({ error: 'Usa el formulario de tato.pe/influencers/registro/.' }, 405);
  const origin = request.headers.get('Origin');
  if (origin && origin !== ORIGEN && origin !== new URL(request.url).origin) return json({ error: 'Origen no permitido.' }, 403);
  const largo = Number(request.headers.get('Content-Length') || 0);
  if (largo > 12000) return json({ error: 'Los datos son demasiado largos.' }, 413);
  const body = await request.json().catch(() => null);

  // Campo trampa para bots: una persona nunca lo llena.
  if (body && body.sitio) return json({ semaforo: 'amarillo', mensaje: MENSAJES.amarillo(), motivos: [] });

  const { datos, error } = leerSolicitud(body);
  if (error) return json({ error }, 400);

  // Límite por conexión para que nadie gaste las consultas de RUC a lo loco.
  const ip = request.headers.get('CF-Connecting-IP') || 'sin-ip';
  const claveIp = `ip:${new Date().toISOString().slice(0, 10)}:${ip}`;
  const usos = Number((await env.NEGOCIOS_KV.get(claveIp)) || 0);
  if (usos >= MAX_POR_IP_AL_DIA) return json({ error: 'Hiciste muchos registros hoy. Escríbenos por WhatsApp y lo vemos.' }, 429);
  await env.NEGOCIOS_KV.put(claveIp, String(usos + 1), { expirationTtl: 86400 });

  // Correo confirmado con un código (si el envío de correos está configurado). Si el registro se reenvía
  // desde el mismo formulario (por ejemplo, para corregir el RUC), el correo ya confirmado se recuerda 1 hora.
  let correoVerificado = '';
  if (configCorreo(env).listo) {
    const token = /^[0-9a-f-]{36}$/.test(String(body.token || '')) ? body.token : '';
    if (!datos.contacto.correo || !token) return json({ error: 'Escribe tu correo y confírmalo con el código que te llega.' }, 400);
    if ((await env.NEGOCIOS_KV.get(`correo-ok:${token}`)) !== datos.contacto.correo) {
      const r = await comprobarCodigoCorreo(env, { desafio: String(body.desafioCorreo || ''), codigo: body.codigoCorreo, correo: datos.contacto.correo, proposito: 'registro-negocio', titular: `registro-negocio:${token}` });
      if (r.error) return json({ error: r.error }, 400);
      await env.NEGOCIOS_KV.put(`correo-ok:${token}`, datos.contacto.correo, { expirationTtl: 3600 });
    }
    correoVerificado = new Date().toISOString();
  }

  const consulta = await consultarRuc(env, datos.ruc);
  const { semaforo: sem, motivos, notas } = clasificar(datos, consulta);
  let semaforo = sem;
  let ia = null;
  if (semaforo === 'verde') {
    ia = await revisarConIA(env, datos, consulta.ok ? consulta.sunat : null);
    if (ia?.nivel === 'revisar') {
      semaforo = 'amarillo';
      motivos.push('Revisamos lo que vas a promocionar y te escribimos por WhatsApp.');
      notas.push(`IA: ${ia.motivo}`);
    }
  }

  const ahora = new Date().toISOString();
  const previo = await env.NEGOCIOS_KV.get(`negocio:${datos.ruc}`, 'json');

  // Si el RUC ya estaba registrado con otra persona, no se toca ese registro: el intento queda anotado
  // y se revisa a mano (un RUC es público y cualquiera podría escribirlo). Si el negocio no entra, se responde eso.
  if (previo && previo.contacto?.dni !== datos.contacto.dni && semaforo !== 'rojo') {
    previo.intentos = [...(previo.intentos || []).slice(-4), { fecha: ahora, contacto: datos.contacto, negocio: datos.negocio }];
    previo.notas = [...new Set([...(previo.notas || []), 'Otra persona intentó registrar este RUC: ver intentos.'])];
    previo.actualizado = ahora;
    await guardar(env, previo);
    return json({
      semaforo: 'amarillo',
      codigo: null,
      razonSocial: '',
      mensaje: MENSAJES.amarillo(),
      motivos: ['Este RUC ya está registrado con otro contacto. Te escribimos para confirmar.'],
    });
  }
  // Si Tato lo rechazó o lo pausó a mano, volver a registrarse no cambia su decisión.
  const contacto = { ...datos.contacto, correoVerificado: correoVerificado || (previo?.contacto?.correo === datos.contacto.correo ? previo.contacto.correoVerificado || '' : '') };
  if (previo && previo.decision?.por === 'Tato' && (previo.semaforo === 'rojo' || previo.semaforo === 'pausado')) {
    const correoAntes = previo.contacto?.correo;
    Object.assign(previo, { negocio: datos.negocio, contacto, para: datos.para, actualizado: ahora });
    previo.historial = [...(previo.historial || []).slice(-9), { fecha: ahora, semaforo: previo.semaforo, por: 'registro', nota: 'Se volvió a registrar; se mantuvo la decisión de Tato.' }];
    await guardar(env, previo);
    await indexarCorreo(env, previo, correoAntes);
    const rechazado = previo.semaforo === 'rojo';
    return json({
      semaforo: rechazado ? 'rojo' : 'amarillo',
      codigo: null,
      razonSocial: '',
      mensaje: rechazado ? MENSAJES.rojo() : 'Tu registro está en pausa. Te escribimos por WhatsApp para ver cómo seguir.',
      motivos: [],
    });
  }
  // Si Tato ya lo aprobó, su decisión se mantiene mientras el RUC siga bien (no se rechaza).
  if (previo?.semaforo === 'verde' && previo.decision?.por === 'Tato' && semaforo === 'amarillo') {
    semaforo = 'verde';
    notas.push('Se mantuvo la aprobación de Tato.', ...motivos);
    motivos.length = 0;
  }
  if (previo && previo.contacto?.dni !== datos.contacto.dni) {
    return json({ semaforo, codigo: null, razonSocial: '', mensaje: MENSAJES.rojo(), motivos });
  }
  const codigo = previo?.codigo || (semaforo === 'verde' ? codigoNuevo() : null);
  const registro = {
    ruc: datos.ruc,
    codigo,
    semaforo,
    motivos,
    notas,
    negocio: datos.negocio,
    contacto,
    para: datos.para,
    sunat: consulta.ok ? consulta.sunat : null,
    ia,
    decision: previo?.decision?.por === 'Tato' && semaforo === 'verde' ? previo.decision : { por: 'automático', fecha: ahora },
    creado: previo?.creado || ahora,
    actualizado: ahora,
    historial: [
      ...(previo?.historial || []).slice(-9),
      {
        fecha: ahora,
        semaforo,
        por: 'registro',
        ...(previo && previo.contacto?.whatsapp !== datos.contacto.whatsapp ? { nota: `Cambió su WhatsApp; antes era ${previo.contacto.whatsapp}.` } : {}),
      },
    ],
    intentos: previo?.intentos || [],
  };
  await guardar(env, registro);
  await indexarCorreo(env, registro, previo?.contacto?.correo);
  if (codigo && codigo !== previo?.codigo) await env.NEGOCIOS_KV.put(`codigo:${codigo}`, datos.ruc);
  if (semaforo === 'amarillo') {
    await avisarTato(env, { asunto: `Negocio por revisar: ${registro.sunat?.razonSocial || datos.negocio.nombreComercial || datos.ruc}`, titulo: 'Un negocio espera tu revisión', parrafos: [motivos.join(' ') || 'Revísalo en el panel.'], ruta: `/panel/negocio/?ruc=${datos.ruc}` });
  }

  const nombre = registro.sunat?.razonSocial || datos.negocio.nombreComercial || 'tu negocio';
  // Un solo registro: con el correo confirmado, el negocio queda dentro de su panel (/negocio/).
  const portal = Boolean(contacto.correoVerificado) && semaforo !== 'rojo';
  const res = json({
    semaforo,
    codigo: semaforo === 'verde' ? codigo : null,
    razonSocial: registro.sunat?.razonSocial || '',
    mensaje: MENSAJES[semaforo](nombre, codigo),
    motivos,
    portal,
  });
  if (portal) res.headers.append('Set-Cookie', await crearSesionNegocio(env, request, contacto.correo));
  return res;
}

/**
 * Índice correo → RUC para entrar a /negocio/. Cuenta todo correo registrado, verificado o no:
 * para entrar igual hace falta el código que llega a ese correo, y al usarlo el correo queda verificado.
 */
export async function indexarCorreo(env, r, correoAntes = '') {
  const quitar = async (correo) => {
    const k = `correo-negocio:${correo}`;
    const lista = (await env.NEGOCIOS_KV.get(k, 'json')) || [];
    const resto = lista.filter((x) => x !== r.ruc);
    if (resto.length !== lista.length) await (resto.length ? env.NEGOCIOS_KV.put(k, JSON.stringify(resto)) : env.NEGOCIOS_KV.delete(k));
  };
  if (correoAntes && correoAntes !== r.contacto?.correo) await quitar(correoAntes);
  if (r.contacto?.correo) {
    const k = `correo-negocio:${r.contacto.correo}`;
    const lista = (await env.NEGOCIOS_KV.get(k, 'json')) || [];
    if (!lista.includes(r.ruc)) await env.NEGOCIOS_KV.put(k, JSON.stringify([...lista, r.ruc].slice(-20)));
  }
}

/**
 * Los negocios de un correo. Por defecto, solo los que ya lo confirmaron (los que se ven en el portal);
 * con `todos`, también los que lo escribieron al registrarse y todavía no lo confirman.
 */
export async function negociosDeCorreo(env, correo, { todos = false } = {}) {
  if (!correo) return [];
  const rucs = (await env.NEGOCIOS_KV.get(`correo-negocio:${correo}`, 'json')) || [];
  const regs = await Promise.all(rucs.map((ruc) => env.NEGOCIOS_KV.get(`negocio:${ruc}`, 'json')));
  return regs.filter((r) => r && r.contacto?.correo === correo && (todos || r.contacto.correoVerificado));
}

/** El negocio ya probó que el correo es suyo (con un código): todos sus registros con ese correo quedan verificados. */
export async function confirmarCorreoNegocios(env, correo) {
  const ahora = new Date().toISOString();
  for (const r of await negociosDeCorreo(env, correo, { todos: true })) {
    if (r.contacto.correoVerificado) continue;
    r.contacto.correoVerificado = ahora;
    r.historial = [...(r.historial || []).slice(-9), { fecha: ahora, semaforo: r.semaforo, por: 'portal', nota: 'Confirmó su correo al entrar a su panel.' }];
    await guardar(env, r);
  }
}

/**
 * Para los negocios que se registraron sin correo: los encuentra con su RUC, el DNI y el WhatsApp
 * del contacto tal como los registraron. Devuelve el registro o null.
 */
export async function negocioPorContacto(env, { ruc, dni, whatsapp }) {
  const r = /^\d{11}$/.test(ruc || '') ? await env.NEGOCIOS_KV.get(`negocio:${ruc}`, 'json') : null;
  const solo = (x) => String(x || '').replace(/\D/g, '').slice(-9);
  if (!r || String(r.contacto?.dni || '') !== String(dni || '').trim() || solo(r.contacto?.whatsapp) !== solo(whatsapp)) return null;
  return r;
}

/** Pone y verifica el correo de un negocio (después de un código) y lo indexa. */
export async function ponerCorreoNegocio(env, r, correo) {
  const antes = r.contacto?.correo || '';
  const ahora = new Date().toISOString();
  r.contacto = { ...r.contacto, correo, correoVerificado: ahora };
  r.actualizado = ahora;
  r.historial = [...(r.historial || []).slice(-9), { fecha: ahora, semaforo: r.semaforo, por: 'portal', nota: antes && antes !== correo ? `Cambió su correo; antes era ${antes}.` : 'Agregó y confirmó su correo.' }];
  await guardar(env, r);
  await indexarCorreo(env, r, antes);
}

/** Una sola vez: indexa el correo de los negocios registrados antes del portal. */
export async function migrarIndiceCorreos(env) {
  const marca = 'migracion:indice-correos:1';
  if (await env.NEGOCIOS_KV.get(marca)) return 0;
  let cursor;
  let n = 0;
  do {
    const lote = await env.NEGOCIOS_KV.list({ prefix: 'negocio:', cursor });
    for (const k of lote.keys) {
      const r = await env.NEGOCIOS_KV.get(k.name, 'json');
      if (r?.contacto?.correo) {
        const limpio = String(r.contacto.correo).trim().toLowerCase();
        if (limpio !== r.contacto.correo) {
          r.contacto.correo = limpio;
          await guardar(env, r);
        }
        await indexarCorreo(env, r);
        n += 1;
      }
    }
    cursor = lote.list_complete ? undefined : lote.cursor;
  } while (cursor);
  await env.NEGOCIOS_KV.put(marca, new Date().toISOString());
  return n;
}

export const guardarNegocio = (env, r) => guardar(env, r);

async function guardar(env, r) {
  await env.NEGOCIOS_KV.put(`negocio:${r.ruc}`, JSON.stringify(r), {
    metadata: { semaforo: r.semaforo, nombre: (r.sunat?.razonSocial || r.negocio.nombreComercial || '').slice(0, 80), actualizado: r.actualizado },
  });
}

// ---------- Panel ----------

const ETIQUETA = { verde: 'Verificado', amarillo: 'En revisión', rojo: 'No entra', pausado: 'Pausado' };

async function listar(env) {
  const out = [];
  let cursor;
  do {
    const lote = await env.NEGOCIOS_KV.list({ prefix: 'negocio:', cursor });
    out.push(...lote.keys);
    cursor = lote.list_complete ? undefined : lote.cursor;
  } while (cursor);
  return out;
}

export async function handlePanelNegocios(request, env, url) {
  const msg = url.searchParams.get('msg');
  const filtro = url.searchParams.get('ver') || 'amarillo';
  const avisos = [];
  if (!env.RUC_API_TOKEN) avisos.push('<p class="err">Falta el secreto <code>RUC_API_TOKEN</code>: los registros no se verifican solos y todos quedan en revisión.</p>');
  if (msg) avisos.push(`<p class="notice">${esc(msg)}</p>`);

  const claves = await listar(env);
  const cuenta = { todos: claves.length, verde: 0, amarillo: 0, rojo: 0, pausado: 0 };
  for (const k of claves) cuenta[k.metadata?.semaforo] = (cuenta[k.metadata?.semaforo] || 0) + 1;
  const elegidas = claves
    .filter((k) => filtro === 'todos' || k.metadata?.semaforo === filtro)
    .sort((a, b) => String(b.metadata?.actualizado || '').localeCompare(String(a.metadata?.actualizado || '')))
    .slice(0, 100);
  const registros = (await Promise.all(elegidas.map((k) => env.NEGOCIOS_KV.get(k.name, 'json')))).filter(Boolean);

  const tabs = ['amarillo', 'verde', 'rojo', 'pausado', 'todos']
    .map((f) => `<a href="?ver=${f}"${f === filtro ? ' aria-current="page"' : ''}>${f === 'todos' ? 'Todos' : ETIQUETA[f]} (${cuenta[f] || 0})</a>`).join('');

  const fecha = (s) => (s ? new Date(s).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }) : '');
  const filas = registros.map((r) => {
    const s = r.sunat || {};
    const wa = `https://wa.me/51${r.contacto.whatsapp}?text=${encodeURIComponent(`Hola ${r.contacto.nombre.split(' ')[0]}, te escribo de Tato Studio por el registro de tu negocio.`)}`;
    return `<details class="reg">
      <summary><span class="badge b-${esc(r.semaforo)}">${esc(ETIQUETA[r.semaforo] || r.semaforo)}</span>
        <b>${esc(s.razonSocial || r.negocio.nombreComercial || 'Sin nombre')}</b>
        <span class="muted">RUC ${esc(r.ruc)} · ${esc(fecha(r.actualizado))}${r.codigo ? ` · ${esc(r.codigo)}` : ''}</span></summary>
      <div class="cuerpo">
        <p><a href="/panel/negocio/?ruc=${esc(r.ruc)}">Abrir su ficha: pedidos, pagos y su panel como lo ve →</a></p>
        ${r.motivos?.length ? `<ul>${r.motivos.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
        ${r.notas?.length ? `<p class="muted">${r.notas.map(esc).join(' · ')}</p>` : ''}
        <dl>
          <dt>Nombre comercial</dt><dd>${esc(r.negocio.nombreComercial || '—')}</dd>
          <dt>Rubro elegido</dt><dd>${esc(RUBROS[r.negocio.rubro]?.nombre || r.negocio.rubro)}</dd>
          <dt>Va a promocionar</dt><dd>${esc(r.negocio.promociona)}</dd>
          <dt>Web o redes</dt><dd>${esc(r.negocio.redes || '—')}</dd>
          <dt>SUNAT</dt><dd>${s.estado ? `${esc(s.estado)} · ${esc(s.condicion)} · ${esc(s.tipo)}` : 'Sin consulta'}</dd>
          <dt>Actividad</dt><dd>${esc(s.actividad || '—')}</dd>
          <dt>Dirección</dt><dd>${esc([s.direccion, s.distrito, s.provincia, s.departamento].filter(Boolean).join(', ') || '—')}</dd>
          <dt>Contacto</dt><dd>${esc(r.contacto.nombre)} · DNI ${esc(r.contacto.dni)} · <a href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp ${esc(r.contacto.whatsapp)}</a>${r.contacto.correo ? ` · ${esc(r.contacto.correo)}${r.contacto.correoVerificado ? ' (verificado)' : ' (sin verificar)'}` : ''}</dd>
          ${r.para?.influencer ? `<dt>Venía a pedir</dt><dd>${esc(r.para.influencer)}${r.para.paquete ? ` · ${esc(r.para.paquete)}` : ''}</dd>` : ''}
          ${r.intentos?.length ? `<dt>Otros contactos</dt><dd>${r.intentos.map((x) => `${esc(fecha(x.fecha))}: ${esc(x.contacto.nombre)} · DNI ${esc(x.contacto.dni)} · ${esc(x.contacto.whatsapp)}`).join('<br>')}</dd>` : ''}
          <dt>Decisión</dt><dd>${esc(r.decision?.por || '')} · ${esc(fecha(r.decision?.fecha))}${r.decision?.nota ? ` · ${esc(r.decision.nota)}` : ''}</dd>
          ${r.historial?.length ? `<dt>Historial</dt><dd>${r.historial.slice().reverse().map((h) => `${esc(fecha(h.fecha))}: ${esc(ETIQUETA[h.semaforo] || h.semaforo)} · ${esc(h.por)}${h.nota ? ` · ${esc(h.nota)}` : ''}`).join('<br>')}</dd>` : ''}
        </dl>
        <form class="acciones" method="post" action="/panel/negocios/decidir">
          <input type="hidden" name="ruc" value="${esc(r.ruc)}">
          <input name="nota" placeholder="Nota (opcional): qué revisaste" maxlength="300">
          <button class="ok" name="decision" value="aprobar">Aprobar</button>
          <button class="no" name="decision" value="rechazar">No entra</button>
          <button class="pausa" name="decision" value="pausar">Pausar</button>
        </form>
      </div>
    </details>`;
  }).join('');

  const body = `${avisos.join('')}
    <div class="tabs">${tabs}</div>
    ${filas || '<p class="muted">No hay registros aquí.</p>'}
    ${claves.length > 100 ? '<p class="muted">Se muestran los 100 más recientes de esta lista.</p>' : ''}`;
  return html(page('Negocios', body));
}

export async function handleDecidir(request, env, url) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return html(page('Negocios', '<p class="err">Origen no permitido.</p>'), 403);
  const form = await request.formData();
  const ruc = String(form.get('ruc') || '').replace(/\D/g, '');
  const decision = String(form.get('decision') || '');
  const nota = limpiar(form.get('nota'), 300);
  const r = await env.NEGOCIOS_KV.get(`negocio:${ruc}`, 'json');
  const volver = (m) => Response.redirect(`${url.origin}/panel/negocios/?msg=${encodeURIComponent(m)}`, 303);
  if (!r) return volver('No encontré ese registro.');
  const semaforo = { aprobar: 'verde', rechazar: 'rojo', pausar: 'pausado' }[decision];
  if (!semaforo) return volver('Decisión no válida.');
  const ahora = new Date().toISOString();
  if (semaforo === 'verde' && !r.codigo) {
    r.codigo = codigoNuevo();
    await env.NEGOCIOS_KV.put(`codigo:${r.codigo}`, r.ruc);
  }
  r.semaforo = semaforo;
  r.decision = { por: 'Tato', fecha: ahora, nota };
  r.actualizado = ahora;
  r.historial = [...(r.historial || []).slice(-9), { fecha: ahora, semaforo, por: 'Tato', nota }];
  await guardar(env, r);
  const nombre = r.sunat?.razonSocial || r.negocio.nombreComercial || r.ruc;
  let avisado = false;
  if (r.contacto?.correoVerificado) {
    const textos = {
      verde: { asunto: `${nombre} está verificado`, titulo: 'Tu negocio está verificado', parrafos: [`Tu código es ${r.codigo}. Con tu RUC y este código pides videos desde el perfil de cada influencer.`], ruta: '/negocio/', boton: 'Ir a mi panel' },
      rojo: { asunto: `Sobre el registro de ${nombre}`, titulo: 'No podemos tomar pedidos de tu negocio', parrafos: ['Revisamos tu registro y por ahora no podemos hacer videos con influencers para tu negocio.', ...(nota ? [nota] : [])] },
      pausado: { asunto: `El registro de ${nombre} está en pausa`, titulo: 'Tu registro está en pausa', parrafos: ['Te escribimos por WhatsApp para ver cómo seguir.', ...(nota ? [nota] : [])] },
    };
    avisado = await avisar(env, r.contacto.correo, textos[semaforo]);
  }
  const ok = semaforo === 'verde' ? `${nombre} quedó verificado con el código ${r.codigo}.` : `${nombre}: ${ETIQUETA[semaforo].toLowerCase()}.`;
  const mensaje = `${ok}${avisado ? ' Le avisamos por correo.' : semaforo === 'verde' ? ' Avísale por WhatsApp.' : ''}`;
  if (form.get('volver') === 'ficha') return Response.redirect(`${url.origin}/panel/negocio/?ruc=${r.ruc}&msg=${encodeURIComponent(mensaje)}`, 303);
  return volver(mensaje);
}

// ---------- Revisión diaria ----------

/** Vuelve a consultar el RUC de los negocios verificados (de a pocos por día). Si su RUC deja de estar activo o habido, los pausa. */
export async function revisarRucs(env) {
  if (!env.RUC_API_TOKEN || !env.NEGOCIOS_KV) return { revisados: 0, pausados: 0 };
  const claves = (await listar(env)).filter((k) => k.metadata?.semaforo === 'verde');
  let revisados = 0;
  let pausados = 0;
  const limite = Date.now() - DIAS_ENTRE_REVISIONES * 86400000;
  for (const k of claves) {
    if (revisados >= REVISIONES_POR_DIA) break;
    const r = await env.NEGOCIOS_KV.get(k.name, 'json');
    if (!r || (r.sunat?.consultado && Date.parse(r.sunat.consultado) > limite)) continue;
    const consulta = await consultarRuc(env, r.ruc, { usarCache: false });
    revisados++;
    if (!consulta.ok) continue; // si el servicio falla, se intenta otro día
    r.sunat = consulta.sunat;
    const ahora = new Date().toISOString();
    if (r.sunat.estado !== 'ACTIVO' || r.sunat.condicion !== 'HABIDO') {
      r.semaforo = 'pausado';
      r.motivos = [`En la revisión diaria su RUC figura como ${r.sunat.estado.toLowerCase()} y ${r.sunat.condicion.toLowerCase()}.`];
      r.decision = { por: 'revisión diaria', fecha: ahora };
      r.historial = [...(r.historial || []).slice(-9), { fecha: ahora, semaforo: 'pausado', por: 'revisión diaria' }];
      pausados++;
    }
    r.actualizado = ahora;
    await guardar(env, r);
  }
  return { revisados, pausados };
}
