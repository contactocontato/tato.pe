// Servicios y precios de la portada de tato.pe, en soles.
// Al cambiar un precio aquí se actualizan su tarjeta, la tabla de precios y el globo de Tato ("desde S/ ...").
// Las fotos de las tarjetas están en public/inicio/servicios/ (800 × 600, WebP).

export type Seccion = 'automatico' | 'contenido' | 'mensual' | 'familia' | 'aprende';

export type Media =
  | { type: 'img'; src: string; alt: string }
  | { type: 'video'; src: string; poster: string; alt: string }
  | { type: 'svg'; name: 'ficha' | 'convenio' | 'vela' | 'tickets' | 'terminal' | 'nara'; alt: string }
  | { type: 'logo'; alt: string };

export interface Servicio {
  id: string;
  media: Media;
  price: string;
  title: string;
  desc: string;
  meta?: string;
  incluye: string[];
  necesitas?: string;
  costo?: string;
  nota?: string;
  /** La nota lleva el link de afiliado de Higgsfield. */
  affiliate?: boolean;
  /** Un link extra por WhatsApp: [texto del link, mensaje]. */
  extraLink?: [string, string];
  /** Mensaje de WhatsApp del botón "Pedir por WhatsApp". */
  wa: string;
}

export interface FilaPrecio {
  id: string;
  nombre: string;
  precio: string;
  /** Si el pedido necesita permiso de la familia o de las personas que salen en las fotos. */
  permiso?: 'familia' | 'personas';
}

