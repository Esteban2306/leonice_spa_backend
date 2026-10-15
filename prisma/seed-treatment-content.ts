import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { CATALOG_CACHE_KEYS } from '../src/catalog/constants/catalog-cache.constants';

interface StepContent {
  title: string;
  description: string;
}

interface TreatmentContent {
  slug: string;
  displayOrder: number;
  tagline: string;
  summary: string;
  idealFor: string[];
  benefits: string[];
  results: string;
  aftercare: string[];
  considerations: string[];
  recommendedFrequency: string | null;
  steps: StepContent[];
}

interface CategoryContent {
  slug: string;
  displayOrder: number;
  showOnWebsite: boolean;
  iconKey: string | null;
  tagline: string | null;
  description: string | null;
  treatments: TreatmentContent[];
}

const DIAGNOSIS_STEP: StepContent = {
  title: 'Diagnóstico capilar',
  description:
    'Observamos tu cuero cabelludo y la fibra de tu cabello, conversamos sobre tu rutina y los procesos químicos que has tenido para ajustar el tratamiento a lo que de verdad necesitas.',
};

const FINISH_STEP: StepContent = {
  title: 'Secado y acabado',
  description:
    'Secamos y damos forma a tu cabello para que salgas con el resultado a la vista, y te explicamos cómo mantenerlo en casa.',
};

const HAIR_AFTERCARE = [
  'Usa shampoo sin sulfatos para no arrastrar los activos del tratamiento.',
  'Aplica protector térmico antes de secador o plancha.',
  'Cuéntanos en tu próxima visita cómo respondió tu cabello para ajustar el plan.',
];

