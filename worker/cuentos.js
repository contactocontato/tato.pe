// Cuentos para grabar la voz del influencer: un texto de un minuto leído en voz alta, más un código de
// tres números al final. El código cambia cada vez, así la grabación tiene que ser nueva (no sirve un audio viejo).
// Si existe ANTHROPIC_API_KEY, el cuento se escribe con IA sobre un tema al azar; si no, se elige uno de estos.

const MODELO = 'claude-haiku-5-5';
const NUMEROS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];

const TEMAS = [
  'un mercado de Huaraz al amanecer', 'una llama que quería conocer el mar', 'un tren que cruza la sierra',
  'una cocinera de Ica y su receta secreta', 'una noche de estrellas en Paracas', 'un perro que cuidaba un faro',
  'la fiesta patronal de un pueblo andino', 'un taxista de Lima y un pasajero misterioso', 'una niña que coleccionaba sonidos',
  'un colibrí y una flor de cantuta', 'una bicicleta que aprendió a subir cerros', 'un abuelo que tejía historias en un telar',
  'una lancha en el lago Titicaca', 'un panadero que se quedó dormido', 'una carrera de caballitos de totora',
  'una tormenta en la selva y un loro valiente', 'un concurso de cebiche en la playa', 'un reloj de la plaza que se adelantaba',
];

// Cuentos propios, de unos 160 palabras cada uno, para cuando no hay IA.
const CUENTOS = [
  {
    titulo: 'La llama que quería ver el mar',
    texto: 'En lo alto de la cordillera vivía una llama llamada Chaska, que soñaba con ver el mar. Cada mañana les preguntaba a las nubes: «¿De qué color es el agua salada?». Las nubes, risueñas, nunca respondían. Un día de junio, Chaska bajó por el camino de piedras, cruzó tres ríos y durmió bajo un molle enorme. En el valle conoció a un arriero que tocaba la quena y que le regaló un poncho rojo. «Sigue al viento tibio», le dijo, «él siempre va hacia la costa». Chaska caminó once días y once noches, comiendo ichu y espantando zorros traviesos. Cuando por fin escuchó un rugido lejano, corrió con el corazón acelerado. ¡Ahí estaba! Un mar inmenso, gris y azul, que brillaba como un espejo recién lavado. Chaska metió las patas en la espuma, estornudó con la sal y se rio como nunca. Esa tarde entendió que algunos sueños se ven mejor con los pies mojados.',
  },
  {
    titulo: 'El taxista y la cometa',
    texto: 'Era jueves, llovía en Lima y el tráfico parecía una serpiente dormida. Don Rubén, taxista desde hacía veinte años, recogió a una señora con una maleta enorme. «¿Al aeropuerto?», preguntó. «No, joven, a la playa», respondió ella, muy seria. En pleno invierno, la playa estaba vacía, con gaviotas peleando por un pan. La señora abrió la maleta y sacó una cometa amarilla, larguísima, con cintas de colores. «Mi nieto la hizo antes de mudarse a Chiclayo», explicó. «Me pidió que la hiciera volar el día de su cumpleaños». Rubén estacionó, se quitó los zapatos y la ayudó a correr contra el viento. Tres intentos fallaron, pero al cuarto la cometa subió, subió y se quedó bailando sobre las olas. La señora grabó un video y se lo mandó al niño. Cuando volvieron al taxi, Rubén apagó el taxímetro. «Este viaje», dijo sonriendo, «ya me lo pagaron».',
  },
  {
    titulo: 'El secreto de doña Rosario',
    texto: 'En una casa de adobe, cerca de las dunas de Ica, doña Rosario preparaba la mejor carapulcra del pueblo. Todos querían saber su secreto. El panadero sospechaba del maní; la vecina juraba que era el ají panca; el alcalde apostaba por la papa seca del año pasado. Una tarde llegó desde Arequipa un joven cocinero con una libreta y muchas preguntas. «¿Cuántos minutos la tuesta? ¿Qué cuchara usa? ¿La mueve hacia la derecha o hacia la izquierda?». Doña Rosario lo dejó mirar todo, sin esconder nada. El cocinero anotó cada detalle, regresó a su cocina y lo repitió paso por paso. Sin embargo, su carapulcra no sabía igual. Confundido, volvió a buscarla. Ella le sirvió un plato humeante, se sentó a su lado y le contó historias de su familia hasta que oscureció. Entonces él entendió que el ingrediente secreto era la compañía.',
  },
  {
    titulo: 'El tren de las siete',
    texto: 'El tren salía a las siete en punto, aunque nadie recordaba un día en que hubiera salido a tiempo. Ese martes, sin embargo, el maquinista Ernesto tocó el silbato exactamente a las siete. ¡Qué sorpresa! Los pasajeros corrieron con bolsas de choclo, jaulas de cuyes y una guitarra sin dos cuerdas. Por la ventana pasaban cerros verdes, lagunas quietas y casitas con techos de calamina. En el vagón cuatro, una niña llamada Luz contaba los túneles en voz alta: «uno, dos, tres». Al llegar al túnel número veinte, el tren se detuvo de golpe. Un rebaño de ovejas dormía tranquilamente sobre los rieles. Ernesto bajó, se rascó la cabeza y empezó a cantar un huayno. Las ovejas levantaron las orejas, se pusieron de pie y se alejaron bailando. Los pasajeros aplaudieron. Esa tarde, por primera vez en años, el tren llegó tarde por una buena razón.',
  },
  {
    titulo: 'Chispa, el faro que ladra',
    texto: 'En un rincón de Paracas había un faro viejo y un perro llamado Chispa que lo cuidaba. Cada noche, cuando la luz giraba, Chispa ladraba tres veces, como si saludara a los barcos. El guardián del faro, un señor de barba blanca, le decía: «Tranquilo, compañero, los pescadores ya nos ven». Una madrugada de neblina espesa, la luz se apagó por una falla eléctrica. El mar estaba oscuro y un bote pequeño se acercaba demasiado a las rocas. Chispa subió los ciento doce escalones, se paró en la baranda y ladró con todas sus fuerzas. Los pescadores escucharon el ladrido, giraron el timón y llegaron sanos a la orilla. Al día siguiente le llevaron pescado fresco, una pelota nueva y un collar con una medalla dorada. En la medalla, alguien había escrito con letra torcida: «Chispa, el faro que ladra».',
  },
  {
    titulo: 'La coleccionista de sonidos',
    texto: 'Ximena tenía una grabadora rosada y una costumbre extraña: coleccionaba sonidos. Grababa la lluvia sobre el techo, el silbido de la tetera y el ronquido de su abuelo después del almuerzo. En su cuaderno anotaba la fecha, el lugar y una palabra para cada sonido: crujiente, tímido, gigante. Un domingo fue al mercado con su mamá y descubrió un tesoro: el grito del vendedor de choclos, el chisporroteo de la sartén y las risas de dos señoras que regateaban por un zapallo. Volvió a casa feliz, con la grabadora llena. Esa noche, su abuelo estaba triste porque extrañaba su pueblo en Cajamarca. Ximena buscó en su colección, eligió el canto de un gallo, el ruido de un río y una banda de músicos, y los hizo sonar juntos. El abuelo cerró los ojos, sonrió despacito y dijo: «¡Así suena mi casa!».',
  },
  {
    titulo: 'El colibrí y la cantuta',
    texto: 'En un jardín de Huaraz, entre rosas y geranios, crecía una cantuta roja que nadie miraba. Las abejas preferían el romero y las mariposas se quedaban en la buganvilla. «¿Será que no soy bonita?», se preguntaba la flor, inclinando sus campanitas. Una mañana fría llegó un colibrí verde, rápido como un suspiro, que zumbaba buscando algo especial. Probó una rosa, pero era muy perfumada; probó un clavel, pero era muy pequeño. Al final se detuvo frente a la cantuta, hundió su pico largo y se quedó feliz. «¡Por fin! Tu néctar es justo lo que necesitaba para cruzar la montaña», dijo agitando las alas. Desde ese día, el colibrí volvió cada amanecer, y detrás de él llegaron otros tres. La cantuta entendió que no tenía que parecerse a nadie: solo tenía que esperar a quien la buscara a ella.',
  },
  {
    titulo: 'Cien luces en la plaza',
    texto: 'Faltaba una semana para la fiesta patronal y el pueblo entero estaba de cabeza. Los músicos ensayaban en la plaza, las señoras cocinaban chicharrón en ollas enormes y los niños pintaban banderines de colores. Solo había un problema: el castillo de fuegos artificiales no había llegado. El encargado, don Felipe, caminaba de un lado a otro, preocupado. «¿Qué será de nuestra fiesta sin luces?», repetía. Entonces Rocío, la hija del carpintero, tuvo una idea brillante. Juntó a sus amigos y recogieron linternas, velas en frascos de vidrio y faroles de papel. El sábado por la noche, cuando la banda empezó a tocar, todos encendieron sus luces al mismo tiempo. La plaza se llenó de estrellas pequeñas que bailaban con la música. Nadie extrañó los cohetes. Y desde ese año, la fiesta se celebra así: con cien luces que se encienden juntas.',
  },
];