export const secciones: Record<Seccion, Servicio[]> = {
  "automatico": [
    {
      "id": "correo",
      "media": {
        "type": "img",
        "src": "/inicio/servicios/correo.webp",
        "alt": "Dueña de un café en Barranco trabaja en su laptop junto a la ventana"
      },
      "price": "desde S/ 1,020",
      "title": "Correo ordenado con IA",
      "desc": "Tu bandeja limpia, con etiquetas que se ponen solas y una IA que te resume el día y te deja respuestas listas.",
      "incluye": [
        "Sesión de 90 minutos por videollamada: tú entras a tu correo y compartes pantalla. Nunca te pido contraseñas.",
        "Limpieza: te das de baja de lo que no lees y archivamos lo viejo en bloque.",
        "Etiquetas y filtros automáticos: clientes, facturas, proveedores y para leer después.",
        "Un asistente de IA que te resume el día y te prepara borradores de respuesta.",
        "5 respuestas modelo, tu firma profesional, una guía de una página y un seguimiento de 20 minutos."
      ],
      "necesitas": "Gmail u Outlook y una computadora.",
      "costo": "S/ 0 con herramientas gratuitas. Si recibes mucho correo, te recomiendo un asistente de pago y te digo cuánto cuesta antes de activarlo.",
      "wa": "Hola Tato, quiero ordenar mi correo con IA."
    },
    {
      "id": "whatsapp",
      "media": {
        "type": "img",
        "src": "/inicio/servicios/whatsapp.webp",
        "alt": "Dueña de una panadería en Huaraz responde mensajes en su celular"
      },
      "price": "desde S/ 1,370",
      "title": "Asistente de WhatsApp con IA",
      "desc": "Responde preguntas, precios y horarios por ti, a cualquier hora del día.",
      "incluye": [
        "Tu número del negocio conectado a la API oficial de WhatsApp, con Kommo.",
        "Una IA entrenada con tus productos, precios, horarios y preguntas frecuentes.",
        "Guarda el nombre de cada interesado y lo que busca.",
        "Te pasa la conversación cuando el tema es delicado, y responde por ti fuera de horario.",
        "Entrega en una sesión de 60 a 90 minutos y 7 días de ajustes."
      ],
      "necesitas": "El número de tu negocio, acceso a tu Meta Business y una cuenta de Kommo a tu nombre.",
      "costo": "Kommo cobra por usuario cada mes y Meta cobra por conversación, unos centavos. Te paso los montos antes de empezar.",
      "nota": "Queda listo en unos días: depende de la verificación de Meta.",
      "wa": "Hola Tato, quiero un asistente de WhatsApp con IA."
    },
    {
      "id": "agenda",
      "media": {
        "type": "img",
        "src": "/inicio/servicios/agenda.webp",
        "alt": "Recepción de un salón de belleza en Ica con una tablet de reservas"
      },
      "price": "desde S/ 680",
      "title": "Agenda con cobro en línea",
      "desc": "Tus clientes reservan y pagan por adelantado. Se acabaron las citas que no llegan.",
      "incluye": [
        "Página de reservas con tu logo, tu foto y tus colores, y un link corto para tu bio.",
        "Hasta 5 servicios con su duración y su precio.",
        "Cobro del total o de un adelanto al reservar.",
        "Se sincroniza con tu calendario para que no se crucen las citas.",
        "Confirmaciones, recordatorios y política de cancelación, más una reserva de prueba real."
      ],
      "necesitas": "Calendario de Google u Outlook y una cuenta de pago en línea, como Mercado Pago. Si no tienes, lo armamos con confirmación de pago por Yape.",
      "costo": "S/ 0 de mensualidad. La plataforma de pago cobra una comisión por cada pago.",
      "wa": "Hola Tato, quiero una agenda con cobro en línea."
    },
    {
      "id": "resenas",
      "media": {
        "type": "img",
        "src": "/inicio/servicios/resenas.webp",
        "alt": "Clienta de una cevichería de Lima califica el local en su celular"
      },
      "price": "desde S/ 510",
      "title": "Reseñas de Google con IA",
      "desc": "Un sistema simple para pedir reseñas a tus clientes y responderlas todas.",
      "incluye": [
        "Link corto y código QR para pedir reseñas en el mostrador, la boleta o el empaque.",
        "3 mensajes listos para pedirlas por WhatsApp.",
        "3 respuestas modelo y un prompt de IA para responder cualquier reseña en un minuto.",
        "Ajuste de tu Perfil de Empresa: categorías, horario, servicios y fotos.",
        "Una guía de lo que Google permite y lo que no."
      ],
      "necesitas": "Tu Perfil de Empresa en Google. Si no está verificado, empezamos por ahí.",
      "costo": "S/ 0 al mes.",
      "wa": "Hola Tato, quiero más reseñas en Google."
    },
    {
      "id": "correos",
      "media": {
        "type": "img",
        "src": "/inicio/servicios/correos.webp",
        "alt": "Dueña de una tienda de ropa en Gamarra revisa su celular entre percheros"
      },
      "price": "desde S/ 1,020",
      "title": "Correos automáticos",
      "desc": "Bienvenida y promociones que salen solas a tu lista de clientes.",
      "incluye": [
        "Cuenta de Brevo a tu nombre: todo queda tuyo.",
        "Formulario de suscripción con doble confirmación para tu web o tu bio.",
        "3 correos de bienvenida escritos con IA y revisados por mí.",
        "Plantilla de promociones con tu logo y tus colores.",
        "Tu dominio configurado para llegar a la bandeja de entrada, con prueba en vivo."
      ],
      "necesitas": "Tu logo, tus colores y una oferta para quien se suscribe. Mejor si tienes dominio propio.",
      "costo": "S/ 0 hasta 300 correos al día con el plan gratis de Brevo. Si creces, hay planes de pago.",
      "wa": "Hola Tato, quiero correos automáticos para mis clientes."
    },
    {
      "id": "notas",
      "media": {
        "type": "img",
        "src": "/inicio/servicios/notas.webp",
        "alt": "Escritorio con una laptop en videollamada, un cuaderno de notas y café"
      },
      "price": "desde S/ 330",
      "title": "Notas de reuniones con IA",
      "desc": "Cada reunión termina con un resumen y las tareas en tu correo.",
      "incluye": [
        "Elijo la herramienta según dónde te reúnes: Zoom, Google Meet o Teams.",
        "Grabación y transcripción automática en español o en inglés.",
        "Resumen y tareas en tu correo al terminar cada reunión.",
        "Para llamadas en altavoz, una app en tu celular y un mensaje para avisar que se graba.",
        "Capacitación de 30 minutos y una guía corta."
      ],
      "necesitas": "Tu correo con calendario y la app de reuniones que ya usas.",
      "costo": "S/ 0 con un plan gratis. Si te quedas corto, te digo cuánto cuesta el plan de pago antes de activarlo.",
      "wa": "Hola Tato, quiero notas automáticas de mis reuniones."
    }
  ],
  "contenido": [
    {
      "id": "influencer-ia",
      "media": {
        "type": "svg",
        "name": "ficha",
        "alt": "Hoja de personaje: el mismo personaje de frente, de tres cuartos y de perfil"
      },
      "price": "desde S/ 499",
      "title": "Influencer IA para tu marca",
      "desc": "Un personaje propio que da la cara por tu marca en TikTok e Instagram. Consistente y tuyo: sale igual en cada video.",
      "incluye": [
        "Personalidad, historia y voz según lo que vende tu negocio.",
        "Hoja de personaje para que salga igual de frente, de perfil y en cualquier escena.",
        "Sus primeros videos, listos para publicar."
      ],
      "necesitas": "Qué vendes, a quién le hablas y cómo quieres que se vea.",
      "wa": "Hola Tato, quiero un influencer IA para mi marca."
    },
    {
      "id": "influencers-peru",
      "media": {
        "type": "svg",
        "name": "convenio",
        "alt": "Un influencer con convenio y el video de un negocio pequeño"
      },
      "price": "A cotizar",
      "title": "Influencers de talla nacional",
      "desc": "Con IA hago los videos de tu negocio con la cara, la voz y el estilo de influencers peruanos que me autorizan su imagen.",
      "incluye": [
        "Tu negocio sale con un influencer conocido, sin coordinar grabaciones ni viajes.",
        "Cada video mantiene la identidad del influencer.",
        "Todo va por convenio y con su permiso."
      ],
      "necesitas": "Tu producto, tu oferta y el estilo de influencer que buscas.",
      "nota": "¿Eres influencer? Con el convenio tu imagen trabaja en más negocios: los ingresos son para ti y yo cobro un porcentaje por producir los videos.",
      "extraLink": [
        "Quiero sumarme al convenio",
        "Hola Tato, soy influencer y quiero sumarme al convenio."
      ],
      "wa": "Hola Tato, quiero un influencer conocido para mi negocio."
    },
    {
      "id": "vocero",
      "media": {
        "type": "img",
        "src": "/inicio/servicios/vocero.webp",
        "alt": "Presentadora habla a la cámara en un estudio pequeño"
      },
      "price": "S/ 510",
      "title": "Video vocero con IA",
      "desc": "Un presentador con IA explica tu negocio en 30 a 60 segundos, en español o en inglés. Para tu web, tus redes y tus anuncios.",
      "meta": "Entrega en 72 horas",
      "incluye": [
        "Guion de 30 a 60 segundos escrito contigo.",
        "Presentador con IA en español o en inglés.",
        "Formato vertical y horizontal, con subtítulos.",
        "Una ronda de cambios."
      ],
      "necesitas": "Qué haces, tu oferta y a quién le hablas.",
      "wa": "Hola Tato, quiero un video vocero con IA."
    },
    {
      "id": "anuncios",
      "media": {
        "type": "img",
        "src": "/inicio/servicios/anuncios.webp",
        "alt": "Cuatro celulares sobre una mesa con anuncios de ceviche, zapatillas, pisco sour y montañas"
      },
      "price": "S/ 330",
      "title": "Pack de anuncios con IA",
      "desc": "5 imágenes, 3 videos cortos y 5 textos listos para tus anuncios de Facebook e Instagram, con tu marca y tu oferta.",
      "meta": "Entrega en 48 horas",
      "incluye": [
        "5 imágenes en formato cuadrado y vertical.",
        "3 videos cortos de 6 a 15 segundos.",
        "5 textos con titular y llamada a la acción.",
        "Todo con tu logo, tus colores y tu oferta.",
        "Una ronda de cambios."
      ],
      "necesitas": "Tu logo, la oferta que quieres anunciar y, si tienes, 3 a 5 fotos de tu producto.",
      "nota": "No incluye manejar la campaña ni el presupuesto de anuncios.",
      "wa": "Hola Tato, quiero un pack de anuncios con IA."
    },
    {
      "id": "traducidos",
      "media": {
        "type": "img",
        "src": "/inicio/servicios/traducidos.webp",
        "alt": "Creador de contenido graba un video con su celular en un trípode"
      },
      "price": "desde S/ 170",
      "title": "Videos traducidos con tu voz",
      "desc": "Tu video en inglés o en español con tu propia voz. Llegas a clientes en dos idiomas sin grabar otra vez.",
      "meta": "Hasta 60 segundos, en 24 a 48 horas",
      "incluye": [
        "Tu video traducido al inglés o al español, con tu voz.",
        "Traducción revisada por una persona, no solo por la IA.",
        "Subtítulos en el nuevo idioma.",
        "Una ronda de ajustes."
      ],
      "necesitas": "Tu video original con el audio claro, sin música fuerte de fondo.",
      "nota": "Los videos más largos se cotizan por minuto.",
      "wa": "Hola Tato, quiero traducir un video con mi voz."
    },
    {
      "id": "logo",
      "media": {
        "type": "logo",
        "alt": "El logo de Tato Studio se arma en pantalla"
      },
      "price": "S/ 230",
      "title": "Logo animado",
      "desc": "Tu logo cobra vida como intro de marca para tus reels y videos.",
      "meta": "Entrega en 48 horas",
      "incluye": [
        "Animación de tu logo de 3 a 5 segundos, con sonido.",
        "Versión vertical para reels y horizontal para videos.",
        "Una ronda de cambios."
      ],
      "necesitas": "Tu logo en PNG o en vector.",
      "wa": "Hola Tato, quiero animar mi logo."
    },
    {
      "id": "revision",
      "media": {
        "type": "img",
        "src": "/inicio/servicios/revision.webp",
        "alt": "Mujer revisa gráficos de anuncios en su laptop de noche"
      },
      "price": "S/ 510",
      "title": "Revisión de anuncios en Meta",
      "desc": "Reviso tu cuenta de anuncios y te entrego los 5 arreglos que más plata te ahorran, con una llamada para explicártelos.",
      "meta": "Entrega en 48 horas",
      "incluye": [
        "Revisión de tus campañas, públicos, anuncios, píxel y presupuesto.",
        "Reporte con los 5 arreglos que más plata te ahorran, en orden.",
        "Llamada de 20 minutos para explicártelos."
      ],
      "necesitas": "Darme acceso de socio a tu cuenta publicitaria. Nunca te pido la contraseña.",
      "wa": "Hola Tato, quiero que revises mis anuncios de Meta."
    },
    {
      "id": "motor",
      "media": {
        "type": "svg",
        "name": "terminal",
        "alt": "Instrucciones al motor de video: subtitular, recortar y crear clips"
      },
      "price": "A cotizar",
      "title": "Motor de video con IA",
      "desc": "Mi propio motor para hacer videos en serie: subtitula, recorta y arma videos para redes. Lo conectas a tu web o a tu IA y le das instrucciones.",
      "incluye": [
        "Subtítulos con estilos replicados, como el editorial.",
        "Recorta lo mejor de tus videos y lo deja en vertical.",
        "Se conecta por MCP o por la API de tu web."
      ],
      "necesitas": "Tu web o tu herramienta de IA, y los videos o referencias con los que quieres trabajar.",
      "wa": "Hola Tato, quiero conectar tu motor de video con IA."
    }
  ],
  "mensual": [
    {
      "id": "respuesta",
      "media": {
        "type": "img",
        "src": "/inicio/servicios/respuesta.webp",
        "alt": "Vendedor de autos en Lima lee un mensaje nuevo en su celular al atardecer"
      },
      "price": "desde S/ 1,370 + S/ 510 al mes",
      "title": "Respuesta en 60 segundos",
      "desc": "Cada persona que llena tu anuncio recibe un WhatsApp al instante y un seguimiento automático. Ningún interesado se enfría.",
      "incluye": [
        "Un WhatsApp al instante para cada persona que llena el formulario de tu anuncio.",
        "Seguimiento automático a las 24 horas, a los 3 días y a los 7 días.",
        "Se detiene cuando la persona responde y te avisa a ti o a tu vendedor.",
        "Mensajes escritos para tu rubro: concesionarias, clínicas, inmobiliarias o restaurantes.",
        "La mensualidad cubre ajustes, revisión mensual y soporte."
      ],
      "necesitas": "Anuncios con formulario en Facebook o Instagram y una cuenta de Kommo a tu nombre.",
      "costo": "Kommo por usuario cada mes, más los mensajes de Meta, unos centavos cada uno.",
      "wa": "Hola Tato, quiero responder a mis interesados en 60 segundos."
    },
    {
      "id": "vuelven",
      "media": {
        "type": "img",
        "src": "/inicio/servicios/vuelven.webp",
        "alt": "Dueño de una panadería en Huaraz saluda a un cliente de siempre"
      },
      "price": "desde S/ 1,710",
      "title": "Clientes que vuelven",
      "desc": "Una campaña con IA por WhatsApp, SMS y correo para que tus clientes antiguos regresen.",
      "incluye": [
        "Ordeno tu lista de clientes antiguos.",
        "Campaña con IA por WhatsApp, SMS y correo, con una oferta para que vuelvan.",
        "Mensajes distintos según el tipo de cliente.",
        "Reporte de quién respondió y quién volvió."
      ],
      "necesitas": "Tu lista de clientes, solo de quienes aceptaron recibir mensajes.",
      "costo": "Los SMS y los mensajes de WhatsApp se pagan por envío, unos centavos cada uno.",
      "nota": "Opción mensual: una campaña nueva cada mes por S/ 680 al mes.",
      "wa": "Hola Tato, quiero que mis clientes antiguos vuelvan."
    },
    {
      "id": "contenido-mes",
      "media": {
        "type": "video",
        "src": "/inicio/clips/foodie.mp4",
        "poster": "/inicio/clips/foodie.jpg",
        "alt": "Tato prueba una hamburguesa para un video de Valdelomar, en Ica"
      },
      "price": "desde S/ 1,020 al mes",
      "title": "Contenido del mes listo",
      "desc": "12 a 20 publicaciones y reels al mes con tu marca, programados en Facebook e Instagram.",
      "incluye": [
        "El plan del mes contigo, en una llamada corta.",
        "12 a 20 publicaciones y reels hechos con IA, con tu marca.",
        "Textos y hashtags listos.",
        "Todo programado en Facebook e Instagram.",
        "Una ronda de cambios al mes y un reporte mensual."
      ],
      "necesitas": "Acceso a tu Meta Business y, si tienes, fotos o videos de tu negocio.",
      "nota": "Cancelas cuando quieras.",
      "wa": "Hola Tato, quiero mi contenido del mes listo."
    },
    {
      "id": "cobranza",
      "media": {
        "type": "img",
        "src": "/inicio/servicios/cobranza.webp",
        "alt": "Carpintero en su taller de Huaraz revisa un pago en su celular"
      },
      "price": "desde S/ 1,020 + S/ 170 al mes",
      "title": "Cobranza automática",
      "desc": "Recordatorios de pago automáticos con un link para pagar. Cobras sin perseguir a nadie.",
      "incluye": [
        "Links de pago con tu logo, para tarjeta o billetera digital.",
        "Recordatorios automáticos por correo y WhatsApp, antes y después del vencimiento.",
        "Aviso cuando te pagan.",
        "Una vista simple de quién te debe."
      ],
      "necesitas": "Una cuenta de pago en línea, como Mercado Pago, y tu lista de clientes.",
      "costo": "La comisión de la plataforma por cada pago. La mensualidad de S/ 170 cubre soporte y ajustes.",
      "wa": "Hola Tato, quiero cobrar sin perseguir a nadie."
    }
  ],
  "familia": [
    {
      "id": "memoria",
      "media": {
        "type": "svg",
        "name": "vela",
        "alt": "Un retrato enmarcado y una vela encendida"
      },
      "price": "desde S/ 79",
      "title": "Memoria Eterna: homenajes con IA",
      "desc": "Tu ser querido aparece en el cielo y le deja un mensaje especial a su familia. Listo para proyectar en quinceañeros, bodas, cumpleaños o misas de honras.",
      "incluye": [
        "Recuerdo, S/ 79: su foto cobra vida en el cielo, con su mensaje en pantalla y música. De 20 a 30 segundos.",
        "Mensaje del Cielo, S/ 149, el más pedido: le habla a su familia con un mensaje personalizado y voz. De 40 a 60 segundos, en versión para pantalla y para celular.",
        "Homenaje Completo, S/ 249: con una voz parecida a la suya si tienes audios, y más escenas con sus fotos y recuerdos. De 1 a 2 minutos.",
        "Entrega en 48 a 72 horas, o en 24 horas por S/ 30 más."
      ],
      "necesitas": "Sus fotos, el mensaje que quieres que llegue y la autorización por escrito de un familiar directo.",
      "nota": "Cada homenaje va rotulado como hecho con IA.",
      "wa": "Hola Tato, quiero información sobre un homenaje Memoria Eterna."
    },
    {
      "id": "personalizado",
      "media": {
        "type": "video",
        "src": "/inicio/clips/heroe.mp4",
        "poster": "/inicio/clips/heroe.jpg",
        "alt": "Tato se transforma en un héroe con armadura blanca, hecho con IA"
      },
      "price": "desde S/ 50",
      "title": "Tu video personalizado",
      "desc": "Tú, tu pareja o tu familia en un video con IA: una historia de amor con zombies, una transformación como la mía o la idea que tengas.",
      "incluye": [
        "Me mandas fotos claras y me cuentas la idea.",
        "Te lo entrego por WhatsApp, listo para subir a TikTok.",
        "Solo con permiso de las personas que salen."
      ],
      "necesitas": "Fotos claras de cada persona y su permiso.",
      "wa": "Hola Tato, quiero un video personalizado con IA."
    }
  ],
  "aprende": [
    {
      "id": "clases",
      "media": {
        "type": "svg",
        "name": "tickets",
        "alt": "Entradas para el taller en vivo, el pack de prompts y la clase 1:1"
      },
      "price": "desde S/ 29",
      "title": "Clases y talleres de IA",
      "desc": "Te enseño a hacer los videos que ves en mi TikTok, con mis prompts y paso a paso.",
      "incluye": [
        "Taller en vivo por Zoom: 2 horas, 20 cupos y grabación incluida. S/ 49.",
        "Pack de prompts Zombie Love: 12 prompts listos para Higgsfield y Seedance, con guía de ajustes. S/ 29.",
        "Clases 1:1 y talleres para equipos: a coordinar."
      ],
      "necesitas": "Una computadora y una cuenta en la herramienta que vamos a usar.",
      "nota": "Yo genero en Higgsfield. Si quieres probarlo, entra con mi link: es de afiliado, yo gano una comisión y tú no pagas más.",
      "affiliate": true,
      "wa": "Hola Tato, quiero aprender a hacer videos con IA."
    },
    {
      "id": "sesion",
      "media": {
        "type": "img",
        "src": "/inicio/servicios/sesion.webp",
        "alt": "Mujer arma una automatización en su laptop desde casa"
      },
      "price": "S/ 680",
      "title": "Sesión 1:1 de automatización",
      "desc": "Armamos juntos una automatización con IA en tus cuentas: interesados que llegan solos a una hoja, respuestas automáticas en Instagram o cotizaciones en 2 minutos.",
      "meta": "2 horas por videollamada",
      "incluye": [
        "2 horas en línea armando contigo una automatización en tus cuentas.",
        "Por ejemplo: cada interesado llega solo a una hoja de Google y te avisa, o una respuesta automática cuando comentan en Instagram.",
        "Si lo tuyo es contenido, te configuro Higgsfield en tu cuenta para fotos, videos y clips con IA.",
        "Guía de lo que armamos y 7 días para dudas."
      ],
      "necesitas": "Tus cuentas abiertas en la computadora. Nunca te pido contraseñas.",
      "costo": "Depende de la herramienta. Muchas tienen plan gratis.",
      "wa": "Hola Tato, quiero una sesión 1:1 de automatización."
    },
    {
      "id": "nara",
      "media": {
        "type": "svg",
        "name": "nara",
        "alt": "Ventana de Nara con la onda de voz y una conversación"
      },
      "price": "desde S/ 50",
      "title": "Nara, tu asistente en la PC",
      "desc": "Tu asistente todo en uno, con voz e IA, instalado en tu PC. Le hablas, hace lo que le pides y te repregunta para entenderte mejor.",
      "incluye": [
        "Básico, S/ 50: hace acciones en tu PC y conversa contigo.",
        "Avanzado, S/ 149: automatiza más cosas, como mover cámaras. Nube opcional por S/ 29 al mes.",
        "A medida, desde S/ 800: tu propio personaje asistente, con las tareas que necesites."
      ],
      "necesitas": "Una PC con Windows. Cuéntame qué equipo tienes y te digo qué paquete te conviene.",
      "wa": "Hola Tato, quiero a Nara, el asistente para la PC."
    }
  ]
};

