export type Verification = 'FUENTE' | 'NOMBRE';

export interface LineInfo {
  focus: string;
  summary: string;
  benefits: string[];
  ideal: string[];
  tags: string[];
  verification: Verification;
  precaution?: string;
}

export interface ProductContent {
  tagline: string;
  purpose: string;
  description: string;
  benefits: string[];
  howToUse: string[];
  idealFor: string[];
  usageFrequency: string | null;
  precautions: string[];
  tags: string[];
}

export interface TypeTemplate {
  role: string;
  tagline: string;
  benefit: string;
  howToUse: string[];
  frequency: string | null;
  precautions: string[];
  tags: string[];
}

const EYES =
  'Evita el contacto con los ojos; si ocurre, enjuaga con abundante agua.';
const PATCH =
  'Si tienes el cuero cabelludo sensible, prueba primero en una zona pequeña.';

export const TYPE_TEMPLATES: Record<string, TypeTemplate> = {
  Shampoo: {
    role: 'Shampoo de limpieza',
    tagline: 'Limpieza pensada para',
    benefit: 'Limpieza suave en cada lavado',
    howToUse: [
      'Moja bien el cabello con agua tibia.',
      'Aplica una pequeña cantidad en el cuero cabelludo y masajea con las yemas de los dedos.',
      'Deja que la espuma limpie los largos al enjuagar.',
      'Enjuaga por completo y continúa con acondicionador o mascarilla de medios a puntas.',
    ],
    frequency: 'En cada lavado, según la necesidad de tu cuero cabelludo.',
    precautions: [EYES],
    tags: [],
  },
  'Shampoo en crema': {
    role: 'Shampoo en textura de crema',
    tagline: 'Limpieza cremosa para',
    benefit: 'Limpieza en textura cremosa',
    howToUse: [
      'Moja bien el cabello con agua tibia.',
      'Aplica una pequeña cantidad en el cuero cabelludo y masajea con suavidad.',
      'Extiende la espuma por los largos y enjuaga por completo.',
    ],
    frequency: 'En cada lavado o según la necesidad de tu cabello.',
    precautions: [EYES],
    tags: [],
  },
  'Shampoo seco': {
    role: 'Shampoo en seco para refrescar la raíz',
    tagline: 'Refresca la raíz sin lavar el cabello',
    benefit: 'Refresca la raíz entre lavados',
    howToUse: [
      'Agita el envase antes de usarlo.',
      'Divide el cabello y aplica sobre el cuero cabelludo, a unos 20 cm de distancia.',
      'Masajea con las yemas de los dedos y peina para distribuir.',
    ],
    frequency: 'Entre lavados, cuando necesites refrescar la raíz.',
    precautions: [
      'No lo uses de forma continua como reemplazo del lavado.',
      'Evita inhalar el producto y el contacto con los ojos.',
    ],
    tags: ['Cabello graso'],
  },
  Acondicionador: {
    role: 'Acondicionador para después del lavado',
    tagline: 'Suavidad y manejo para',
    benefit: 'Desenreda y suaviza desde el primer uso',
    howToUse: [
      'Después del shampoo, retira el exceso de agua con las manos.',
      'Aplica de medios a puntas, sin llegar a la raíz.',
      'Desenreda con un peine de dientes anchos mientras actúa.',
      'Deja actuar uno o dos minutos y enjuaga por completo.',
    ],
    frequency: 'Después de cada lavado.',
    precautions: [
      'No lo apliques en el cuero cabelludo si tu raíz es grasa.',
      EYES,
    ],
    tags: ['Rehidratante'],
  },
  Bálsamo: {
    role: 'Bálsamo acondicionador',
    tagline: 'Suavidad y manejo para',
    benefit: 'Desenreda y suaviza desde el primer uso',
    howToUse: [
      'Después del shampoo, retira el exceso de agua.',
      'Aplica de medios a puntas y desenreda con un peine de dientes anchos.',
      'Deja actuar uno o dos minutos y enjuaga por completo.',
    ],
    frequency: 'Después de cada lavado.',
    precautions: [
      'Evita aplicarlo en la raíz si tu cuero cabelludo es graso.',
      EYES,
    ],
    tags: ['Rehidratante'],
  },
  Mascarilla: {
    role: 'Mascarilla de tratamiento',
    tagline: 'Tratamiento intensivo para',
    benefit: 'Tratamiento más profundo que un acondicionador',
    howToUse: [
      'Lava el cabello con shampoo y retira el exceso de agua con una toalla.',
      'Aplica la mascarilla por secciones, de medios a puntas, sin tocar la raíz.',
      'Deja actuar entre 5 y 10 minutos; con un gorro térmico o calor suave actúa mejor.',
      'Enjuaga por completo con agua tibia.',
    ],
    frequency: 'Una o dos veces por semana, o según tu plan de cuidado.',
    precautions: [
      'Evita aplicarla en la raíz si tu cabello se engrasa con facilidad.',
      EYES,
    ],
    tags: ['Nutrición'],
  },
  Termoprotector: {
    role: 'Protector contra el calor de secador, plancha y rizador',
    tagline: 'Protección antes de usar calor para',
    benefit: 'Crea una barrera frente al calor de las herramientas',
    howToUse: [
      'Aplica sobre el cabello limpio y húmedo, de medios a puntas.',
      'Peina para repartir el producto por todas las hebras.',
      'Seca o plancha como de costumbre.',
    ],
    frequency: 'Cada vez que uses secador, plancha o rizador.',
    precautions: [
      'No sustituye el uso moderado de herramientas de calor.',
      'Evita el contacto con los ojos.',
    ],
    tags: ['Protección térmica'],
  },
  Sérum: {
    role: 'Sérum de acabado sin enjuague',
    tagline: 'Cuidado sin enjuague para',
    benefit: 'Aporta suavidad y brillo sin enjuagar',
    howToUse: [
      'Con el cabello limpio, toma una cantidad pequeña (una o dos gotas o pulsaciones).',
      'Frota entre las palmas y distribuye de medios a puntas.',
      'No enjuagues; peina o seca como de costumbre.',
    ],
    frequency: 'Después de cada lavado o cuando las puntas lo necesiten.',
    precautions: [
      'Usa poca cantidad: el exceso puede apelmazar el cabello.',
      'No lo apliques sobre el cuero cabelludo.',
    ],
    tags: ['Brillo'],
  },
  Tónico: {
    role: 'Tónico para el cuero cabelludo',
    tagline: 'Cuidado diario para',
    benefit: 'Acompaña el cuidado diario de la raíz',
    howToUse: [
      'Con el cabello limpio, divide en secciones.',
      'Aplica directamente sobre el cuero cabelludo, en la zona que necesites.',
      'Masajea con las yemas de los dedos durante un par de minutos.',
      'No enjuagues.',
    ],
    frequency: 'Con constancia, según la indicación del empaque.',
    precautions: [
      PATCH,
      'Si la caída del cabello es intensa o repentina, consulta a un dermatólogo.',
    ],
    tags: ['Cuidado del cuero cabelludo'],
  },
  Loción: {
    role: 'Loción para el cuero cabelludo',
    tagline: 'Cuidado diario para',
    benefit: 'Acompaña el cuidado diario de la raíz',
    howToUse: [
      'Con el cabello limpio, divide en secciones.',
      'Aplica sobre el cuero cabelludo y masajea con suavidad.',
      'No enjuagues.',
    ],
    frequency: 'Con constancia, según la indicación del empaque.',
    precautions: [
      PATCH,
      'Si la caída del cabello es intensa o repentina, consulta a un dermatólogo.',
    ],
    tags: ['Cuidado del cuero cabelludo'],
  },
  Espray: {
    role: 'Espray sin enjuague',
    tagline: 'Cuidado sin enjuague para',
    benefit: 'Se aplica en segundos y no requiere enjuague',
    howToUse: [
      'Pulveriza sobre el cabello húmedo, a unos 20 cm de distancia.',
      'Peina para distribuir y seca como de costumbre.',
    ],
    frequency: 'Cada vez que vayas a secar o peinar tu cabello.',
    precautions: [EYES, 'Evita inhalar el producto.'],
    tags: [],
  },
  'Crema de peinar': {
    role: 'Crema de peinar sin enjuague',
    tagline: 'Peinado fácil para',
    benefit: 'Facilita el peinado y el desenredado',
    howToUse: [
      'Con el cabello limpio y húmedo, toma una pequeña cantidad.',
      'Distribuye de medios a puntas y desenreda con un peine de dientes anchos.',
      'No enjuagues.',
    ],
    frequency: 'Después de cada lavado.',
    precautions: [EYES],
    tags: ['Control de frizz'],
  },
  Desenredante: {
    role: 'Desenredante sin enjuague',
    tagline: 'Desenredado fácil para',
    benefit: 'Facilita el desenredado sin enjuagar',
    howToUse: [
      'Con el cabello limpio y húmedo, aplica de medios a puntas.',
      'Desenreda con un peine de dientes anchos.',
      'No enjuagues.',
    ],
    frequency: 'Después de cada lavado o cuando lo necesites.',
    precautions: [EYES],
    tags: [],
  },
  'Perfume capilar': {
    role: 'Perfume capilar multivitamínico',
    tagline: 'Perfume capilar multivitamínico con aroma duradero',
    benefit: 'Aroma que perdura y refresca el cabello',
    howToUse: [
      'Agita bien antes de usar.',
      'Pulveriza a 20 o 30 cm de distancia sobre el cabello seco, en medios y puntas.',
      'Distribuye suavemente con los dedos.',
    ],
    frequency: 'A diario o cuando quieras refrescar el aroma de tu cabello.',
    precautions: [
      'Evita rociarlo en los ojos y en el cuero cabelludo.',
      'Mantén el envase lejos de fuentes de calor.',
    ],
    tags: ['Fragancia'],
  },
  Tratamiento: {
    role: 'Tratamiento capilar',
    tagline: 'Tratamiento para',
    benefit: 'Refuerza la rutina de cuidado',
    howToUse: ['Sigue la indicación del empaque.'],
    frequency: null,
    precautions: [EYES],
    tags: [],
  },
  Cepillo: {
    role: 'Accesorio de cuidado capilar',
    tagline: 'Accesorio para',
    benefit: 'Complementa tu rutina de cuidado',
    howToUse: ['Úsalo con suavidad.'],
    frequency: null,
    precautions: [],
    tags: [],
  },
};