const azar = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const palabras = (t) => t.split(/\s+/).filter(Boolean).length;

async function conIA(env, tema) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 700,
        system: 'Escribes cuentos breves y originales para que una persona los lea en voz alta y así grabar una muestra clara de su voz.',
        messages: [{
          role: 'user',
          content: `Escribe un cuento original en español del Perú, de 150 a 170 palabras, para leer en voz alta en un minuto. Tema: ${tema}. Usa frases de distinto largo, al menos una pregunta, una exclamación y un diálogo corto, números escritos en letras y palabras con sonidos variados (rr, ñ, ll, ch, j). Sin personas reales, marcas, política ni violencia; apto para todo público. Responde solo con el título en la primera línea y el cuento debajo, sin comillas ni formato.`,
        }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const lineas = String(data?.content?.[0]?.text || '').replace(/[*#_`]/g, '').trim().split('\n').map((l) => l.trim()).filter(Boolean);
    if (lineas.length < 2) return null;
    const titulo = lineas[0].replace(/^["«“]|["»”]$/g, '').slice(0, 80);
    const texto = lineas.slice(1).join(' ');
    const n = palabras(texto);
    return n >= 110 && n <= 240 ? { titulo, texto } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Un cuento nuevo con su código: { titulo, texto, codigo, codigoEnLetras, porIA, generado }. */
export async function cuentoAlAzar(env) {
  const tema = TEMAS[azar(TEMAS.length)];
  let cuento = env.ANTHROPIC_API_KEY ? await conIA(env, tema) : null;
  const porIA = Boolean(cuento);
  if (!cuento) cuento = CUENTOS[azar(CUENTOS.length)];
  const cifras = [0, 0, 0].map(() => 1 + azar(9));
  return {
    titulo: cuento.titulo,
    texto: cuento.texto,
    codigo: cifras.join(''),
    codigoEnLetras: cifras.map((n) => NUMEROS[n]).join(', '),
    porIA,
    generado: new Date().toISOString(),
  };
}

export const CUENTOS_PROPIOS = CUENTOS;