const CONTENT: CategoryContent[] = [
  {
    slug: 'spa-capilar',
    displayOrder: 0,
    showOnWebsite: true,
    iconKey: 'droplets',
    tagline: 'Terapias que devuelven agua, nutrición y fuerza a tu cabello.',
    description:
      'Cada terapia empieza con un diagnóstico de tu cuero cabelludo y tu fibra capilar. Así elegimos qué necesita tu cabello hoy: agua, aceites, proteína o un sellado que lo proteja.',
    treatments: [
      {
        slug: 'terapia-de-hidratacion',
        displayOrder: 1,
        tagline: 'Agua para un cabello opaco, áspero y con frizz.',
        summary:
          'Hidratar es reponer el agua que tu cabello pierde a diario con el lavado, el sol y el calor. Trabajamos con activos humectantes que ayudan a la fibra a retener agua, para que recupere suavidad, movimiento y brillo.',
        idealFor: [
          'Cabello opaco o áspero al tacto',
          'Frizz que aparece con la humedad',
          'Cabello que se enreda con facilidad',
        ],
        benefits: [
          'Suavidad que se siente desde el primer lavado',
          'Menos frizz y más movimiento',
          'Brillo natural sin sensación grasa',
        ],
        results:
          'Sales con un cabello más suave, manejable y luminoso. La hidratación se mantiene mejor cuando la acompañas con los cuidados en casa y la alternas con nutrición según tu diagnóstico.',
        aftercare: HAIR_AFTERCARE,
        considerations: [],
        recommendedFrequency:
          'Suele integrarse en un plan que alterna hidratación y nutrición; la frecuencia la definimos en tu diagnóstico.',
        steps: [
          DIAGNOSIS_STEP,
          {
            title: 'Lavado suave',
            description:
              'Limpiamos cuero cabelludo y largos con un shampoo suave que retira residuos sin resecar.',
          },
          {
            title: 'Mascarilla hidratante',
            description:
              'Aplicamos la mascarilla por secciones, de medios a puntas, con activos humectantes que atraen y retienen agua en la fibra.',
          },
          {
            title: 'Tiempo de acción con calor',
            description:
              'Dejamos actuar el tratamiento con calor suave para que los activos penetren mejor mientras te relajas.',
          },
          {
            title: 'Enjuague y sellado',
            description:
              'Retiramos el producto y cerramos la cutícula para que el agua se quede dentro de la fibra.',
          },
          FINISH_STEP,
        ],
      },
      {
        slug: 'terapia-de-nutricion',
        displayOrder: 2,
        tagline: 'Aceites que sellan y protegen medios y puntas.',
        summary:
          'Nutrir es reponer los lípidos que protegen la fibra. Con aceites y mantecas vegetales ayudamos a alinear la cutícula y reducir la porosidad, para que tu cabello se vea más denso, sedoso y protegido.',
        idealFor: [
          'Puntas resecas o abiertas',
          'Cabello poroso por sol, calor o químicos',
          'Cabello que pierde el brillo rápido después del lavado',
        ],
        benefits: [
          'Puntas más selladas y suaves',
          'Menos porosidad y más protección',
          'Brillo profundo y caída sedosa',
        ],
        results:
          'Tu cabello se siente suelto, sedoso y con puntas más cuidadas. Es el complemento natural de la hidratación.',
        aftercare: HAIR_AFTERCARE,
        considerations: [],
        recommendedFrequency:
          'Se alterna con hidratación según lo que muestre tu cabello en cada visita.',
        steps: [
          DIAGNOSIS_STEP,
          {
            title: 'Lavado suave',
            description:
              'Preparamos el cabello con un lavado que limpia sin retirar los aceites naturales del cuero cabelludo.',
          },
          {
            title: 'Aplicación nutritiva',
            description:
              'Distribuimos aceites y mantecas vegetales mechón por mechón, con énfasis en medios y puntas.',
          },
          {
            title: 'Masaje y tiempo de acción',
            description:
              'Masajeamos para repartir el producto y lo dejamos actuar con calor para potenciar la absorción.',
          },
          {
            title: 'Enjuague y sellado',
            description:
              'Retiramos el exceso y sellamos la cutícula para que la fibra conserve los lípidos.',
          },
          FINISH_STEP,
        ],
      },
      {
        slug: 'terapia-de-reparacion',
        displayOrder: 3,
        tagline: 'Fuerza para un cabello que se rompe y pierde forma.',
        summary:
          'Cuando la fibra está debilitada por procesos químicos, decoloración o calor, necesita proteína. La terapia de reparación aporta proteínas y aminoácidos que devuelven cuerpo y resistencia, siempre equilibrados con hidratación para no endurecer el cabello.',
        idealFor: [
          'Cabello que se quiebra al peinarlo',
          'Cabello decolorado o con varios procesos químicos',
          'Mechones elásticos o sin forma cuando están húmedos',
        ],
        benefits: [
          'Más resistencia y menos quiebre',
          'Cuerpo y firmeza en la fibra',
          'Mejor respuesta a los siguientes tratamientos',
        ],
        results:
          'El cabello se siente más firme y resistente. La recuperación de un cabello muy dañado es gradual, por eso te proponemos un plan y revisamos tu evolución en cada sesión.',
        aftercare: [
          ...HAIR_AFTERCARE,
          'Evita nuevos procesos químicos hasta que lo revisemos juntas.',
        ],
        considerations: [
          'Requiere valoración previa: según el estado de tu cabello ajustamos los activos y el precio.',
        ],
        recommendedFrequency:
          'Se programa como un plan de varias sesiones según el nivel de daño.',
        steps: [
          DIAGNOSIS_STEP,
          {
            title: 'Limpieza preparatoria',
            description:
              'Retiramos residuos para que la fibra quede lista para recibir la proteína.',
          },
          {
            title: 'Reconstrucción con proteína',
            description:
              'Aplicamos proteínas y aminoácidos por secciones para reforzar la estructura interna del cabello.',
          },
          {
            title: 'Equilibrio con hidratación',
            description:
              'Compensamos con activos hidratantes para que el cabello quede fuerte y a la vez flexible.',
          },
          {
            title: 'Sellado',
            description:
              'Cerramos la cutícula para fijar el tratamiento dentro de la fibra.',
          },
          FINISH_STEP,
        ],
      },
      {
        slug: 'terapia-de-rehabilitacion',
        displayOrder: 4,
        tagline: 'Un plan intensivo para cabello muy comprometido.',
        summary:
          'La rehabilitación combina en una misma sesión reconstrucción, hidratación y nutrición para cabellos que acumulan mucho daño. Es nuestra terapia más completa y la pensamos como el inicio de un proceso de recuperación.',
        idealFor: [
          'Cabello con daño acumulado por años de químicos',
          'Cabello que no responde a tratamientos sencillos',
          'Quien quiere recuperar su cabello antes de un nuevo cambio',
        ],
        benefits: [
          'Trabaja fuerza, agua y lípidos en una sola visita',
          'Cabello más manejable desde la primera sesión',
          'Base sana para continuar con un plan de cuidado',
        ],
        results:
          'Notas un cabello más suave, fuerte y fácil de peinar. Por la profundidad del daño, la mejora es progresiva y la acompañamos con seguimiento.',
        aftercare: [
          ...HAIR_AFTERCARE,
          'Evita nuevos procesos químicos mientras avanzamos en el plan.',
        ],
        considerations: [],
        recommendedFrequency:
          'Se plantea como el inicio de un plan; la frecuencia la definimos según tu evolución.',
        steps: [
          DIAGNOSIS_STEP,
          {
            title: 'Limpieza profunda',
            description:
              'Retiramos residuos de productos y siliconas para que los activos lleguen a la fibra.',
          },
          {
            title: 'Reconstrucción',
            description:
              'Reforzamos la estructura con proteína en las zonas más debilitadas.',
          },
          {
            title: 'Hidratación y nutrición',
            description:
              'Devolvemos agua y aceites a la fibra para que recupere elasticidad y suavidad.',
          },
          {
            title: 'Sellado con calor',
            description:
              'Sellamos la cutícula con calor controlado para fijar todo lo aplicado.',
          },
          FINISH_STEP,
        ],
      },
      {
        slug: 'terapia-antiacida',
        displayOrder: 5,
        tagline: 'Equilibrio de pH para una cutícula cerrada y brillante.',
        summary:
          'El cabello sano es naturalmente ácido. Tintes, alisados y algunos shampoos lo vuelven alcalino y abren la cutícula, lo que deja la fibra porosa y opaca. Esta terapia trabaja con activos de pH ácido que ayudan a cerrar la cutícula y fijar el brillo.',
        idealFor: [
          'Cabello teñido o con alisado',
          'Cabello poroso que pierde el color rápido',
          'Frizz y falta de brillo después de procesos químicos',
        ],
        benefits: [
          'Cutícula más cerrada y uniforme',
          'Brillo y suavidad visibles',
          'Ayuda a conservar color y tratamientos previos',
        ],
        results:
          'El cabello refleja más luz, se siente liso al tacto y el color se ve más vivo.',
        aftercare: HAIR_AFTERCARE,
        considerations: [],
        recommendedFrequency: null,
        steps: [
          DIAGNOSIS_STEP,
          {
            title: 'Lavado',
            description:
              'Limpiamos el cabello para preparar la fibra a recibir el tratamiento.',
          },
          {
            title: 'Aplicación ácida',
            description:
              'Aplicamos el tratamiento de pH ácido de medios a puntas, de forma uniforme.',
          },
          {
            title: 'Tiempo de acción',
            description:
              'Dejamos actuar para que la cutícula se cierre y la fibra recupere su equilibrio.',
          },
          {
            title: 'Enjuague y mascarilla',
            description:
              'Retiramos el producto y finalizamos con una mascarilla que suaviza.',
          },
          FINISH_STEP,
        ],
      },
      {
        slug: 'termopurificacion',
        displayOrder: 6,
        tagline: 'Limpieza profunda del cuero cabelludo con calor y vapor.',
        summary:
          'Un cuero cabelludo limpio es la base de un cabello sano. En la termopurificación usamos calor y vapor para abrir los poros y retirar el exceso de grasa, residuos de productos y células muertas que se acumulan y que un lavado en casa no alcanza a remover.',
        idealFor: [
          'Cuero cabelludo graso o con acumulación de productos',
          'Sensación de pesadez o picor en la raíz',
          'Quien usa mucho producto de peinado',
        ],
        benefits: [
          'Cuero cabelludo limpio y fresco',
          'Raíz más ligera y con volumen',
          'Mejor absorción de los tratamientos posteriores',
        ],
        results:
          'Sientes la cabeza ligera y fresca, con una raíz suelta y un cabello que se ve limpio por más tiempo.',
        aftercare: [
          'Evita productos pesados en la raíz los días siguientes.',
          'Lava con agua tibia, no caliente.',
          'Cuéntanos si notas cambios en grasa o picor para ajustar el plan.',
        ],
        considerations: [
          'Si tienes una afección del cuero cabelludo diagnosticada, consúltalo antes con tu dermatólogo.',
        ],
        recommendedFrequency: null,
        steps: [
          {
            title: 'Diagnóstico del cuero cabelludo',
            description:
              'Revisamos tu cuero cabelludo para identificar grasa, residuos o sensibilidad.',
          },
          {
            title: 'Vapor',
            description:
              'Aplicamos vapor para abrir los poros y ablandar los residuos acumulados.',
          },
          {
            title: 'Exfoliación suave',
            description:
              'Retiramos células muertas y acumulación de producto con movimientos suaves.',
          },
          {
            title: 'Lavado purificante',
            description:
              'Lavamos con un shampoo purificante y masajeamos para activar la circulación.',
          },
          {
            title: 'Tratamiento equilibrante',
            description:
              'Aplicamos un tratamiento que calma y equilibra el cuero cabelludo.',
          },
          FINISH_STEP,
        ],
      },
      {
        slug: 'terapia-de-control',
        displayOrder: 7,
        tagline: 'Equilibrio para un cuero cabelludo con grasa o descamación.',
        summary:
          'La terapia de control se enfoca en el cuero cabelludo: ayuda a regular el exceso de grasa y la descamación para que tu cabello luzca limpio por más tiempo y la raíz se sienta cómoda.',
        idealFor: [
          'Raíz que se engrasa rápido',
          'Descamación o caspa leve',
          'Cuero cabelludo con picor o incomodidad',
        ],
        benefits: [
          'Raíz más limpia por más tiempo',
          'Cuero cabelludo más calmado',
          'Cabello con más volumen desde la raíz',
        ],
        results:
          'Notas una raíz más ligera y un cuero cabelludo cómodo. Los cambios en la producción de grasa se ven con constancia y buenos hábitos en casa.',
        aftercare: [
          'Evita lavar con agua muy caliente.',
          'No apliques acondicionador ni aceites en la raíz.',
          'Mantén cepillos y fundas de almohada limpios.',
        ],
        considerations: [
          'Si la caspa o la grasa persisten o hay enrojecimiento, te recomendamos una valoración dermatológica.',
        ],
        recommendedFrequency:
          'Funciona mejor como plan de varias sesiones que definimos en tu diagnóstico.',
        steps: [
          {
            title: 'Diagnóstico del cuero cabelludo',
            description:
              'Identificamos el tipo de desequilibrio: exceso de grasa, descamación o sensibilidad.',
          },
          {
            title: 'Limpieza específica',
            description:
              'Lavamos con un shampoo de control elegido según tu diagnóstico.',
          },
          {
            title: 'Tratamiento de cuero cabelludo',
            description:
              'Aplicamos activos que ayudan a regular la grasa y calmar la descamación.',
          },
          {
            title: 'Masaje',
            description:
              'Masajeamos el cuero cabelludo para activar la circulación y repartir el tratamiento.',
          },
          FINISH_STEP,
        ],
      },
      {
        slug: 'terapia-kiss',
        displayOrder: 8,
        tagline: 'Una terapia personalizada a partir de tu diagnóstico.',
        summary:
          'La terapia kiss es un tratamiento de la casa que ajustamos a tu cabello después de valorarlo. Combinamos los activos que tu fibra necesita para devolverle suavidad, brillo y manejabilidad.',
        idealFor: [
          'Quien busca un tratamiento a la medida',
          'Cabello con varias necesidades a la vez',
        ],
        benefits: [
          'Tratamiento ajustado a tu cabello',
          'Suavidad y brillo visibles',
        ],
        results:
          'Sales con un cabello suave y luminoso. En la valoración te contamos qué resultado esperar en tu caso.',
        aftercare: HAIR_AFTERCARE,
        considerations: [
          'Requiere valoración previa: el precio final depende del estado y largo de tu cabello.',
        ],
        recommendedFrequency: null,
        steps: [
          DIAGNOSIS_STEP,
          {
            title: 'Lavado',
            description:
              'Preparamos tu cabello con un lavado adecuado a tu tipo de fibra.',
          },
          {
            title: 'Tratamiento personalizado',
            description:
              'Aplicamos la combinación de activos que definimos en tu diagnóstico.',
          },
          {
            title: 'Sellado',
            description:
              'Sellamos para fijar el tratamiento y potenciar el brillo.',
          },
          FINISH_STEP,
        ],
      },
      {
        slug: 'terapia-bano-de-color',
        displayOrder: 9,
        tagline:
          'Brillo e intensidad para tu tono, sin el compromiso de un tinte.',
        summary:
          'El baño de color deposita pigmento sobre la fibra para realzar tu tono natural o revivir un color que se ha apagado. Su fórmula es más suave que la de un tinte permanente y se va desvaneciendo de forma gradual con los lavados, sin dejar una raíz marcada.',
        idealFor: [
          'Color apagado o con reflejos no deseados',
          'Quien quiere más brillo e intensidad en su tono',
          'Canas leves que quieres disimular sin un tinte permanente',
        ],
        benefits: [
          'Color más vivo y uniforme',
          'Brillo inmediato',
          'Se desvanece de forma gradual, sin raíz marcada',
        ],
        results:
          'Tu tono se ve más intenso y luminoso. El efecto es temporal: se va suavizando con los lavados, más rápido si lavas a diario.',
        aftercare: [
          'Usa shampoo sin sulfatos y para cabello con color.',
          'Lava con agua tibia o fría para que el pigmento dure más.',
          'Protege tu cabello del sol y del cloro.',
        ],
        considerations: [
          'Si buscas cubrir canas por completo o un cambio de color drástico, te orientamos en el diagnóstico hacia otra alternativa.',
        ],
        recommendedFrequency: null,
        steps: [
          {
            title: 'Diagnóstico de color',
            description:
              'Revisamos tu tono actual y lo que quieres lograr para elegir el pigmento adecuado.',
          },
          {
            title: 'Lavado',
            description:
              'Preparamos la fibra para que el color se deposite de forma pareja.',
          },
          {
            title: 'Aplicación del baño de color',
            description:
              'Aplicamos el color por secciones, de raíz a puntas o donde lo necesites.',
          },
          {
            title: 'Tiempo de pose',
            description:
              'Dejamos actuar el pigmento el tiempo que pide tu cabello.',
          },
          {
            title: 'Enjuague y sellado',
            description:
              'Retiramos y sellamos la cutícula para fijar el color y el brillo.',
          },
          FINISH_STEP,
        ],
      },
      {
        slug: 'alisado',
        displayOrder: 10,
        tagline: 'Cabello liso, sin frizz y más fácil de llevar.',
        summary:
          'El alisado modifica temporalmente la forma de la fibra para reducir el frizz, el volumen y las ondas. Es un proceso con calor y producto profesional, por eso empezamos siempre valorando tu cabello: su historia química y su estado definen la fórmula y el resultado posible.',
        idealFor: [
          'Frizz y volumen difíciles de controlar',
          'Quien quiere ahorrar tiempo en el peinado diario',
          'Cabello con ondas que prefiere llevar liso',
        ],
        benefits: [
          'Menos frizz y volumen',
          'Peinado diario más rápido',
          'Cabello brillante y con caída',
        ],
        results:
          'Tu cabello queda liso, brillante y manejable. La duración depende de tu tipo de cabello y de los cuidados en casa, por eso te entregamos una rutina de mantenimiento.',
        aftercare: [
          'Respeta el tiempo antes del primer lavado que te indiquemos.',
          'Usa shampoo sin sulfatos ni sal para prolongar el alisado.',
          'Evita recogidos tensos y marcas de ganchos los primeros días.',
          'Complementa con una terapia de postalisado para mantener la fibra cuidada.',
        ],
        considerations: [
          'Requiere valoración previa: el precio final depende del largo y del estado de tu cabello.',
          'Si tienes un proceso químico reciente, lo revisamos antes de alisar.',
        ],
        recommendedFrequency: null,
        steps: [
          {
            title: 'Valoración del cabello',
            description:
              'Revisamos tu historial químico, el grosor y la resistencia de la fibra para elegir la fórmula y confirmar que tu cabello está listo.',
          },
          {
            title: 'Lavado profundo',
            description:
              'Lavamos con un shampoo antirresiduos que abre la cutícula para que el producto penetre de forma pareja.',
          },
          {
            title: 'Aplicación por mechones',
            description:
              'Aplicamos el producto mechón por mechón, con cuidado en la raíz y en las zonas más sensibilizadas.',
          },
          {
            title: 'Tiempo de acción',
            description:
              'Dejamos actuar el tiempo que indica el producto según la textura de tu cabello.',
          },
          {
            title: 'Secado y sellado con plancha',
            description:
              'Secamos y sellamos con plancha en mechones finos a la temperatura que pide tu fibra.',
          },
          {
            title: 'Indicaciones de cuidado',
            description:
              'Te explicamos cómo lavar y peinar los primeros días para que el alisado dure más.',
          },
        ],
      },
      {
        slug: 'postalisado',
        displayOrder: 11,
        tagline: 'El cuidado que prolonga y protege tu alisado.',
        summary:
          'Después de un alisado la fibra queda más sensible. El postalisado la hidrata, la nutre y la sella con productos compatibles con tu alisado, para que se mantenga liso, suave y sin resequedad por más tiempo.',
        idealFor: [
          'Quien se hizo un alisado recientemente',
          'Alisados que empiezan a perder brillo o suavidad',
          'Puntas resecas después del proceso',
        ],
        benefits: [
          'Prolonga el efecto del alisado',
          'Devuelve suavidad y brillo',
          'Protege la fibra sensibilizada',
        ],
        results:
          'Tu alisado se ve renovado: más suave, brillante y con menos frizz.',
        aftercare: [
          'Sigue usando shampoo sin sulfatos ni sal.',
          'Aplica mascarilla de mantenimiento en medios y puntas.',
          'Usa protector térmico si vas a usar plancha.',
        ],
        considerations: [],
        recommendedFrequency: null,
        steps: [
          DIAGNOSIS_STEP,
          {
            title: 'Lavado compatible',
            description:
              'Lavamos con productos sin sulfatos que respetan tu alisado.',
          },
          {
            title: 'Hidratación y nutrición',
            description:
              'Aplicamos una mascarilla que devuelve agua y lípidos a la fibra sensibilizada.',
          },
          {
            title: 'Sellado',
            description:
              'Sellamos la cutícula para mantener la suavidad y el liso.',
          },
          FINISH_STEP,
        ],
      },
    ],
  },
  {
    slug: 'spa-coreano',
    displayOrder: 1,
    showOnWebsite: true,
    iconKey: 'flower',
    tagline: 'Un ritual de cuero cabelludo para limpiar, soltar y descansar.',
    description:
      'Inspirado en los head spa de Corea, combina diagnóstico, limpieza profunda y un masaje largo de cuero cabelludo, cuello y hombros. Es cuidado capilar y es pausa.',
    treatments: [
      {
        slug: 'spa-coreano',
        displayOrder: 1,
        tagline: 'Limpieza profunda y un masaje que te desconecta.',
        summary:
          'El spa coreano es un ritual de cuidado del cuero cabelludo: empezamos revisando su estado, lo limpiamos en profundidad para retirar grasa, residuos y células muertas, y terminamos con un masaje prolongado de cabeza, cuello y hombros que libera tensión.',
        idealFor: [
          'Cuero cabelludo graso, con picor o acumulación de producto',
          'Quien se tiñe o decolora con frecuencia',
          'Quien necesita una pausa real para descansar',
        ],
        benefits: [
          'Cuero cabelludo limpio y fresco',
          'Alivio de la tensión en cabeza, cuello y hombros',
          'Cabello más ligero y con movimiento',
        ],
        results:
          'Sales con la cabeza ligera, el cabello limpio y suelto, y una sensación profunda de descanso.',
        aftercare: [
          'Evita productos pesados en la raíz los días siguientes.',
          'Toma agua y date un momento de calma después de la sesión.',
        ],
        considerations: [
          'Si tienes una afección del cuero cabelludo diagnosticada, consúltalo antes con tu dermatólogo.',
        ],
        recommendedFrequency: null,
        steps: [
          {
            title: 'Diagnóstico del cuero cabelludo',
            description:
              'Observamos tu cuero cabelludo para identificar grasa, resequedad o sensibilidad y elegir los productos.',
          },
          {
            title: 'Exfoliación y vapor',
            description:
              'Exfoliamos suavemente y aplicamos vapor para soltar residuos y abrir los poros.',
          },
          {
            title: 'Limpieza profunda',
            description:
              'Lavamos con productos específicos para tu cuero cabelludo, retirando lo que el lavado diario no alcanza.',
          },
          {
            title: 'Masaje de cabeza, cuello y hombros',
            description:
              'Un masaje largo y técnico que activa la circulación y libera la tensión acumulada.',
          },
          {
            title: 'Mascarilla y tratamiento capilar',
            description:
              'Aplicamos una mascarilla para el cuero cabelludo y un tratamiento para los largos.',
          },
          FINISH_STEP,
        ],
      },
    ],
  },
  {
    slug: 'unas',
    displayOrder: 2,
    showOnWebsite: true,
    iconKey: 'hand',
    tagline: 'Manos y pies impecables, con la técnica que mejor va contigo.',
    description:
      'Desde un esmaltado tradicional hasta uñas esculpidas: cuidamos la uña natural y te ayudamos a elegir la técnica según el tiempo que quieres que dure y el estilo que buscas.',
    treatments: [
      {
        slug: 'tradicional',
        displayOrder: 1,
        tagline: 'Manicure clásico con esmalte tradicional.',
        summary:
          'Limpieza, forma, cutícula y esmalte tradicional. Ideal si cambias de color seguido o prefieres no usar productos de curado.',
        idealFor: [
          'Quien cambia de color con frecuencia',
          'Un acabado sencillo y prolijo',
        ],
        benefits: ['Uñas limpias y con forma', 'Se retira fácil en casa'],
        results: 'Uñas pulidas y con color, listas para tu semana.',
        aftercare: [
          'Usa guantes para lavar la loza.',
          'Hidrata cutículas a diario.',
        ],
        considerations: [],
        recommendedFrequency: null,
        steps: [
          {
            title: 'Limpieza y forma',
            description:
              'Retiramos el esmalte anterior, limamos y damos forma.',
          },
          {
            title: 'Cutícula',
            description: 'Cuidamos la cutícula para un acabado limpio.',
          },
          {
            title: 'Esmaltado',
            description: 'Aplicamos base, color y brillo.',
          },
        ],
      },
      {
        slug: 'permanente',
        displayOrder: 2,
        tagline: 'Color que dura, con brillo de principio a fin.',
        summary:
          'Esmaltado semipermanente curado en lámpara: el color se mantiene brillante y sin desportillarse por más tiempo que un esmalte tradicional.',
        idealFor: [
          'Quien quiere olvidarse del esmalte por semanas',
          'Manos activas',
        ],
        benefits: ['Brillo duradero', 'Secado inmediato'],
        results: 'Uñas con color intenso y un brillo que se mantiene.',
        aftercare: [
          'Retíralo en el spa para no lastimar la uña natural.',
          'Hidrata cutículas a diario.',
        ],
        considerations: [],
        recommendedFrequency: null,
        steps: [
          {
            title: 'Preparación de la uña',
            description: 'Limpiamos, damos forma y preparamos la superficie.',
          },
          {
            title: 'Cutícula',
            description: 'Cuidamos la cutícula para un acabado limpio.',
          },
          {
            title: 'Esmaltado y curado',
            description: 'Aplicamos capas finas curadas en lámpara.',
          },
        ],
      },
      {
        slug: 'nivelacion-con-base-rubber',
        displayOrder: 3,
        tagline: 'Una base flexible que nivela y protege tu uña natural.',
        summary:
          'La base rubber es un gel flexible que nivela la superficie, refuerza la uña natural y sirve de base para el color. Es una buena opción si tus uñas son débiles o se quiebran.',
        idealFor: [
          'Uñas débiles o que se quiebran',
          'Quien quiere dejar crecer su uña natural',
        ],
        benefits: ['Uña más resistente', 'Superficie pareja y brillante'],
        results: 'Uñas naturales más firmes, parejas y con un acabado limpio.',
        aftercare: [
          'Retírala en el spa para cuidar tu uña natural.',
          'Hidrata cutículas a diario.',
        ],
        considerations: [],
        recommendedFrequency: null,
        steps: [
          {
            title: 'Preparación',
            description: 'Limpiamos, damos forma y preparamos la uña.',
          },
          {
            title: 'Nivelación',
            description: 'Aplicamos la base rubber para nivelar y reforzar.',
          },
          {
            title: 'Color y curado',
            description: 'Terminamos con color y curado en lámpara.',
          },
        ],
      },
      {
        slug: 'unas-press-on-soft-gel',
        displayOrder: 4,
        tagline: 'Largo y forma al instante con tips de soft gel.',
        summary:
          'Tips de gel flexible adheridos sobre tu uña natural para lograr largo y forma en una sola sesión, con un acabado liviano y natural.',
        idealFor: ['Quien quiere largo sin esperar', 'Un acabado liviano'],
        benefits: ['Largo inmediato', 'Sensación liviana'],
        results: 'Uñas largas, con forma pareja y el diseño que elijas.',
        aftercare: [
          'Evita usar las uñas como herramienta.',
          'Retíralas en el spa.',
        ],
        considerations: [],
        recommendedFrequency: null,
        steps: [
          {
            title: 'Preparación',
            description: 'Preparamos la uña natural para una buena adherencia.',
          },
          {
            title: 'Selección y adhesión',
            description: 'Elegimos la talla de cada tip y lo adherimos.',
          },
          {
            title: 'Forma y acabado',
            description: 'Limamos, damos forma y aplicamos el diseño.',
          },
        ],
      },
      {
        slug: 'unas-dipping',
        displayOrder: 5,
        tagline: 'Polvo de inmersión resistente y de acabado uniforme.',
        summary:
          'El dipping aplica capas de polvo que se fijan sobre la uña y forman una cobertura resistente, sin lámpara y con un color muy uniforme.',
        idealFor: ['Quien busca resistencia', 'Un color parejo y duradero'],
        benefits: ['Cobertura resistente', 'Color uniforme'],
        results: 'Uñas firmes, con color intenso y acabado parejo.',
        aftercare: ['Retíralo en el spa para no lastimar la uña natural.'],
        considerations: [],
        recommendedFrequency: null,
        steps: [
          {
            title: 'Preparación',
            description: 'Limpiamos y preparamos la superficie de la uña.',
          },
          {
            title: 'Inmersión por capas',
            description: 'Aplicamos base e inmersión en polvo, capa por capa.',
          },
          {
            title: 'Pulido y sellado',
            description: 'Pulimos y sellamos para un acabado brillante.',
          },
        ],
      },
      {
        slug: 'unas-acrilicas',
        displayOrder: 6,
        tagline: 'Uñas esculpidas con el largo y la forma que sueñas.',
        summary:
          'El acrílico se esculpe sobre la uña o sobre un molde para lograr largo, forma y resistencia. Es la técnica más versátil para diseños y largos pronunciados.',
        idealFor: ['Largos y formas pronunciadas', 'Diseños elaborados'],
        benefits: ['Largo y forma a la medida', 'Base resistente para diseños'],
        results: 'Uñas esculpidas, firmes y con el estilo que elegiste.',
        aftercare: [
          'Agenda tu mantenimiento para conservar la estructura.',
          'Retíralas en el spa para cuidar tu uña natural.',
        ],
        considerations: [],
        recommendedFrequency: null,
        steps: [
          {
            title: 'Preparación',
            description: 'Preparamos la uña natural y elegimos la forma.',
          },
          {
            title: 'Esculpido',
            description:
              'Construimos la uña con acrílico hasta el largo deseado.',
          },
          {
            title: 'Limado y diseño',
            description: 'Perfeccionamos la forma y aplicamos color o diseño.',
          },
        ],
      },
      {
        slug: 'pedespa-tradicional',
        displayOrder: 7,
        tagline: 'Pies descansados, suaves y con esmalte tradicional.',
        summary:
          'Un spa de pies con remojo, exfoliación, cuidado de cutícula y esmalte tradicional para que tus pies se vean y se sientan renovados.',
        idealFor: ['Pies cansados o resecos', 'Un cuidado completo de pies'],
        benefits: ['Piel más suave', 'Pies descansados'],
        results: 'Pies suaves, cuidados y con color.',
        aftercare: [
          'Hidrata tus pies a diario.',
          'Usa calzado cómodo las primeras horas.',
        ],
        considerations: [],
        recommendedFrequency: null,
        steps: [
          {
            title: 'Remojo',
            description: 'Relajamos y suavizamos la piel con un remojo tibio.',
          },
          {
            title: 'Exfoliación',
            description: 'Retiramos piel seca y suavizamos los talones.',
          },
          {
            title: 'Uñas y cutícula',
            description: 'Damos forma y cuidamos la cutícula.',
          },
          {
            title: 'Hidratación y esmalte',
            description: 'Hidratamos y aplicamos esmalte tradicional.',
          },
        ],
      },
      {
        slug: 'pedespa-semipermanente',
        displayOrder: 8,
        tagline: 'El spa de pies con color que dura.',
        summary:
          'Todo el cuidado del pedespa, terminado con esmaltado semipermanente curado en lámpara para que el color se mantenga por más tiempo.',
        idealFor: [
          'Quien quiere color duradero en los pies',
          'Vacaciones o temporadas de sandalias',
        ],
        benefits: ['Color brillante y duradero', 'Pies suaves y cuidados'],
        results: 'Pies renovados con un color que se mantiene.',
        aftercare: [
          'Hidrata tus pies a diario.',
          'Retira el esmalte en el spa.',
        ],
        considerations: [],
        recommendedFrequency: null,
        steps: [
          {
            title: 'Remojo',
            description: 'Relajamos y suavizamos la piel con un remojo tibio.',
          },
          {
            title: 'Exfoliación',
            description: 'Retiramos piel seca y suavizamos los talones.',
          },
          {
            title: 'Uñas y cutícula',
            description: 'Damos forma y cuidamos la cutícula.',
          },
          {
            title: 'Esmaltado y curado',
            description: 'Aplicamos esmalte semipermanente curado en lámpara.',
          },
        ],
      },
    ],
  },
  {
    slug: 'fase-de-prueba-qa',
    displayOrder: 99,
    showOnWebsite: false,
    iconKey: null,
    tagline: null,
    description: null,
    treatments: [],
  },
];