const line = (
  focus: string,
  summary: string,
  benefits: string[],
  ideal: string[],
  tags: string[],
  verification: Verification,
  precaution?: string,
): LineInfo => ({
  focus,
  summary,
  benefits,
  ideal,
  tags,
  verification,
  precaution,
});

export const LINES: Record<string, LineInfo> = {
  'Amazônica|HAIR THERAPY': line(
    'cabello fino, debilitado o con tendencia a la caída',
    'Línea Hair Therapy de Amazônica, enfocada en fortalecer el cabello y recomendada para cabello fino o con caída.',
    [
      'Aporta nutrientes que fortalecen cada hebra',
      'Deja el cabello suave y con brillo',
      'Fórmula sin sal',
    ],
    [
      'Cabello fino o debilitado',
      'Quien nota caída y busca fortalecer la fibra',
    ],
    ['Anticaída', 'Nutrición'],
    'FUENTE',
    'No reemplaza una consulta médica si la caída es intensa o repentina.',
  ),
  'Amazônica|POS-QUIMICA CACAO': line(
    'cabello después de procesos químicos',
    'Línea pos-química con cacao de Amazônica, pensada para el cuidado del cabello tras alisados, tintes o decoloración.',
    [
      'Acompaña la recuperación del cabello procesado',
      'Aporta suavidad y manejo',
      'Complementa los tratamientos de cabina en casa',
    ],
    [
      'Cabello con tinte, decoloración o alisado',
      'Cabello áspero o sin brillo después de un proceso químico',
    ],
    ['Reparación', 'Nutrición'],
    'NOMBRE',
  ),
  'Amazônica|POS-QUIMICA ACAI': line(
    'cabello después de procesos químicos',
    'Línea pos-química con açaí de Amazônica, pensada para el cuidado del cabello tras alisados, tintes o decoloración.',
    [
      'Acompaña la recuperación del cabello procesado',
      'Aporta suavidad y brillo',
      'Complementa los tratamientos de cabina en casa',
    ],
    [
      'Cabello con tinte, decoloración o alisado',
      'Cabello opaco después de un proceso químico',
    ],
    ['Reparación', 'Brillo'],
    'NOMBRE',
  ),
  'Amazônica|JOLLY KIDS': line(
    'el cabello de los niños',
    'Línea vegana Jolly Kids de Amazônica para niños, con extractos de flor de iris, coco y macadamia para una limpieza e hidratación suaves.',
    [
      'Limpieza suave para cabello infantil',
      'Hidratación con extractos de coco y macadamia',
      'Fórmula vegana',
    ],
    ['Niños', 'Cabello delicado o que se enreda con facilidad'],
    ['Niños', 'Rehidratante'],
    'FUENTE',
  ),
  'Amazônica|PURIFY': line(
    'cabello y cuero cabelludo con tendencia a la grasa',
    'Línea Purify de Amazônica, enfocada en limpiar en profundidad, reducir la oleosidad y cuidar el cabello sensibilizado o con tendencia a la caída.',
    [
      'Limpieza profunda que ayuda a reducir la oleosidad',
      'Acompaña el cuidado del cabello con tendencia a la caída',
      'Nutre sin recargar la raíz',
    ],
    ['Cuero cabelludo graso', 'Cabello sensibilizado o quebradizo'],
    ['Cabello graso', 'Anticaída'],
    'FUENTE',
  ),
  'Amazônica|ARGAN BOOM': line(
    'cabello seco o dañado',
    'Línea Argan Boom de Amazônica con aceite de argán y vitamina E, enfocada en hidratar y proteger el cabello seco o dañado.',
    [
      'Hidrata mientras limpia o acondiciona',
      'Protege de daños mecánicos, térmicos y químicos',
      'Aporta suavidad y brillo',
    ],
    ['Cabello seco o maltratado por calor', 'Cabello con procesos químicos'],
    ['Rehidratante', 'Brillo'],
    'FUENTE',
  ),
  'Amazônica|PLATINUM LOOK': line(
    'cabello rubio, decolorado o con canas',
    'Línea Platinum Look de Amazônica para rubios: matiza para contrarrestar los tonos amarillentos y acompaña la reparación del cabello decolorado.',
    [
      'Ayuda a contrarrestar los tonos amarillentos',
      'Mantiene el color rubio por más tiempo',
      'Fórmula sin sal',
    ],
    ['Cabello rubio o decolorado', 'Cabello con canas o mechas claras'],
    ['Rubios', 'Cuidado del color'],
    'FUENTE',
    'Puede dejar un tinte ligero en cabello muy claro; no lo dejes actuar más tiempo del indicado.',
  ),
  'Amazônica|COCONUT': line(
    'cabello seco que necesita nutrición',
    'Línea de coco de Amazônica, enfocada en nutrir e hidratar el cabello.',
    [
      'Aporta nutrición e hidratación',
      'Deja el cabello suave y manejable',
      'Aroma suave a coco',
    ],
    ['Cabello seco o áspero', 'Cabello que se esponja con facilidad'],
    ['Nutrición', 'Rehidratante'],
    'NOMBRE',
  ),
  'Amazônica|JOJOBA': line(
    'cabello seco o sensibilizado',
    'Mascarilla con jojoba de Amazônica, enfocada en nutrir y suavizar el cabello.',
    [
      'Nutre medios y puntas',
      'Deja el cabello suave y con brillo',
      'Mejora la manejabilidad',
    ],
    ['Cabello seco o con puntas abiertas', 'Cabello sensibilizado por calor'],
    ['Nutrición', 'Brillo'],
    'NOMBRE',
  ),
  'Amazônica|ARGAN OIL': line(
    'puntas secas y cabello opaco',
    'Sérum de aceite de argán de Amazônica para sellar y dar brillo a medios y puntas.',
    [
      'Aporta brillo y suavidad',
      'Ayuda a controlar el frizz',
      'Nutre las puntas',
    ],
    ['Puntas secas o abiertas', 'Cabello opaco o con frizz'],
    ['Brillo', 'Control de frizz'],
    'NOMBRE',
  ),
  'Amazônica|COCONUT OIL': line(
    'puntas secas y cabello sin brillo',
    'Sérum de aceite de coco de Amazônica, un aceite rico en omegas 3 y 6 que ayuda a nutrir, hidratar y fortalecer el cabello.',
    [
      'Nutre e hidrata las puntas',
      'Ayuda a fortalecer la fibra capilar',
      'Aporta brillo y suavidad',
    ],
    ['Puntas secas o quebradizas', 'Cabello opaco'],
    ['Nutrición', 'Brillo'],
    'FUENTE',
  ),
  'Amazônica|ROSEMARY': line(
    'cuero cabelludo y cabello con tendencia a la caída',
    'Tónico de romero de Amazônica, presentado como anticaída para el cuidado diario del cuero cabelludo.',
    [
      'Acompaña el cuidado del cuero cabelludo',
      'Pensado para cabello con tendencia a la caída',
      'Se aplica sin enjuague',
    ],
    [
      'Quien nota caída o adelgazamiento',
      'Cuero cabelludo que necesita constancia en su cuidado',
    ],
    ['Anticaída', 'Cuidado del cuero cabelludo'],
    'FUENTE',
    'No reemplaza una consulta médica si la caída es intensa o repentina.',
  ),
  'MAIS|DETOX': line(
    'cuero cabelludo graso o con acumulación de producto',
    'Shampoo de limpieza profunda con carbón activado, esferas micelares y extractos de menta y limón.',
    [
      'Detoxifica el cabello y el cuero cabelludo sin resecar',
      'Ayuda a controlar el exceso de grasa',
      'Deja el cabello fresco, ligero y sin residuos',
    ],
    [
      'Cuero cabelludo graso',
      'Cabello con acumulación de productos',
      'Cuero cabelludo con caspa o picazón',
    ],
    ['Cabello graso', 'Anticaspa'],
    'FUENTE',
    'Si tu cabello es seco, alterna con un shampoo hidratante.',
  ),
  'MAIS|HIDRATANTE': line(
    'cabello seco, debilitado o con caída visible',
    'Shampoo de tratamiento hidratante y anticaída de MAIS, con Aminexil, Capilia Longa, complejo de aminoácidos, Plex Bond Repair y provitamina B5.',
    [
      'Fortalece desde la raíz y ayuda a controlar la caída visible',
      'Hidrata sin dejar el cabello pesado',
      'Mejora brillo, elasticidad y manejabilidad',
    ],
    [
      'Cabello con caída visible o fragilidad',
      'Cabello seco, opaco o con procesos químicos',
      'Cuero cabelludo sensible o con picazón',
    ],
    ['Anticaída', 'Rehidratante'],
    'FUENTE',
    'Es un cosmético: no reemplaza el tratamiento médico de una caída intensa.',
  ),
  'MAIS|DEEPLY RESTORING': line(
    'cabello dañado que necesita restauración',
    'Acondicionador de la línea de restauración profunda de MAIS.',
    [
      'Ayuda a restaurar el cabello dañado',
      'Suaviza y facilita el desenredado',
      'Acompaña a los tratamientos de reparación',
    ],
    [
      'Cabello dañado por químicos o calor',
      'Cabello áspero y difícil de peinar',
    ],
    ['Reparación', 'Rehidratante'],
    'NOMBRE',
  ),
  'MAIS|HAIR DROPS': line(
    'cabello fino que busca más cuerpo y densidad',
    'Sérum engrosador capilar de MAIS.',
    [
      'Pensado para dar sensación de más densidad',
      'Se aplica sin enjuague',
      'Acompaña tu rutina de cuidado diario',
    ],
    ['Cabello fino o sin volumen', 'Quien busca más cuerpo en la raíz'],
    ['Volumen', 'Cuidado del cuero cabelludo'],
    'FUENTE',
  ),
  'MAIS|SERUM CAPILAR': line(
    'puntas secas, abiertas o sensibilizadas',
    'Bioserum reparador de puntas de MAIS: sérum sin enjuague con vitamina E, pantenol, ceramidas, aceites de argán, jojoba y marula, colágeno hidrolizado, manteca de cupuaçu y filtro UV.',
    [
      'Repara y sella las puntas',
      'Protege con antioxidantes y filtro UV',
      'Deja el cabello suave y con brillo',
    ],
    ['Puntas abiertas o secas', 'Cabello con químicos o mucho uso de calor'],
    ['Reparación', 'Brillo'],
    'FUENTE',
  ),
  'MAIS|FAST BLOWER': line(
    'cabello expuesto a secador, plancha y rizador',
    'Termoprotector profesional de MAIS con vitamina E, aceites de jojoba y aguacate y siliconas que forman una barrera frente al calor.',
    [
      'Protege cada hebra del calor intenso',
      'Reduce el tiempo de secado y ayuda a desenredar',
      'Deja el cabello más liso, con menos frizz y brillo natural',
    ],
    [
      'Quien usa secador o plancha con frecuencia',
      'Cabello con frizz o que se quiebra con el calor',
    ],
    ['Protección térmica', 'Control de frizz'],
    'FUENTE',
  ),
  'MAIS|HAIR VITAMIN': line(
    'cabello expuesto al calor que necesita cuidado diario',
    'Brume protector Hair Vitamin de MAIS.',
    [
      'Ayuda a proteger el cabello en el día a día',
      'Aporta suavidad y brillo',
      'Formato en bruma de fácil aplicación',
    ],
    ['Cabello expuesto a calor o sol', 'Cabello apagado o con frizz'],
    ['Protección térmica', 'Brillo'],
    'FUENTE',
  ),
  'MAIS|Q-BOOST': line(
    'cabello debilitado por procesos químicos, calor o daño ambiental',
    'Tratamiento intensivo profesional Q-Boost de MAIS, con exosomas vegetales, coenzima Q10, queratina hidrolizada, vinagre de manzana, aceites de argán y coco, y aminoácidos de seda.',
    [
      'Repara y reestructura la fibra desde el interior',
      'Aporta densidad y resistencia, y reduce la fragilidad',
      'Sella la cutícula y mejora el brillo y la suavidad',
    ],
    [
      'Cabello debilitado por químicos o calor',
      'Quien busca un refuerzo extra a su tratamiento',
    ],
    ['Reparación', 'Nutrición'],
    'FUENTE',
  ),
  'MAIS|YARA': line(
    'dar fragancia, protección y frizz controlado al cabello',
    'Perfume capilar Yara de MAIS, inspirado en el perfume Yara, con provitamina B5, filtros UV y extractos naturales.',
    [
      'Fragancia duradera que refresca el cabello',
      'Protección solar UV y control del frizz',
      'Nutrición ligera con extractos naturales',
    ],
    ['Quien quiere un aroma duradero en el cabello', 'Cabello expuesto al sol'],
    ['Fragancia'],
    'FUENTE',
  ),
  'MAIS|ROUGE': line(
    'dar fragancia, protección y frizz controlado al cabello',
    'Perfume capilar Rouge de MAIS: aroma floral, amaderado y ambarado, cálido y dulce, con notas de azafrán, jazmín, ámbar y maderas.',
    [
      'Fragancia cálida y duradera',
      'Protección solar UV y control del frizz',
      'Nutrición ligera con extractos naturales',
    ],
    [
      'Planes de noche y ocasiones especiales',
      'Quien prefiere aromas cálidos y dulces',
    ],
    ['Fragancia'],
    'FUENTE',
  ),
  'MAIS|ARABIC ESSENCE': line(
    'dar fragancia, protección y frizz controlado al cabello',
    'Perfume capilar Arabic Essence de MAIS: abre fresco y cítrico y se asienta en un fondo floral, ambarado y amaderado. Es unisex.',
    [
      'Fragancia fresca y refinada',
      'Protección solar UV y control del frizz',
      'Nutrición ligera con extractos naturales',
    ],
    ['Uso diario', 'Quien prefiere un aroma unisex y fresco'],
    ['Fragancia'],
    'FUENTE',
  ),
  'MAIS|ROSEE': line(
    'dar fragancia, protección y frizz controlado al cabello',
    'Perfume capilar Rosée de MAIS: abre jugoso y dulce, con corazón de rosa y fondo suave de almizcle; notas de lichi, rosa turca, vainilla y almizcle.',
    [
      'Fragancia dulce y femenina',
      'Protección solar UV y control del frizz',
      'Nutrición ligera con extractos naturales',
    ],
    [
      'Citas, bodas y ocasiones especiales',
      'Quien prefiere aromas florales y dulces',
    ],
    ['Fragancia'],
    'FUENTE',
  ),
  'MAIS|NUTRI HAIR COMPLEX': line(
    'dar fragancia, nutrición ligera y frizz controlado al cabello',
    'Perfume capilar multivitamínico de MAIS con Nutrihair Complex, que nutre e hidrata sin apelmazar el cabello.',
    [
      'Nutre e hidrata sin dar peso',
      'Mejora la suavidad y el brillo',
      'Protección solar UV y control del frizz',
    ],
    ['Uso diario', 'Cabello que se siente áspero o con frizz'],
    ['Fragancia', 'Nutrición'],
    'FUENTE',
  ),
  'Salerm|COLOR DURADERO': line(
    'cabello con color',
    'Línea Color Duradero de Salerm, pensada para prolongar la duración y el brillo del color.',
    [
      'Ayuda a prolongar la duración del color',
      'Cuida la cutícula del cabello teñido',
      'Mantiene el cabello suave y brillante',
    ],
    ['Cabello teñido o con mechas', 'Quien quiere que su color dure más'],
    ['Cuidado del color', 'Brillo'],
    'FUENTE',
  ),
  'Salerm|MULTI-PROTEINAS': line(
    'cabello que necesita nutrición y refuerzo',
    'Línea Multi-proteínas de Salerm, que nutre y refuerza el cabello desde el interior.',
    [
      'Nutre y refuerza el cabello',
      'Aporta cuerpo y elasticidad',
      'Complementa un ritual de cuidado de la caída',
    ],
    ['Cabello débil o sin cuerpo', 'Cabello sensibilizado'],
    ['Nutrición', 'Reparación'],
    'FUENTE',
  ),
  'Salerm|VOLUMINIZADOR': line(
    'cabello fino que busca volumen',
    'Línea Voluminizador de Salerm: el shampoo limpia suavemente la raíz y el bálsamo hidrata sin aportar peso.',
    [
      'Aporta volumen sin apelmazar',
      'Limpia suavemente el cuero cabelludo',
      'Hidrata sin dar peso',
    ],
    [
      'Cabello fino o lacio sin volumen',
      'Quien busca más cuerpo desde la raíz',
    ],
    ['Volumen'],
    'FUENTE',
  ),
  'Salerm|CONTROL CAIDA': line(
    'cabello fino y debilitado con tendencia a la caída',
    'Shampoo de la línea Hairlab de Salerm para fortalecer el cabello fino y debilitado, con ginseng, biotina y vitaminas.',
    [
      'Ayuda a fortalecer el cabello fino y debilitado',
      'Puede usarse a diario',
      'Se complementa con la loción específica de la línea',
    ],
    ['Cabello fino o debilitado', 'Quien nota más caída de lo habitual'],
    ['Anticaída'],
    'FUENTE',
    'No reemplaza una consulta médica si la caída es intensa o repentina.',
  ),
  'Salerm|CONTROL CASPA': line(
    'cuero cabelludo con caspa',
    'Shampoo anticaspa de la línea Hairlab de Salerm.',
    [
      'Ayuda a controlar la caspa',
      'Limpia el cuero cabelludo con suavidad',
      'Deja una sensación de frescura',
    ],
    ['Cuero cabelludo con descamación o caspa', 'Picazón leve en la raíz'],
    ['Anticaspa', 'Cuidado del cuero cabelludo'],
    'NOMBRE',
    'Si la caspa o la descamación persisten, te recomendamos una valoración.',
  ),
  'Salerm|CONTROL GRASA': line(
    'cuero cabelludo graso',
    'Shampoo de la línea Hairlab de Salerm para normalizar la producción de grasa y eliminar residuos del cabello y del cuero cabelludo.',
    [
      'Controla el exceso de grasa sin efecto rebote',
      'Elimina residuos del cabello y de la raíz',
      'Alarga el tiempo entre lavados',
    ],
    ['Raíz que se engrasa rápido', 'Cabello con acumulación de producto'],
    ['Cabello graso'],
    'FUENTE',
  ),
  'Salerm|DERMOCALMANTE': line(
    'cuero cabelludo sensible o irritado',
    'Línea Dermocalmante de Salerm: limpieza delicada con pH equilibrado para el cuero cabelludo sensible.',
    [
      'Limpieza suave para el cuero cabelludo sensible',
      'pH equilibrado',
      'Ayuda a calmar la sensación de molestia',
    ],
    ['Cuero cabelludo sensible', 'Picazón o irritación por procesos químicos'],
    ['Cuero cabelludo sensible', 'Cuidado del cuero cabelludo'],
    'FUENTE',
  ),
  'Salerm|LISOS': line(
    'cabello con frizz o rebelde',
    'Línea Lisos de Salerm: la mascarilla con queratina hidrolizada y aceite de coco controla el frizz y tiene efecto termoprotector.',
    [
      'Controla el frizz en cabello rebelde',
      'Efecto termoprotector',
      'Deja el cabello más manejable',
    ],
    [
      'Cabello con frizz',
      'Quien se alisa con plancha o secador con frecuencia',
    ],
    ['Control de frizz', 'Protección térmica'],
    'FUENTE',
  ),
  'Salerm|NEUTRO EQUILIBRANTE': line(
    'todo tipo de cabello que necesita una limpieza suave',
    'Shampoo neutro equilibrante de Salerm, de limpieza suave.',
    [
      'Limpieza suave y equilibrada',
      'Adecuado para uso frecuente',
      'Buena base antes de un tratamiento',
    ],
    [
      'Uso frecuente',
      'Cabello con procesos químicos que necesita limpieza suave',
    ],
    ['Cuero cabelludo sensible'],
    'NOMBRE',
  ),
  'Salerm|ENERGIZANTE': line(
    'cuero cabelludo que necesita estímulo y constancia',
    'Loción energizante de la línea Hairlab de Salerm para el cuidado del cuero cabelludo.',
    [
      'Acompaña el cuidado diario del cuero cabelludo',
      'Se aplica sin enjuague',
      'Complementa a los shampoos de la línea',
    ],
    ['Quien quiere cuidar su raíz con constancia', 'Cabello fino o debilitado'],
    ['Cuidado del cuero cabelludo', 'Anticaída'],
    'FUENTE',
  ),
  'Salerm|BIOKERA ARGANOLOGY': line(
    'cabello dañado que necesita reconstrucción',
    'Biokera Arganology de Salerm: aceite de argán de acabado y reconstrucción para cabello dañado, hipoalergénico y sin enjuague.',
    [
      'Ayuda a reconstruir el cabello dañado',
      'Aporta brillo y suavidad',
      'Se aplica sin enjuague',
    ],
    ['Cabello dañado por químicos o calor', 'Puntas secas y opacas'],
    ['Reparación', 'Brillo'],
    'FUENTE',
  ),
  'Salerm|21 SILK PROTEIN': line(
    'cabello seco que necesita suavidad y protección diaria',
    'Salerm 21 Silk Protein: acondicionador y protector sin enjuague con proteínas de seda y provitamina B5.',
    [
      'Aporta suavidad y brillo sin enjuagar',
      'Facilita el desenredado y el peinado',
      'Protege el cabello con proteínas de seda',
    ],
    ['Cabello seco o con frizz', 'Quien busca un cuidado rápido sin enjuague'],
    ['Sin enjuague', 'Brillo'],
    'FUENTE',
  ),
  'Alter Ego|COCONUT': line(
    'cabello seco que necesita nutrición',
    'Línea de coco de Alter Ego Italy, enfocada en restaurar e hidratar el cabello.',
    [
      'Aporta nutrición e hidratación',
      'Ayuda a restaurar el cabello seco',
      'Deja el cabello suave y manejable',
    ],
    ['Cabello seco o áspero', 'Cabello con procesos químicos'],
    ['Nutrición', 'Rehidratante'],
    'NOMBRE',
  ),
  'Alter Ego|COLOR CARE': line(
    'cabello teñido o decolorado',
    'Línea Color Care (ChromEgo) de Alter Ego Italy, diseñada para cabello teñido o decolorado: limpia con suavidad y ayuda a mantener la vitalidad del color.',
    [
      'Limpia con suavidad el cabello teñido',
      'Ayuda a mantener la vitalidad del color',
      'Protege el brillo del cabello con color',
    ],
    ['Cabello teñido o con mechas', 'Cabello decolorado'],
    ['Cuidado del color', 'Brillo'],
    'FUENTE',
  ),
  'Alter Ego|REBALANCING': line(
    'cuero cabelludo con desequilibrio',
    'Línea Rebalancing (ScalpEgo) de Alter Ego Italy, enfocada en equilibrar el cuero cabelludo.',
    [
      'Ayuda a equilibrar el cuero cabelludo',
      'Limpieza adaptada a la raíz',
      'Deja una sensación de frescura',
    ],
    ['Cuero cabelludo graso o con desequilibrio', 'Raíz que se siente pesada'],
    ['Cabello graso', 'Cuidado del cuero cabelludo'],
    'FUENTE',
  ),
  'Alter Ego|PROTEINS AND MINERALS': line(
    'cabello debilitado que necesita refuerzo',
    'Línea Proteins and Minerals de Alter Ego Italy, enfocada en fortalecer el cabello.',
    [
      'Aporta proteínas y minerales',
      'Ayuda a fortalecer el cabello debilitado',
      'Mejora el cuerpo y la elasticidad',
    ],
    [
      'Cabello débil o quebradizo',
      'Cabello sensibilizado por procesos químicos',
    ],
    ['Reparación', 'Nutrición'],
    'NOMBRE',
  ),
  'Alter Ego|MOISTURE REPAIR': line(
    'cabello seco que necesita hidratación y reparación',
    'Shampoo Moisture Repair de Alter Ego Italy (línea Nova Care), para hidratar y reparar.',
    [
      'Hidrata durante el lavado',
      'Ayuda a reparar el cabello seco',
      'Prepara el cabello para el tratamiento',
    ],
    ['Cabello seco o deshidratado', 'Cabello con procesos químicos'],
    ['Rehidratante', 'Reparación'],
    'FUENTE',
  ),
  'Alter Ego|INTENSIVE HYDRATING': line(
    'cabello muy seco que necesita hidratación intensa',
    'Mascarilla de hidratación intensiva de Alter Ego Italy.',
    [
      'Hidratación intensa',
      'Deja el cabello suave y flexible',
      'Mejora el desenredado',
    ],
    ['Cabello muy seco o deshidratado', 'Cabello poroso'],
    ['Rehidratante'],
    'NOMBRE',
  ),
  'Alter Ego|ENERGIZING': line(
    'cuero cabelludo y cabello que necesitan vitalidad',
    'Tónico Energizing (ScalpEgo) de Alter Ego Italy para el cuidado del cuero cabelludo.',
    [
      'Acompaña el cuidado del cuero cabelludo',
      'Se aplica sin enjuague',
      'Complementa el shampoo de la línea',
    ],
    ['Cabello fino o debilitado', 'Quien quiere cuidar su raíz con constancia'],
    ['Cuidado del cuero cabelludo', 'Anticaída'],
    'FUENTE',
  ),
  'Alter Ego|ENERGIZING HERBS': line(
    'cuero cabelludo y cabello que necesitan vitalidad',
    'Línea Energizing Herbs de Alter Ego Italy, de la familia ScalpEgo, enfocada en energizar el cuero cabelludo y el cabello.',
    [
      'Acompaña el cuidado del cuero cabelludo',
      'Extractos de hierbas para una sensación de frescura',
      'Complementa a los productos de la línea',
    ],
    ['Cabello fino o debilitado', 'Quien quiere cuidar su raíz con constancia'],
    ['Cuidado del cuero cabelludo', 'Anticaída'],
    'NOMBRE',
  ),
  'Alter Ego|SILK OIL': line(
    'cabello opaco y reseco que busca brillo sedoso',
    'Línea Silk Oil (CureEgo) de Alter Ego Italy: su acondicionador combina aceite de argán, coco, baobab y manteca de karité.',
    [
      'Efecto sedoso y brillante',
      'Nutre con aceites de argán, coco y baobab',
      'Mejora el desenredado',
    ],
    ['Cabello opaco o reseco', 'Cabello con frizz'],
    ['Brillo', 'Nutrición'],
    'FUENTE',
  ),
  'Alter Ego|ILLUMINATING OIL': line(
    'cabello opaco que busca luminosidad',
    'Aceite iluminador de la línea Silk Oil de Alter Ego Italy.',
    ['Aporta luminosidad', 'Suaviza las puntas', 'Ayuda a controlar el frizz'],
    ['Cabello opaco', 'Puntas secas'],
    ['Brillo', 'Control de frizz'],
    'FUENTE',
  ),
  'Alter Ego|HYDRADAY': line(
    'cabello que necesita hidratación de uso frecuente',
    'Línea Hydraday (CureEgo) de Alter Ego Italy, de uso frecuente: el shampoo es de textura ligera y libre de siliconas, y el acondicionador contiene agua de arroz.',
    [
      'Hidratación diaria sin pesadez',
      'Ayuda a prevenir la resequedad y el quiebre',
      'Fórmula ligera apta para uso frecuente',
    ],
    ['Cabello que se lava seguido', 'Cabello seco o deshidratado'],
    ['Rehidratante'],
    'FUENTE',
  ),
  'Alter Ego|FILLER': line(
    'cabello fino o sin cuerpo que busca relleno',
    'Línea Filler (CureEgo) de Alter Ego Italy, enfocada en dar cuerpo y relleno a la fibra.',
    [
      'Aporta cuerpo y relleno',
      'Mejora la densidad aparente',
      'Deja el cabello más firme',
    ],
    ['Cabello fino o debilitado', 'Cabello poroso o sin cuerpo'],
    ['Volumen', 'Reparación'],
    'FUENTE',
  ),
  'Alter Ego|HI-T SECURITY': line(
    'cabello expuesto al calor de secador y plancha',
    'Termoprotector Hi-T Security de Alter Ego Italy.',
    [
      'Ayuda a proteger el cabello del calor',
      'Reduce el frizz al secar',
      'Facilita el peinado',
    ],
    [
      'Quien usa secador o plancha con frecuencia',
      'Cabello sensibilizado por calor',
    ],
    ['Protección térmica'],
    'FUENTE',
  ),
  'Alter Ego|DETOXIFYING LOW': line(
    'cuero cabelludo con acumulación de residuos',
    'Shampoo detoxificante de espuma baja.',
    [
      'Limpieza profunda de la raíz',
      'Ayuda a retirar residuos de productos',
      'Deja el cabello ligero',
    ],
    ['Cuero cabelludo graso', 'Cabello con acumulación de producto'],
    ['Cabello graso'],
    'NOMBRE',
  ),
  'Alfaparf Milano|NUTRITIVE': line(
    'cabello seco',
    'Línea Semi di Lino Moisture Nutritive de Alfaparf Milano para cabello seco, con el complejo Nutri-Sugars que retiene la humedad dentro de la fibra. Es libre de sulfatos, parabenos y parafinas, y apta para cabello teñido.',
    [
      'Hidratación que se mantiene dentro de la fibra',
      'Deja el cabello suave y desenredado',
      'Apta para cabello teñido',
    ],
    ['Cabello seco o enredado', 'Cabello teñido'],
    ['Rehidratante', 'Cuidado del color'],
    'FUENTE',
  ),
  'Alfaparf Milano|SMOOTHING': line(
    'cabello con frizz o rebelde',
    'Línea Semi di Lino Smooth de Alfaparf Milano: limpia, acondiciona, desenreda y alisa, con un complejo que ayuda a crear una barrera contra la humedad.',
    [
      'Protege contra el frizz, el calor y la humedad',
      'Desenreda y suaviza',
      'Deja el cabello más liso y manejable',
    ],
    ['Cabello con frizz', 'Cabello rebelde en climas húmedos'],
    ['Control de frizz'],
    'FUENTE',
  ),
  'Alfaparf Milano|REPARATIVE': line(
    'cabello dañado',
    'Línea Semi di Lino Reparative de Alfaparf Milano, enfocada en reparar el cabello dañado.',
    [
      'Ayuda a reparar el cabello dañado',
      'Aporta suavidad',
      'Mejora la manejabilidad',
    ],
    ['Cabello dañado por químicos o calor', 'Cabello quebradizo'],
    ['Reparación'],
    'NOMBRE',
  ),
  'Alfaparf Milano|REPARATIVE LIGHT': line(
    'cabello dañado que necesita reparación ligera',
    'Mascarilla Reparative Light de Alfaparf Milano, de reparación en textura ligera.',
    [
      'Ayuda a reparar sin apelmazar',
      'Aporta suavidad',
      'Mejora la manejabilidad',
    ],
    ['Cabello dañado y fino', 'Quien prefiere texturas ligeras'],
    ['Reparación'],
    'NOMBRE',
  ),
  'Alfaparf Milano|ENHANCING': line(
    'cabello con color',
    'Línea Semi di Lino Enhancing de Alfaparf Milano, enfocada en cuidar el cabello teñido y realzar su vitalidad.',
    [
      'Cuida el cabello teñido',
      'Ayuda a mantener la vitalidad del color',
      'Aporta suavidad y brillo',
    ],
    ['Cabello teñido', 'Cabello con mechas'],
    ['Cuidado del color', 'Brillo'],
    'NOMBRE',
  ),
  'Alfaparf Milano|ENERGIZING': line(
    'cuero cabelludo y cabello que necesitan estímulo',
    'Línea Semi di Lino Energizing de Alfaparf Milano, enfocada en el cuidado de la raíz.',
    [
      'Acompaña el cuidado del cuero cabelludo',
      'Limpieza suave',
      'Pensado para cabello fino o debilitado',
    ],
    ['Cabello fino o debilitado', 'Quien nota más caída de lo habitual'],
    ['Anticaída', 'Cuidado del cuero cabelludo'],
    'NOMBRE',
  ),
  'Alfaparf Milano|BALANCING': line(
    'cuero cabelludo con exceso de grasa',
    'Línea Semi di Lino Balancing de Alfaparf Milano, enfocada en equilibrar el cuero cabelludo.',
    [
      'Ayuda a equilibrar la producción de grasa',
      'Limpieza adaptada a la raíz',
      'Deja una sensación de frescura',
    ],
    ['Cuero cabelludo graso', 'Raíz que se siente pesada'],
    ['Cabello graso'],
    'NOMBRE',
  ),
  'Alfaparf Milano|ILLUMINATING': line(
    'cabello opaco que busca luminosidad',
    'Línea Semi di Lino Illuminating de Alfaparf Milano, enfocada en dar luminosidad.',
    ['Aporta luminosidad', 'Suaviza la fibra', 'Deja el cabello con brillo'],
    ['Cabello opaco', 'Cabello sin brillo'],
    ['Brillo'],
    'NOMBRE',
  ),
  'Alfaparf Milano|CRISTALLI LIQUIDI': line(
    'puntas secas y cabello opaco',
    'Sérum Cristalli Liquidi de Alfaparf Milano, un acabado de brillo para puntas.',
    ['Aporta brillo', 'Suaviza las puntas', 'Ayuda a controlar el frizz'],
    ['Puntas secas o abiertas', 'Cabello opaco'],
    ['Brillo', 'Control de frizz'],
    'NOMBRE',
  ),
  'Alfaparf Milano|BLOW DRY CREAM': line(
    'cabello expuesto al calor del secador',
    'Crema termoprotectora Blow Dry Cream de Alfaparf Milano.',
    [
      'Protege del calor del secador',
      'Facilita el peinado',
      'Deja el cabello más suave',
    ],
    ['Quien se seca el cabello con secador', 'Cabello con frizz'],
    ['Protección térmica'],
    'NOMBRE',
  ),
  'Alfaparf Milano|ENERGIZING TONIC': line(
    'cuero cabelludo que necesita constancia',
    'Tónico Energizing de la línea Semi di Lino de Alfaparf Milano.',
    [
      'Acompaña el cuidado del cuero cabelludo',
      'Se aplica sin enjuague',
      'Complementa al shampoo Energizing',
    ],
    ['Cabello fino o debilitado', 'Quien quiere cuidar su raíz con constancia'],
    ['Anticaída', 'Cuidado del cuero cabelludo'],
    'NOMBRE',
  ),
  'Benvoleo|AGAIN MIST': line(
    'refrescar la raíz entre lavados',
    'Perfect Again Mist de Benvoleo (Alfaparf Milano): bruma bifásica sin gas que se aplica en el cuero cabelludo para absorber el exceso de grasa, con ligero efecto de volumen.',
    [
      'Absorbe la grasa de la raíz',
      'Aspecto fresco y ligero',
      'Ligero efecto de volumen',
    ],
    [
      'Cabello que se engrasa entre lavados',
      'Quien necesita refrescar el peinado',
    ],
    ['Cabello graso', 'Volumen'],
    'FUENTE',
  ),
  'Benvoleo|NUTRI CARE OIL': line(
    'cabello seco que necesita nutrición',
    'Aceite Nutri Care de Benvoleo (Alfaparf Milano) con ecosiliconas y aceite de arroz.',
    [
      'Nutre y suaviza',
      'Se puede usar antes del secador o como acabado',
      'También sirve como pre-shampoo o tratamiento nocturno',
    ],
    ['Cabello seco o áspero', 'Puntas resecas'],
    ['Nutrición', 'Brillo'],
    'FUENTE',
  ),
  'Benvoleo|GLOSSY EXPRESS': line(
    'cabello opaco que busca brillo rápido',
    'Acondicionador Glossy Express de Benvoleo (Alfaparf Milano), de la categoría leave-in y refresh.',
    ['Aporta brillo', 'Acción rápida', 'Facilita el peinado'],
    ['Cabello opaco', 'Quien tiene poco tiempo'],
    ['Brillo'],
    'NOMBRE',
  ),
  'Benvoleo|GLOSSY MICELLAR': line(
    'cabello opaco que busca brillo',
    'Shampoo micelar con efecto brillo.',
    [
      'Limpieza suave con tecnología micelar',
      'Aporta brillo',
      'Facilita el desenredado',
    ],
    ['Cabello opaco', 'Cabello con acumulación de producto'],
    ['Brillo'],
    'NOMBRE',
  ),
  'Benvoleo|HYDRATION': line(
    'cabello seco que necesita hidratación',
    'Shampoo en crema de hidratación.',
    ['Limpieza cremosa', 'Aporta hidratación', 'Deja el cabello suave'],
    ['Cabello seco', 'Cabello deshidratado'],
    ['Rehidratante'],
    'NOMBRE',
  ),
  'Benvoleo|HEAT GUARD': line(
    'cabello expuesto al calor',
    'Recovery Heat Guard de Benvoleo (Alfaparf Milano), protector térmico.',
    ['Ayuda a proteger del calor', 'Facilita el peinado', 'Aporta suavidad'],
    ['Quien usa secador o plancha', 'Cabello sensibilizado'],
    ['Protección térmica'],
    'FUENTE',
  ),
  'Benvoleo|LEAVE-IN': line(
    'cabello difícil de peinar',
    'Desenredante leave-in de Benvoleo (Alfaparf Milano).',
    ['Facilita el desenredado', 'Se aplica sin enjuague', 'Aporta suavidad'],
    ['Cabello enredado', 'Cabello largo'],
    ['Sin enjuague'],
    'NOMBRE',
  ),
  'Anva|BIO-NUTRITIVO': line(
    'cabello normal a seco, rubio o con procesos químicos',
    'Línea Bio-nutritivo de Anva, con ácido hialurónico y aceite de cacay, apta para todo tipo de cabello.',
    [
      'Nutre e hidrata',
      'Apta para cabello rubio o con procesos químicos',
      'Con ácido hialurónico y aceite de cacay',
    ],
    ['Cuero cabelludo normal o seco', 'Cabello rubio o con químicos'],
    ['Nutrición', 'Rehidratante'],
    'FUENTE',
  ),
  'Anva|NATURAL FRESH': line(
    'cabello graso y con tendencia a la caída',
    'Línea Natural Fresh de Anva, con toronja, romero y niacinamida, para cabello graso y control de la caída. El tratamiento equilibra el pH después del shampoo.',
    [
      'Pensada para cabello graso',
      'Acompaña el control de la caída',
      'El tratamiento equilibra el pH y aporta hidratación profunda',
    ],
    ['Cabello graso', 'Cabello con tendencia a la caída'],
    ['Cabello graso', 'Anticaída'],
    'FUENTE',
  ),
  'Anva|BIOMIMETIC ORGANIC': line(
    'cabello que necesita nutrición',
    'Mascarilla Biomimetic Organic de Anva.',
    ['Nutre el cabello', 'Aporta suavidad', 'Mejora la manejabilidad'],
    ['Cabello seco', 'Cabello sensibilizado'],
    ['Nutrición'],
    'NOMBRE',
  ),
  'Anva|OIL ARGAN': line(
    'puntas secas y cabello opaco',
    'Sérum de aceite de argán de Anva.',
    [
      'Aporta brillo y suavidad',
      'Ayuda a controlar el frizz',
      'Nutre las puntas',
    ],
    ['Puntas secas', 'Cabello con frizz'],
    ['Brillo', 'Control de frizz'],
    'NOMBRE',
  ),
  'Anva|HOME CARE': line(
    'cabello expuesto al calor',
    'Termoprotector Home Care de Anva.',
    ['Ayuda a proteger del calor', 'Facilita el peinado', 'Aporta suavidad'],
    ['Quien usa secador o plancha', 'Cabello sensibilizado por calor'],
    ['Protección térmica'],
    'NOMBRE',
  ),
  "L'Mar|SEMILLAS DE LINO": line(
    'cabello frágil o teñido',
    "Línea Semillas de Lino de L'Mar (Laboratorio LMAR): el shampoo es texturizante, sin sal y recomendado para cabello teñido; el acondicionador desenreda, hidrata, nutre y devuelve luminosidad.",
    [
      'Recomendada para cabello teñido',
      'Desenreda, hidrata y nutre',
      'Fórmula sin sal',
    ],
    ['Cabello frágil o teñido', 'Cabello opaco'],
    ['Cuidado del color', 'Nutrición'],
    'FUENTE',
  ),
  'Valems|WELLNESS': line(
    'cabello que busca bienestar y suavidad',
    'Acondicionador Wellness de Valems Professional.',
    [
      'Aporta suavidad',
      'Facilita el desenredado',
      'Acompaña la rutina de cuidado',
    ],
    ['Cabello seco', 'Cabello con procesos químicos'],
    ['Rehidratante'],
    'NOMBRE',
  ),
  'Valems|ARCILLA ROJA': line(
    'cuero cabelludo que necesita limpieza profunda',
    'Línea de arcilla roja de Valems Professional.',
    [
      'Limpieza profunda',
      'Ayuda a retirar impurezas',
      'Deja una sensación de frescura',
    ],
    ['Cuero cabelludo graso', 'Cabello con acumulación de producto'],
    ['Cabello graso'],
    'NOMBRE',
  ),
  'Valems|POST-KERATINA': line(
    'cabello después de un alisado de keratina',
    'Línea Post-keratina de Valems Professional, pensada para el mantenimiento del cabello después de un tratamiento de keratina.',
    [
      'Ayuda a prolongar el alisado',
      'Mantiene el cabello suave',
      'Complementa tu tratamiento de keratina',
    ],
    ['Cabello con alisado de keratina', 'Cabello alisado con químicos'],
    ['Reparación', 'Control de frizz'],
    'FUENTE',
  ),
  'Valems|REGENERADOR MOLECULAR': line(
    'puntas dañadas que necesitan regeneración',
    'Sérum regenerador molecular de Valems Professional.',
    ['Ayuda a reparar las puntas', 'Aporta suavidad', 'Se aplica sin enjuague'],
    ['Puntas dañadas', 'Cabello con químicos'],
    ['Reparación', 'Brillo'],
    'NOMBRE',
  ),
  'Otras marcas|REJUVENOL ARGANIA': line(
    'puntas secas y cabello opaco',
    'Sérum de la línea Arganía de Rejuvenol.',
    [
      'Aporta brillo y suavidad',
      'Ayuda a controlar el frizz',
      'Nutre las puntas',
    ],
    ['Puntas secas', 'Cabello opaco'],
    ['Brillo', 'Control de frizz'],
    'NOMBRE',
  ),
  'Otras marcas|BB CREAM BLINDAGEM': line(
    'cabello expuesto al calor que busca blindaje',
    'Termoprotector tipo BB Cream con efecto de blindaje.',
    [
      'Ayuda a proteger del calor',
      'Efecto blindaje en la fibra',
      'Facilita el peinado',
    ],
    ['Quien usa secador o plancha', 'Cabello sensibilizado'],
    ['Protección térmica'],
    'NOMBRE',
  ),
  'Otras marcas|KERATIN REPAIR': line(
    'cabello expuesto al calor que necesita reparación',
    'Termoprotector con keratina.',
    [
      'Ayuda a proteger del calor',
      'Acompaña la reparación de la fibra',
      'Facilita el peinado',
    ],
    ['Quien usa secador o plancha', 'Cabello sensibilizado'],
    ['Protección térmica', 'Reparación'],
    'NOMBRE',
  ),
  'Accesorios|ERGOMICO': line(
    'peinar con comodidad',
    'Cepillo ergonómico para el cuidado diario del cabello.',
    [
      'Diseño ergonómico para sujetarlo con comodidad',
      'Ayuda a desenredar',
      'Complementa tu rutina de cuidado',
    ],
    ['Uso diario', 'Cabello largo o que se enreda'],
    [],
    'NOMBRE',
  ),
  'Accesorios|LIMPIEZA CUERO CABELLUDO': line(
    'masajear y limpiar el cuero cabelludo',
    'Cepillo para el masaje y la limpieza del cuero cabelludo durante el lavado.',
    [
      'Ayuda a limpiar el cuero cabelludo',
      'Da un masaje relajante durante el lavado',
      'Complementa tu shampoo',
    ],
    [
      'Cuero cabelludo graso o con residuos',
      'Quien quiere un masaje durante el lavado',
    ],
    ['Cuidado del cuero cabelludo'],
    'NOMBRE',
  ),
};