export const precios: { grupo: string; seccion: 'oficina' | Seccion; filas: FilaPrecio[] }[] = [
  {
    "grupo": "Tu oficina con IA",
    "seccion": "oficina",
    "filas": [
      {
        "id": "oficina-aprende",
        "nombre": "Aprende a hacerlo: sesión de 2 horas",
        "precio": "desde S/ 680"
      },
      {
        "id": "oficina-por-ti",
        "nombre": "Lo hago por ti: correo, agenda y WhatsApp",
        "precio": "desde S/ 3,440"
      }
    ]
  },
  {
    "grupo": "Tu negocio en automático",
    "seccion": "automatico",
    "filas": [
      {
        "id": "correo",
        "nombre": "Correo ordenado con IA",
        "precio": "desde S/ 1,020"
      },
      {
        "id": "whatsapp",
        "nombre": "Asistente de WhatsApp con IA",
        "precio": "desde S/ 1,370"
      },
      {
        "id": "agenda",
        "nombre": "Agenda con cobro en línea",
        "precio": "desde S/ 680"
      },
      {
        "id": "resenas",
        "nombre": "Reseñas de Google con IA",
        "precio": "desde S/ 510"
      },
      {
        "id": "correos",
        "nombre": "Correos automáticos",
        "precio": "desde S/ 1,020"
      },
      {
        "id": "notas",
        "nombre": "Notas de reuniones con IA",
        "precio": "desde S/ 330"
      }
    ]
  },
  {
    "grupo": "Contenido y anuncios",
    "seccion": "contenido",
    "filas": [
      {
        "id": "influencer-ia",
        "nombre": "Influencer IA para tu marca",
        "precio": "desde S/ 499"
      },
      {
        "id": "influencers-peru",
        "nombre": "Influencers de talla nacional",
        "precio": "a cotizar"
      },
      {
        "id": "vocero",
        "nombre": "Video vocero con IA",
        "precio": "S/ 510"
      },
      {
        "id": "anuncios",
        "nombre": "Pack de anuncios con IA",
        "precio": "S/ 330"
      },
      {
        "id": "traducidos",
        "nombre": "Videos traducidos con tu voz",
        "precio": "desde S/ 170"
      },
      {
        "id": "logo",
        "nombre": "Logo animado",
        "precio": "S/ 230"
      },
      {
        "id": "revision",
        "nombre": "Revisión de anuncios en Meta",
        "precio": "S/ 510"
      },
      {
        "id": "motor",
        "nombre": "Motor de video con IA",
        "precio": "a cotizar"
      }
    ]
  },
  {
    "grupo": "Cada mes",
    "seccion": "mensual",
    "filas": [
      {
        "id": "respuesta",
        "nombre": "Respuesta en 60 segundos",
        "precio": "desde S/ 1,370 + S/ 510 al mes"
      },
      {
        "id": "vuelven",
        "nombre": "Clientes que vuelven",
        "precio": "desde S/ 1,710"
      },
      {
        "id": "contenido-mes",
        "nombre": "Contenido del mes listo",
        "precio": "desde S/ 1,020 al mes"
      },
      {
        "id": "cobranza",
        "nombre": "Cobranza automática",
        "precio": "desde S/ 1,020 + S/ 170 al mes"
      }
    ]
  },
  {
    "grupo": "Para tu familia",
    "seccion": "familia",
    "filas": [
      {
        "id": "recuerdo",
        "nombre": "Homenaje Recuerdo",
        "precio": "S/ 79",
        "permiso": "familia"
      },
      {
        "id": "mensaje-cielo",
        "nombre": "Homenaje Mensaje del Cielo",
        "precio": "S/ 149",
        "permiso": "familia"
      },
      {
        "id": "homenaje-completo",
        "nombre": "Homenaje Completo",
        "precio": "S/ 249",
        "permiso": "familia"
      },
      {
        "id": "urgente",
        "nombre": "Homenaje en 24 horas",
        "precio": "+ S/ 30",
        "permiso": "familia"
      },
      {
        "id": "memoria-plena",
        "nombre": "Memoria Plena, con cuadro digital",
        "precio": "S/ 899",
        "permiso": "familia"
      },
      {
        "id": "personalizado",
        "nombre": "Video personalizado",
        "precio": "desde S/ 50",
        "permiso": "personas"
      }
    ]
  },
  {
    "grupo": "Aprende",
    "seccion": "aprende",
    "filas": [
      {
        "id": "taller",
        "nombre": "Taller en vivo por Zoom",
        "precio": "S/ 49"
      },
      {
        "id": "pack",
        "nombre": "Pack de prompts Zombie Love",
        "precio": "S/ 29"
      },
      {
        "id": "clase",
        "nombre": "Clase 1:1 o taller para equipos",
        "precio": "a coordinar"
      },
      {
        "id": "sesion",
        "nombre": "Sesión 1:1 de automatización",
        "precio": "S/ 680"
      },
      {
        "id": "nara-basico",
        "nombre": "Nara Básico",
        "precio": "S/ 50"
      },
      {
        "id": "nara-avanzado",
        "nombre": "Nara Avanzado",
        "precio": "S/ 149"
      },
      {
        "id": "nara-medida",
        "nombre": "Nara a medida",
        "precio": "desde S/ 800"
      }
    ]
  }
];

/** El precio más bajo de una sección, como sale en la tabla ("S/ 330"). Ignora extras ("+ S/ 30") y lo que se cotiza. */
export function desde(seccion: 'oficina' | Seccion): string {
  const nums = (precios.find((g) => g.seccion === seccion)?.filas ?? [])
    .filter((f) => !f.precio.trim().startsWith('+'))
    .map((f) => f.precio.match(/S\/\s*([\d,]+)/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => Number(m[1].replace(/,/g, '')));
  if (!nums.length) throw new Error(`Sin precios para ${seccion}`);
  return 'S/ ' + Math.min(...nums).toLocaleString('en-US');
}