async function applyContent(prisma: PrismaClient) {
  for (const category of CONTENT) {
    const found = await prisma.category.findUnique({
      where: { slug: category.slug },
    });
    if (!found) {
      console.log(
        `[contenido] La categoría ${category.slug} no existe, se omite.`,
      );
      continue;
    }
    await prisma.category.update({
      where: { id: found.id },
      data: {
        displayOrder: category.displayOrder,
        showOnWebsite: category.showOnWebsite,
        iconKey: category.iconKey,
        tagline: category.tagline,
        description: category.description,
      },
    });

    for (const content of category.treatments) {
      const treatment = await prisma.treatment.findUnique({
        where: {
          categoryId_slug: { categoryId: found.id, slug: content.slug },
        },
      });
      if (!treatment) {
        console.log(
          `[contenido] El servicio ${category.slug}/${content.slug} no existe, se omite.`,
        );
        continue;
      }
      await prisma.$transaction([
        prisma.treatment.update({
          where: { id: treatment.id },
          data: {
            displayOrder: content.displayOrder,
            tagline: content.tagline,
            summary: content.summary,
            idealFor: content.idealFor,
            benefits: content.benefits,
            results: content.results,
            aftercare: content.aftercare,
            considerations: content.considerations,
            recommendedFrequency: content.recommendedFrequency,
            contentNeedsReview: true,
          },
        }),
        prisma.treatmentStep.deleteMany({
          where: { treatmentId: treatment.id },
        }),
        prisma.treatmentStep.createMany({
          data: content.steps.map((step, index) => ({
            treatmentId: treatment.id,
            position: index + 1,
            title: step.title,
            description: step.description,
          })),
        }),
      ]);
      console.log(`[contenido] ${category.slug}/${content.slug} actualizado.`);
    }
  }
}

async function invalidateCache() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log(
      '[contenido] REDIS_URL no definida: la caché del catálogo expira sola en 5 minutos.',
    );
    return;
  }
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    await redis.del(CATALOG_CACHE_KEYS.showcase, CATALOG_CACHE_KEYS.treatments);
    console.log('[contenido] Caché del catálogo invalidada.');
  } catch (error) {
    console.log(
      `[contenido] No se pudo invalidar la caché: ${(error as Error).message}`,
    );
  } finally {
    redis.disconnect();
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await applyContent(prisma);
  } finally {
    await prisma.$disconnect();
  }
  await invalidateCache();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