export const OVERRIDES: Record<string, Partial<ProductContent>> = {
  'Alfaparf Milano|Mascarilla|NUTRITIVE': {
    howToUse: [
      'Lava el cabello con shampoo y retira el exceso de agua.',
      'Aplica una o dos porciones de mascarilla de medios a puntas.',
      'Déjala actuar unos 5 minutos.',
      'Enjuaga por completo.',
    ],
  },
  'Alfaparf Milano|Mascarilla|SMOOTHING': {
    howToUse: [
      'Lava el cabello con shampoo y retira el exceso de agua.',
      'Aplica una pequeña porción de mascarilla de medios a puntas.',
      'Déjala actuar unos 5 minutos.',
      'Enjuaga por completo.',
    ],
  },
  'MAIS|Shampoo|DETOX': {
    howToUse: [
      'Aplica sobre el cabello mojado, enfocándote en el cuero cabelludo.',
      'Masajea con las yemas de los dedos.',
      'Enjuaga por completo; repite si quieres una limpieza extra profunda.',
      'Continúa con acondicionador de medios a puntas.',
    ],
    usageFrequency:
      'Una o dos veces por semana, o según lo requiera tu rutina de lavado.',
  },
  'MAIS|Shampoo|HIDRATANTE': {
    howToUse: [
      'Aplica sobre el cabello húmedo, empezando por la raíz.',
      'Masajea el cuero cabelludo en círculos durante 2 o 3 minutos.',
      'Déjalo actuar entre 5 y 10 minutos.',
      'Enjuaga con abundante agua.',
    ],
    usageFrequency:
      'De uso frecuente; combínalo con el acondicionador o la mascarilla MAIS.',
  },
  'MAIS|Tratamiento|Q-BOOST': {
    howToUse: [
      'Lava el cabello con un shampoo suave.',
      'Aplica sobre el cabello húmedo, de medios a puntas.',
      'Déjalo actuar entre 15 y 20 minutos con calor (secador o gorro térmico).',
      'Enjuaga por completo y peina como de costumbre.',
    ],
    usageFrequency: 'Una o dos veces por semana.',
  },
  'MAIS|Sérum|SERUM CAPILAR': {
    howToUse: [
      'Aplica una pequeña cantidad de medios a puntas.',
      'Distribuye con las manos o con un peine, enfocándote en las zonas más dañadas.',
      'No enjuagues; úsalo sobre cabello seco o húmedo.',
    ],
    usageFrequency: 'A diario o después de cada lavado.',
  },
  'Salerm|Shampoo|CONTROL CAIDA': {
    howToUse: [
      'Aplica sobre el cuero cabelludo húmedo.',
      'Masajea con suavidad y deja actuar unos minutos.',
      'Enjuaga con agua tibia.',
    ],
    usageFrequency: 'Puede usarse a diario.',
  },
  'Salerm|Espray|LISOS': {
    howToUse: [
      'Pulveriza sobre el cabello húmedo antes de secar.',
      'Peina para distribuir.',
      'No enjuagues; seca o plancha como de costumbre.',
    ],
    precautions: [
      'Protege hasta unos 200 °C, según la información de la línea.',
      'Evita el contacto con los ojos.',
    ],
  },
  'Salerm|Mascarilla|LISOS': {
    howToUse: [
      'Aplica sobre el cabello húmedo y recién lavado, de medios a puntas.',
      'Masajea y déjala actuar unos minutos.',
      'Enjuaga por completo.',
    ],
  },
  'Salerm|Tratamiento|BIOKERA ARGANOLOGY': {
    howToUse: [
      'Después del lavado, pon unas gotas en la palma de la mano.',
      'Distribuye de medios a puntas.',
      'No enjuagues; peina o seca como de costumbre.',
    ],
    usageFrequency: 'Después de cada lavado, en poca cantidad.',
    precautions: [
      'Usa poca cantidad: el exceso puede apelmazar el cabello.',
      'No lo apliques sobre el cuero cabelludo.',
    ],
  },
  'Salerm|Tratamiento|21 SILK PROTEIN': {
    howToUse: [
      'Aplica sobre el cabello limpio y húmedo, de medios a puntas.',
      'Peina para distribuir.',
      'No enjuagues; seca y peina como de costumbre.',
    ],
    usageFrequency: 'Después de cada lavado.',
  },
  'Benvoleo|Shampoo seco|AGAIN MIST': {
    howToUse: [
      'Agita el envase antes de usarlo.',
      'Aplica sobre el cuero cabelludo, dividiendo el cabello en secciones.',
      'Masajea con las yemas de los dedos y peina.',
    ],
  },
  'Benvoleo|Sérum|NUTRI CARE OIL': {
    howToUse: [
      'Úsalo como leave-in: aplica unas gotas antes del secador, de medios a puntas.',
      'También puedes usarlo como acabado en el cabello seco.',
      'Como pre-shampoo o tratamiento nocturno: aplica antes de lavar y deja actuar.',
    ],
  },
  'Accesorios|Cepillo|ERGOMICO': {
    howToUse: [
      'Peina empezando por las puntas y sube hacia la raíz.',
      'Retira el cabello del cepillo y lávalo con agua tibia y jabón suave de vez en cuando.',
    ],
    usageFrequency: 'A diario.',
    precautions: ['No lo uses con fuerza sobre nudos: desenreda poco a poco.'],
  },
  'Accesorios|Cepillo|LIMPIEZA CUERO CABELLUDO': {
    howToUse: [
      'Con el cabello mojado y el shampoo aplicado, masajea el cuero cabelludo con movimientos circulares suaves.',
      'Enjuaga el cabello y el cepillo.',
    ],
    usageFrequency: 'En cada lavado o según tu rutina.',
    precautions: [
      'Úsalo con presión suave: si hay heridas o irritación en el cuero cabelludo, evítalo.',
    ],
  },
};
