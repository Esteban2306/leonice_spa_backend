import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { CATALOG_CACHE_KEYS } from '../src/catalog/constants/catalog-cache.constants';

interface ProductContent {
  slug: string;
  displayOrder: number;
  tagline: string;
  purpose: string;
  benefits: string[];
  howToUse: string[];
  idealFor: string[];
  usageFrequency: string | null;
  precautions: string[];
}

const PATCH_TEST =
  'Si tienes el cuero cabelludo sensible, prueba primero en una zona pequeña.';

const SHAMPOO_STEPS = [
  'Moja bien el cabello con agua tibia.',
  'Aplica una pequeña cantidad en el cuero cabelludo, no en los largos.',
  'Masajea con las yemas de los dedos, sin uñas, por uno o dos minutos.',
  'Deja que la espuma limpie los largos al enjuagar y enjuaga por completo.',
];

const CONTENT: ProductContent[] = [
  {
    slug: 'shampoo-reparador-intensivo',
    displayOrder: 1,
    tagline: 'Limpia suave y acompaña la reparación de la fibra.',
    purpose:
      'Un shampoo para cabello sensibilizado por tintes, decoloración o alisados: limpia sin arrastrar de más y prepara la fibra para recibir mascarilla o acondicionador.',
    benefits: [
      'Limpieza suave para cabello procesado',
      'Cabello más manejable después del lavado',
      'Buena base para tu mascarilla de tratamiento',
    ],
    howToUse: SHAMPOO_STEPS,
    idealFor: [
      'Cabello con tinte, decoloración o alisado',
      'Cabello que se siente áspero después de lavar',
    ],
    usageFrequency:
      'En cada lavado, alternando con tu rutina según lo que te indiquemos en cabina.',
    precautions: ['Evita el contacto con los ojos.'],
  },
  {
    slug: 'shampoo-detox',
    displayOrder: 2,
    tagline: 'Equilibra el cuero cabelludo graso.',
    purpose:
      'Pensado para el cuero cabelludo: limpia el exceso de grasa y los residuos de productos para que la raíz se sienta ligera por más tiempo.',
    benefits: [
      'Raíz limpia y ligera',
      'Sensación fresca en el cuero cabelludo',
      'Ayuda a retirar acumulación de productos',
    ],
    howToUse: [
      ...SHAMPOO_STEPS.slice(0, 3),
      'Enjuaga y aplica acondicionador solo de medios a puntas.',
    ],
    idealFor: [
      'Raíz que se engrasa rápido',
      'Cuero cabelludo con descamación leve',
    ],
    usageFrequency:
      'Según lo rápido que se engrase tu raíz; puedes alternarlo con un shampoo suave.',
    precautions: [
      'Si la caspa o la grasa persisten, te recomendamos una valoración.',
      'Evita el contacto con los ojos.',
    ],
  },
  {
    slug: 'acondicionador-hidratante',
    displayOrder: 3,
    tagline: 'Desenreda y devuelve suavidad.',
    purpose:
      'Cierra la rutina de lavado: suaviza la superficie del cabello, facilita el desenredado y lo deja más manejable para peinar.',
    benefits: [
      'Desenredado más fácil',
      'Suavidad desde el primer uso',
      'Menos frizz al secar',
    ],
    howToUse: [
      'Después del shampoo, retira el exceso de agua con las manos.',
      'Aplica de medios a puntas, nunca en la raíz.',
      'Desenreda con un peine de dientes anchos mientras actúa.',
      'Deja actuar uno o dos minutos y enjuaga.',
    ],
    idealFor: ['Cabello que se enreda', 'Cabello seco o con frizz'],
    usageFrequency: 'Después de cada lavado.',
    precautions: ['No lo apliques en el cuero cabelludo si tu raíz es grasa.'],
  },
  {
    slug: 'mascarilla-de-cuidado-y-nutricion',
    displayOrder: 4,
    tagline: 'Nutrición profunda para medios y puntas.',
    purpose:
      'Un tratamiento semanal para cabello reseco: repone nutrición en los largos y deja las puntas más suaves y selladas.',
    benefits: [
      'Puntas más suaves',
      'Cabello con más brillo',
      'Complementa los tratamientos de cabina en casa',
    ],
    howToUse: [
      'Lava con shampoo y retira el exceso de agua con una toalla.',
      'Aplica la mascarilla por secciones, de medios a puntas.',
      'Deja actuar el tiempo que indica el empaque; con calor suave actúa mejor.',
      'Enjuaga con agua tibia o fría.',
    ],
    idealFor: ['Puntas resecas', 'Cabello poroso por sol o calor'],
    usageFrequency: 'Una vez por semana o según tu plan de cuidado.',
    precautions: [
      'Evita aplicarla en la raíz si tu cabello se engrasa con facilidad.',
    ],
  },
  {
    slug: 'aceite-de-vitaminas',
    displayOrder: 5,
    tagline: 'Sella la cutícula y controla el frizz.',
    purpose:
      'Unas gotas como paso final para sellar las puntas, controlar el frizz y dar brillo sin apelmazar.',
    benefits: [
      'Control del frizz',
      'Brillo inmediato',
      'Puntas con aspecto más sellado',
    ],
    howToUse: [
      'Empieza con dos o tres gotas.',
      'Frótalas entre las palmas para repartirlas.',
      'Aplica de medios a puntas, nunca en la raíz.',
      'Úsalo en cabello húmedo antes de secar o en seco como toque final.',
    ],
    idealFor: ['Cabello con frizz', 'Puntas resecas o abiertas'],
    usageFrequency:
      'Cuando lo necesites; si el cabello se ve apelmazado, usa menos.',
    precautions: ['Si tu cabello es fino, usa muy poca cantidad.'],
  },
  {
    slug: 'protector-termico',
    displayOrder: 6,
    tagline: 'Protege la fibra del calor.',
    purpose:
      'Una capa ligera que se aplica antes de secador, plancha o rizador para cuidar la fibra del calor de las herramientas.',
    benefits: [
      'Cuida el cabello antes del calor',
      'Ayuda a mantener el alisado y el brillo',
      'Menos frizz al peinar',
    ],
    howToUse: [
      'Aplica sobre el cabello húmedo o seco, según tu rutina, de medios a puntas.',
      'Si es spray, rocía a unos 20 cm sin saturar.',
      'Peina con un peine de dientes anchos para repartirlo.',
      'Espera a que se absorba y asegúrate de que el cabello esté seco antes de usar plancha.',
    ],
    idealFor: ['Quien usa secador o plancha', 'Cabello con alisado o tinte'],
    usageFrequency: 'Cada vez que uses calor.',
    precautions: [
      'Nunca uses plancha sobre cabello húmedo, aunque tengas protector.',
    ],
  },
  {
    slug: 'perfume-capilar',
    displayOrder: 7,
    tagline: 'Aroma duradero sin resecar.',
    purpose:
      'Una fragancia pensada para el cabello: perfuma y aporta brillo sin el exceso de alcohol de un perfume corporal.',
    benefits: [
      'Aroma que acompaña tu día',
      'Brillo inmediato',
      'Refresca entre lavados',
    ],
    howToUse: [
      'Aplica sobre el cabello seco.',
      'Rocía a unos 20 cm, de medios a puntas.',
      'Evita el cuero cabelludo y los ojos.',
      'Peina suavemente para repartir la fragancia.',
    ],
    idealFor: ['Refrescar el cabello entre lavados', 'Ocasiones especiales'],
    usageFrequency: 'Cuando quieras; con moderación si tu cabello es muy seco.',
    precautions: ['No uses perfume corporal en el cabello: suele resecarlo.'],
  },
  {
    slug: 'tonico-anticaida',
    displayOrder: 8,
    tagline: 'Un ritual diario para tu cuero cabelludo.',
    purpose:
      'Se aplica directamente en el cuero cabelludo con masaje para cuidar la raíz como parte de una rutina constante.',
    benefits: [
      'Rutina de cuidado para la raíz',
      'Masaje que activa la circulación',
      'Fácil de incorporar a tu día',
    ],
    howToUse: [
      'Divide el cabello en secciones.',
      'Aplica unas gotas o pulverizaciones directamente sobre el cuero cabelludo.',
      'Masajea con las yemas de los dedos durante unos minutos.',
      'No enjuagues, salvo que el empaque indique lo contrario.',
    ],
    idealFor: [
      'Quien quiere cuidar su raíz con constancia',
      'Cuero cabelludo que necesita atención',
    ],
    usageFrequency: 'Con constancia, según indique el empaque.',
    precautions: [
      PATCH_TEST,
      'Si la caída es intensa o repentina, consulta a un dermatólogo.',
    ],
  },
  {
    slug: 'shampoo-reparador-de-prueba',
    displayOrder: 9,
    tagline: 'Limpieza suave para cabello sensibilizado.',
    purpose: 'Shampoo de limpieza suave para la rutina de cabello procesado.',
    benefits: ['Limpieza suave', 'Cabello más manejable'],
    howToUse: SHAMPOO_STEPS,
    idealFor: ['Cabello procesado'],
    usageFrequency: null,
    precautions: ['Evita el contacto con los ojos.'],
  },
];

async function applyContent(prisma: PrismaClient) {
  for (const content of CONTENT) {
    const { slug, ...data } = content;
    const product = await prisma.product.findUnique({ where: { slug } });
    if (!product) {
      console.log(`[productos] ${slug} no existe, se omite.`);
      continue;
    }
    await prisma.product.update({
      where: { id: product.id },
      data: { ...data, contentNeedsReview: true },
    });
    console.log(`[productos] ${slug} actualizado.`);
  }
}

async function invalidateCache() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log(
      '[productos] REDIS_URL no definida: la caché expira sola en 5 minutos.',
    );
    return;
  }
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    await redis.del(
      CATALOG_CACHE_KEYS.products,
      CATALOG_CACHE_KEYS.productCatalog,
    );
    console.log('[productos] Caché del catálogo invalidada.');
  } catch (error) {
    console.log(
      `[productos] No se pudo invalidar la caché: ${(error as Error).message}`,
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
