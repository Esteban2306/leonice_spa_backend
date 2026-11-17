export interface RitualItemRef {
  productName: string;
  presentation: string;
  quantity: number;
}

export interface RitualContent {
  name: string;
  tagline: string;
  purpose: string;
  description: string;
  benefits: string[];
  howToUse: string[];
  idealFor: string[];
  usageFrequency: string;
  precautions: string[];
  tags: string[];
  isFeatured: boolean;
  items: RitualItemRef[];
}

const EYES =
  'Evita el contacto con los ojos; si ocurre, enjuaga con abundante agua.';
const PATCH =
  'Si tienes el cuero cabelludo sensible, prueba primero en una zona pequeña.';
const THERMAL = 'No apliques el termoprotector sobre el cuero cabelludo.';

const WASH_STEPS = [
  'Moja bien el cabello con agua tibia y aplica el shampoo en el cuero cabelludo con un masaje suave. Enjuaga por completo.',
  'Aplica el acondicionador de medios a puntas, deja actuar un par de minutos y enjuaga.',
  'Una vez por semana, reemplaza el acondicionador por la mascarilla: aplícala en el cabello húmedo, déjala actuar de 5 a 10 minutos y enjuaga.',
];

export const RITUALS: RitualContent[] = [
  {
    name: 'Ritual Color Duradero y Equilibrio',
    tagline: 'Color que dura más y una raíz en equilibrio.',
    purpose:
      'Combina la línea Color Duradero de Salerm, pensada para prolongar la duración y el brillo del color, con la mascarilla Rebalancing de Alter Ego, enfocada en equilibrar el cuero cabelludo.',
    description:
      'Un ritual completo para el cabello con color. El shampoo, el acondicionador y la mascarilla Color Duradero de Salerm (con vitaminas A y E, ácido málico y filtro solar UV) cuidan la cutícula del cabello teñido y ayudan a que el tono se mantenga por más tiempo. La mascarilla Rebalancing de Alter Ego cuida el cuero cabelludo para que la raíz se sienta fresca y equilibrada.',
    benefits: [
      'Ayuda a prolongar la duración y el brillo del color',
      'Cuida la cutícula del cabello teñido',
      'Equilibra el cuero cabelludo y deja la raíz fresca',
      'Cuatro productos que se complementan en una sola rutina',
    ],
    howToUse: [
      'Lava con el shampoo Color Duradero masajeando el cuero cabelludo y enjuaga por completo.',
      'Aplica el acondicionador Color Duradero de medios a puntas, déjalo actuar y enjuaga.',
      'Una vez por semana usa la mascarilla Color Duradero en los largos, déjala actuar de 5 a 10 minutos y enjuaga.',
      'Aplica la mascarilla Rebalancing en el cuero cabelludo y la raíz cuando la sientas pesada o desequilibrada, y enjuaga.',
    ],
    idealFor: [
      'Cabello teñido o con mechas',
      'Quien quiere que su color dure más',
      'Cuero cabelludo graso o con desequilibrio',
    ],
    usageFrequency:
      'Shampoo y acondicionador en cada lavado; mascarillas una o dos veces por semana.',
    precautions: [EYES, PATCH],
    tags: ['Cuidado del color', 'Brillo', 'Cuidado del cuero cabelludo'],
    isFeatured: false,
    items: [
      {
        productName: 'Shampoo Color Duradero Salerm',
        presentation: '300 ml',
        quantity: 1,
      },
      {
        productName: 'Acondicionador Color Duradero Salerm',
        presentation: '300 ml',
        quantity: 1,
      },
      {
        productName: 'Mascarilla Color Duradero Salerm',
        presentation: '250 ml',
        quantity: 1,
      },
      {
        productName: 'Mascarilla Rebalancing Alter Ego',
        presentation: '250 ml',
        quantity: 1,
      },
    ],
  },
  {
    name: 'Ritual Argan Boom y Blindaje Térmico',
    tagline: 'Reparación, hidratación y brillo con protección al calor.',
    purpose:
      'Une la línea Argan Boom de Amazônica, con aceite de argán, con el termoprotector BB Cream Blindagem para hidratar, dar brillo y proteger el cabello del calor de secadores y planchas.',
    description:
      'Ritual pensado para el cabello seco o dañado. El shampoo sin sal, el acondicionador y el tratamiento Argan Boom reparan, hidratan y devuelven brillo gracias al aceite de argán. El termoprotector BB Cream Blindagem, con cacao blanco, lino y macadamia, ayuda a controlar el frizz, mantener la hidratación y proteger el cabello antes del calor.',
    benefits: [
      'Repara, hidrata y aporta brillo',
      'Protege el cabello de daños mecánicos, térmicos y químicos',
      'Ayuda a controlar el frizz',
      'Protección térmica para el secado y el planchado',
    ],
    howToUse: [
      ...WASH_STEPS,
      'Antes de secar o planchar, aplica el termoprotector BB Cream Blindagem de medios a puntas y peina para distribuir.',
    ],
    idealFor: [
      'Cabello seco o maltratado por calor',
      'Cabello con procesos químicos',
      'Quien usa secador o plancha con frecuencia',
    ],
    usageFrequency:
      'Shampoo y acondicionador en cada lavado; tratamiento una vez por semana; termoprotector antes de cada uso de calor.',
    precautions: [EYES, THERMAL],
    tags: ['Rehidratante', 'Brillo'],
    isFeatured: true,
    items: [
      {
        productName: 'Shampoo Argan Boom Amazônica',
        presentation: '500 ml',
        quantity: 1,
      },
      {
        productName: 'Acondicionador Argan Boom Amazônica',
        presentation: '500 ml',
        quantity: 1,
      },
      {
        productName: 'Mascarilla Argan Boom Amazônica',
        presentation: '500 ml',
        quantity: 1,
      },
      {
        productName: 'Termoprotector BB Cream Blindagem Otras marcas',
        presentation: '250 ml',
        quantity: 1,
      },
    ],
  },
  {
    name: 'Ritual Jolly Kids',
    tagline: 'Brillo, hidratación y suavidad para el cabello de los niños.',
    purpose:
      'Línea vegana Jolly Kids de Amazônica, con flor de iris, coco y macadamia, para limpiar, hidratar y facilitar el peinado del cabello infantil.',
    description:
      'Un ritual completo y suave para los más pequeños. El shampoo limpia con delicadeza, el acondicionador y la mascarilla hidratan y aportan suavidad, y la crema para peinar ayuda a desenredar y dar brillo. Todos los productos son veganos y están formulados con extractos de flor de iris, coco y macadamia.',
    benefits: [
      'Limpieza suave para cabello infantil',
      'Hidratación y suavidad con coco y macadamia',
      'Facilita el peinado y reduce los enredos',
      'Fórmula vegana',
    ],
    howToUse: [
      'Lava con el shampoo Jolly Kids con agua tibia, masajeando con suavidad, y enjuaga por completo.',
      'Aplica el acondicionador de medios a puntas, déjalo actuar un minuto y enjuaga.',
      'Una vez por semana usa la mascarilla en el cabello húmedo, déjala actuar unos minutos y enjuaga.',
      'Con el cabello húmedo, aplica la crema para peinar y desenreda con un peine de dientes anchos.',
    ],
    idealFor: [
      'Niños',
      'Cabello delicado o que se enreda con facilidad',
      'Familias que buscan fórmulas veganas',
    ],
    usageFrequency:
      'Shampoo y acondicionador en cada lavado; mascarilla una vez por semana; crema para peinar cuando se necesite.',
    precautions: [
      EYES,
      'Úsalo con supervisión de un adulto en niños pequeños.',
    ],
    tags: ['Niños', 'Rehidratante'],
    isFeatured: false,
    items: [
      {
        productName: 'Shampoo Jolly Kids Amazônica',
        presentation: '500 ml',
        quantity: 1,
      },
      {
        productName: 'Acondicionador Jolly Kids Amazônica',
        presentation: '500 ml',
        quantity: 1,
      },
      {
        productName: 'Mascarilla Jolly Kids Amazônica',
        presentation: '500 ml',
        quantity: 1,
      },
      {
        productName: 'Crema de peinar Jolly Kids Amazônica',
        presentation: '500 ml',
        quantity: 1,
      },
    ],
  },
  {
    name: 'Ritual Purify Anticaída',
    tagline: 'Control de grasa y cuidado de la caída con mirra y rosas.',
    purpose:
      'Línea Purify de Amazônica, con mirra y rosas, enfocada en limpiar en profundidad, reducir la oleosidad y acompañar el cuidado del cabello con tendencia a la caída.',
    description:
      'Ritual para el cabello graso y con tendencia a la caída. El shampoo y el acondicionador Purify limpian en profundidad y ayudan a controlar la oleosidad, mientras que el tratamiento nutre el cabello sin recargar la raíz. Una rutina pensada para mantener el cuero cabelludo limpio y el cabello fuerte.',
    benefits: [
      'Ayuda a reducir la oleosidad',
      'Acompaña el cuidado del cabello con tendencia a la caída',
      'Apoya el crecimiento de un cabello saludable',
      'Nutre sin recargar la raíz',
    ],
    howToUse: WASH_STEPS,
    idealFor: [
      'Cuero cabelludo graso',
      'Cabello con tendencia a la caída',
      'Cabello sensibilizado o quebradizo',
    ],
    usageFrequency:
      'Shampoo y acondicionador en cada lavado; tratamiento una vez por semana.',
    precautions: [
      EYES,
      PATCH,
      'No reemplaza una consulta médica si la caída es intensa o repentina.',
    ],
    tags: ['Anticaída', 'Cabello graso'],
    isFeatured: false,
    items: [
      {
        productName: 'Shampoo Purify Amazônica',
        presentation: '500 ml',
        quantity: 1,
      },
      {
        productName: 'Acondicionador Purify Amazônica',
        presentation: '500 ml',
        quantity: 1,
      },
      {
        productName: 'Mascarilla Purify Amazônica',
        presentation: '500 ml',
        quantity: 1,
      },
    ],
  },
  {
    name: 'Ritual Natural Fresh Control de Grasa',
    tagline: 'Romero, pomelo y niacinamida para un cabello fresco.',
    purpose:
      'Línea Natural Fresh de Anva, con romero, pomelo y niacinamida, para el cabello graso y el control de la caída, junto con un termoprotector que cuida el cabello del calor y del sol.',
    description:
      'El shampoo Natural Fresh limpia con extractos naturales y deja una sensación de frescura y bienestar; el acondicionador aporta control de grasa y acompaña el cuidado de la caída. El termoprotector Anva ayuda a minimizar la deshidratación causada por la exposición solar y el uso frecuente de secadores y planchas. Fórmulas libres de parabenos y no testadas en animales.',
    benefits: [
      'Pensado para cabello graso',
      'Acompaña el control de la caída',
      'Protege del calor de secadores y planchas y de la exposición solar',
      'Libre de parabenos y no testado en animales',
    ],
    howToUse: [
      'Lava con el shampoo Natural Fresh masajeando el cuero cabelludo y enjuaga por completo.',
      'Aplica el acondicionador de medios a puntas, déjalo actuar un par de minutos y enjuaga.',
      'Antes de usar secador o plancha, aplica el termoprotector de medios a puntas y peina para distribuir.',
    ],
    idealFor: [
      'Cabello graso',
      'Cabello con tendencia a la caída',
      'Quien usa calor con frecuencia',
    ],
    usageFrequency:
      'Shampoo y acondicionador en cada lavado; termoprotector antes de cada uso de calor.',
    precautions: [EYES, PATCH, THERMAL],
    tags: ['Cabello graso', 'Anticaída'],
    isFeatured: false,
    items: [
      {
        productName: 'Shampoo Natural Fresh Anva',
        presentation: '500 ml',
        quantity: 1,
      },
      {
        productName: 'Acondicionador Natural Fresh Anva',
        presentation: '500 ml',
        quantity: 1,
      },
      {
        productName: 'Termoprotector Home Care Anva',
        presentation: 'Presentación única',
        quantity: 1,
      },
    ],
  },
  {
    name: 'Ritual Hair Therapy Anticaída',
    tagline: 'Fortalece, regula la grasa y cuida la caída.',
    purpose:
      'Línea profesional Hair Therapy de Amazônica, con capsicum y aceites de linaza y romero, para cabello fino, quebradizo, con caída y tendencia a la grasa.',
    description:
      'Ritual profesional para el cabello frágil. El shampoo sin sal, el acondicionador y la mascarilla Hair Therapy trabajan juntos para fortalecer cada hebra, controlar la oleosidad y acompañar el cuidado de la caída, dejando el cabello suave y con brillo.',
    benefits: [
      'Fortalece el cabello fino o debilitado',
      'Ayuda a controlar la oleosidad',
      'Acompaña el cuidado de la caída',
      'Fórmula sin sal que deja el cabello suave y con brillo',
    ],
    howToUse: WASH_STEPS,
    idealFor: [
      'Cabello fino, quebradizo o frágil',
      'Quien nota caída y busca fortalecer la fibra',
      'Cabello con tendencia a la grasa',
    ],
    usageFrequency:
      'Shampoo y acondicionador en cada lavado; mascarilla una o dos veces por semana.',
    precautions: [
      EYES,
      PATCH,
      'No reemplaza una consulta médica si la caída es intensa o repentina.',
    ],
    tags: ['Anticaída', 'Nutrición'],
    isFeatured: true,
    items: [
      {
        productName: 'Shampoo Hair Therapy Amazônica',
        presentation: '300 ml',
        quantity: 1,
      },
      {
        productName: 'Acondicionador Hair Therapy Amazônica',
        presentation: '300 ml',
        quantity: 1,
      },
      {
        productName: 'Mascarilla Hair Therapy Amazônica',
        presentation: '300 ml',
        quantity: 1,
      },
    ],
  },
  {
    name: 'Ritual Pos-química Açaí y Blindaje Térmico',
    tagline: 'Hidratación y disciplina para el cabello con procesos químicos.',
    purpose:
      'Línea de uso diario Pos-química Açaí de Amazônica, pensada para el cabello después de alisados, tintes o decoloración, con el termoprotector BB Cream Blindagem para proteger del calor.',
    description:
      'Ritual para mantener el cabello procesado hidratado y disciplinado. El shampoo, el acondicionador y la mascarilla Pos-química Açaí acompañan la recuperación tras un proceso químico y aportan suavidad y brillo. El termoprotector BB Cream Blindagem, con cacao blanco, lino y macadamia, ayuda a controlar el frizz y protege el cabello del calor.',
    benefits: [
      'Acompaña la recuperación del cabello procesado',
      'Hidrata y aporta disciplina, suavidad y brillo',
      'Ayuda a controlar el frizz',
      'Protección térmica para el secado y el planchado',
    ],
    howToUse: [
      ...WASH_STEPS,
      'Antes de secar o planchar, aplica el termoprotector BB Cream Blindagem de medios a puntas y peina para distribuir.',
    ],
    idealFor: [
      'Cabello con tinte, decoloración o alisado',
      'Cabello opaco o con frizz después de un proceso químico',
      'Quien complementa en casa sus tratamientos de cabina',
    ],
    usageFrequency:
      'Shampoo y acondicionador de uso diario; mascarilla una o dos veces por semana; termoprotector antes de cada uso de calor.',
    precautions: [EYES, THERMAL],
    tags: ['Reparación', 'Brillo'],
    isFeatured: false,
    items: [
      {
        productName: 'Shampoo Pos-química Açaí Amazônica',
        presentation: '300 ml',
        quantity: 1,
      },
      {
        productName: 'Acondicionador Pos-química Açaí Amazônica',
        presentation: '300 ml',
        quantity: 1,
      },
      {
        productName: 'Mascarilla Pos-química Açaí Amazônica',
        presentation: '300 ml',
        quantity: 1,
      },
      {
        productName: 'Termoprotector BB Cream Blindagem Otras marcas',
        presentation: '250 ml',
        quantity: 1,
      },
    ],
  },
  {
    name: 'Ritual Multi-proteínas',
    tagline: 'Nutrición y refuerzo con acción rellenadora.',
    purpose:
      'Línea Multi-proteínas de Salerm, con refuerzo de queratina, acción rellenadora y booster de colágeno, que nutre y fortalece el cabello.',
    description:
      'Un ritual de tres pasos para el cabello débil o sin cuerpo. El shampoo limpia, el bálsamo acondiciona y la mascarilla aporta una nutrición más profunda. Juntos refuerzan la fibra capilar, mejoran el cuerpo y la elasticidad y devuelven suavidad.',
    benefits: [
      'Nutre y refuerza el cabello',
      'Refuerzo de queratina y acción rellenadora',
      'Aporta cuerpo y elasticidad',
      'Booster de colágeno',
    ],
    howToUse: [
      'Lava con el shampoo Multi-proteínas masajeando el cuero cabelludo y enjuaga por completo.',
      'Aplica el bálsamo de medios a puntas, déjalo actuar un par de minutos y enjuaga.',
      'Una vez por semana reemplaza el bálsamo por la mascarilla: aplícala en el cabello húmedo, déjala actuar de 5 a 10 minutos y enjuaga.',
    ],
    idealFor: [
      'Cabello débil o sin cuerpo',
      'Cabello sensibilizado',
      'Quien busca nutrición y refuerzo',
    ],
    usageFrequency:
      'Shampoo y bálsamo en cada lavado; mascarilla una o dos veces por semana.',
    precautions: [EYES],
    tags: ['Nutrición', 'Reparación'],
    isFeatured: false,
    items: [
      {
        productName: 'Shampoo Multi-proteínas Salerm',
        presentation: '300 ml',
        quantity: 1,
      },
      {
        productName: 'Bálsamo Multi-proteínas Salerm',
        presentation: '300 ml',
        quantity: 1,
      },
      {
        productName: 'Mascarilla Multi-proteínas Salerm',
        presentation: '250 ml',
        quantity: 1,
      },
    ],
  },
];
