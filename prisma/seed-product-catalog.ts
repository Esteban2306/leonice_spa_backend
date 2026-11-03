import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { CATALOG_CACHE_KEYS } from '../src/catalog/constants/catalog-cache.constants';
import { slugify } from '../src/catalog/common/slugify';
import { CATALOG_ROWS, CatalogRow } from './seed-data/product-catalog-rows';
import {
  LINES,
  LineInfo,
  OVERRIDES,
  ProductContent,
  TYPE_TEMPLATES,
} from './seed-data/product-catalog-content';

const BRANDS: { name: string; description: string }[] = [
  { name: 'MAIS', description: 'Línea MAIS de cuidado capilar profesional.' },
  {
    name: 'Amazônica',
    description: 'Cosmética capilar de origen brasileño.',
  },
  {
    name: 'Salerm',
    description: 'Salerm Cosmetics, marca profesional de cuidado capilar.',
  },
  {
    name: 'Alter Ego',
    description:
      'Alter Ego Italy, marca profesional italiana de cuidado capilar.',
  },
  {
    name: 'Alfaparf Milano',
    description: 'Marca profesional italiana de cuidado capilar.',
  },
  {
    name: 'Benvoleo',
    description:
      'Línea de Alfaparf Milano de productos profesionales limpios, veganos y sostenibles.',
  },
  { name: 'Anva', description: 'Línea de cuidado capilar Anva.' },
  {
    name: 'Valems',
    description: 'Valems Professional, línea de cuidado capilar.',
  },
  {
    name: "L'Mar",
    description: "Laboratorio LMAR, línea de cuidado capilar L'Mar.",
  },
  {
    name: 'Otras marcas',
    description: 'Productos cuya marca está por confirmar con el spa.',
  },
  {
    name: 'Accesorios',
    description: 'Cepillos y accesorios para el cuidado del cabello.',
  },
];

const TYPE_ORDER = [
  'Shampoo',
  'Shampoo en crema',
  'Shampoo seco',
  'Acondicionador',
  'Bálsamo',
  'Mascarilla',
  'Tratamiento',
  'Termoprotector',
  'Espray',
  'Sérum',
  'Crema de peinar',
  'Desenredante',
  'Tónico',
  'Loción',
  'Perfume capilar',
  'Cepillo',
];

const LINE_LABELS: Record<string, string> = {
  'POS-QUIMICA CACAO': 'Pos-química Cacao',
  'POS-QUIMICA ACAI': 'Pos-química Açaí',
  'CONTROL CAIDA': 'Control Caída',
  'MULTI-PROTEINAS': 'Multi-proteínas',
  'COLOR DURADERO': 'Color Duradero',
  'NEUTRO EQUILIBRANTE': 'Neutro Equilibrante',
  VOLUMINIZADOR: 'Voluminizador',
  DERMOCALMANTE: 'Dermocalmante',
  ENERGIZANTE: 'Energizante',
  ROSEE: 'Rosée',
  'SERUM CAPILAR': 'Capilar',
  'Q-BOOST': 'Q-Boost Queratina Hidrolizada',
  'BIOKERA ARGANOLOGY': 'Biokera Arganology',
  '21 SILK PROTEIN': 'Salerm 21 Silk Protein',
  'ARGAN OIL': 'Argan Oil',
  'COCONUT OIL': 'Coconut Oil',
  'BIO-NUTRITIVO': 'Bio-nutritivo',
  'POST-KERATINA': 'Post-keratina',
  'ARCILLA ROJA': 'Arcilla Roja',
  'SEMILLAS DE LINO': 'Semillas de Lino',
  'REGENERADOR MOLECULAR': 'Regenerador Molecular',
  'REJUVENOL ARGANIA': 'Rejuvenol Arganía',
  'BB CREAM BLINDAGEM': 'BB Cream Blindagem',
  'KERATIN REPAIR': 'Keratin Repair',
  'HI-T SECURITY': 'Hi-T Security',
  'LEAVE-IN': 'Leave-in',
  ERGOMICO: 'Ergonómico',
  'LIMPIEZA CUERO CABELLUDO': 'para Limpieza de Cuero Cabelludo',
  'PROTEINS AND MINERALS': 'Proteins and Minerals',
  'DETOXIFYING LOW': 'Detoxifying Low',
  'REPARATIVE LIGHT': 'Reparative Light',
  'AGAIN MIST': 'Perfect Again Mist',
};

const FEATURED_NAMES = new Set([
  'Shampoo Detox MAIS',
  'Mascarilla Hair Therapy Amazônica',
  'Salerm 21 Silk Protein',
  'Sérum Silk Oil Alter Ego',
  'Sérum Cristalli Liquidi Alfaparf Milano',
  'Sérum Nutri Care Oil Benvoleo',
  'Sérum Oil Argan Anva',
  'Shampoo Post-keratina Valems',
  "Shampoo Semillas de Lino L'Mar",
  'Sérum Rejuvenol Arganía Otras marcas',
  'Cepillo Ergonómico',
]);

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');

const labelOf = (line: string) => LINE_LABELS[line] ?? titleCase(line);

interface Group {
  key: string;
  brand: string;
  type: string;
  line: string;
  rows: CatalogRow[];
}

function groupRows(): Group[] {
  const map = new Map<string, Group>();
  for (const row of CATALOG_ROWS) {
    const key = `${row.brand}|${row.type}|${row.line}`;
    const group = map.get(key) ?? {
      key,
      brand: row.brand,
      type: row.type,
      line: row.line,
      rows: [],
    };
    group.rows.push(row);
    map.set(key, group);
  }
  return [...map.values()];
}

function productName(group: Group): string {
  const label = labelOf(group.line);
  const brand = group.brand;
  const withBrand = label.toLowerCase().includes(brand.toLowerCase())
    ? label
    : `${label} ${brand}`;
  if (group.type === 'Tratamiento') return withBrand;
  if (group.type === 'Cepillo') return `Cepillo ${label}`;
  if (group.type === 'Sérum' && group.line === 'SERUM CAPILAR') {
    return `Sérum Capilar ${brand}`;
  }
  if (group.line === 'AGAIN MIST') return `Shampoo seco ${label} ${brand}`;
  return `${group.type} ${withBrand}`;
}

function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function composeContent(
  group: Group,
  siblings: string[],
): { content: ProductContent; verification: string } {
  const info: LineInfo | undefined = LINES[`${group.brand}|${group.line}`];
  if (!info) {
    throw new Error(
      `Falta información de la línea ${group.brand}|${group.line}`,
    );
  }
  const template = TYPE_TEMPLATES[group.type];
  if (!template) throw new Error(`Falta plantilla del tipo ${group.type}`);
  const override = OVERRIDES[group.key] ?? {};

  const tagline = template.tagline.endsWith(' para')
    ? sentence(`${template.tagline} ${info.focus}`)
    : sentence(template.tagline);

  const summary = sentence(info.summary);
  const startsWithType = summary
    .toLowerCase()
    .startsWith(group.type.toLowerCase());
  const purpose = startsWithType
    ? summary
    : `${sentence(template.role)} ${summary}`;

  const combine =
    siblings.length > 0
      ? ` Completa tu rutina con productos de la misma línea: ${siblings.join(', ')}.`
      : '';

  const forWhom = purpose.toLowerCase().includes(info.focus.toLowerCase())
    ? ''
    : ` Pensado para ${info.focus}.`;

  const benefits = [...new Set([...info.benefits, template.benefit])].slice(
    0,
    3,
  );

  const content: ProductContent = {
    tagline,
    purpose,
    description: `${purpose}${forWhom}${combine}`,
    benefits,
    howToUse: override.howToUse ?? template.howToUse,
    idealFor: override.idealFor ?? info.ideal,
    usageFrequency:
      override.usageFrequency !== undefined
        ? override.usageFrequency
        : template.frequency,
    precautions: override.precautions ?? [
      ...template.precautions,
      ...(info.precaution ? [info.precaution] : []),
    ],
    tags: info.tags.length > 0 ? info.tags : template.tags,
  };
  return { content, verification: info.verification };
}

async function invalidateCache() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log(
      '[catálogo] REDIS_URL no definida: la caché de productos expira sola en 5 minutos.',
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
    console.log('[catálogo] Caché de productos invalidada.');
  } catch (error) {
    console.log(
      `[catálogo] No se pudo invalidar la caché: ${(error as Error).message}`,
    );
  } finally {
    redis.disconnect();
  }
}

interface ReportRow {
  name: string;
  brand: string;
  variants: string;
  codes: string;
  verification: string;
  brandInferred: boolean;
  active: boolean;
}

function writeReport(rows: ReportRow[]) {
  const lines = [
    '# Catálogo de productos: revisión del contenido',
    '',
    'Todo el contenido está marcado como "en revisión". La columna Fuente indica de dónde sale la información de la línea:',
    '',
    '- **FUENTE**: hay datos de la marca, de un distribuidor o de la tienda oficial.',
    '- **NOMBRE**: se derivó del nombre del producto, del tipo (shampoo, mascarilla, etc.) y de la línea. Hay que validarlo con el spa o el fabricante.',
    '',
    '| Producto | Marca (categoría) | Presentaciones | Códigos Excel | Fuente | Observaciones |',
    '|---|---|---|---|---|---|',
  ];
  for (const row of rows) {
    const notes = [
      row.brandInferred ? 'Marca inferida por el orden de códigos' : '',
      row.active ? '' : 'Precio 0 en el Excel: queda inactivo',
    ]
      .filter(Boolean)
      .join('; ');
    lines.push(
      `| ${row.name} | ${row.brand} | ${row.variants} | ${row.codes} | ${row.verification} | ${notes} |`,
    );
  }
  const target = join(
    __dirname,
    '..',
    'docs',
    'CATALOGO_PRODUCTOS_REVISION.md',
  );
  writeFileSync(target, `${lines.join('\n')}\n`);
  console.log(`[catálogo] Informe escrito en ${target}`);
}

async function seed(prisma: PrismaClient) {
  const groups = groupRows();
  const byLine = new Map<string, Group[]>();
  for (const group of groups) {
    const lineKey = `${group.brand}|${group.line}`;
    byLine.set(lineKey, [...(byLine.get(lineKey) ?? []), group]);
  }

  const brandIndex = (brand: string) =>
    BRANDS.findIndex((entry) => entry.name === brand);
  const ordered = [...groups].sort((a, b) => {
    const brandDiff = brandIndex(a.brand) - brandIndex(b.brand);
    if (brandDiff !== 0) return brandDiff;
    const lineDiff =
      groups.findIndex((g) => g.brand === a.brand && g.line === a.line) -
      groups.findIndex((g) => g.brand === b.brand && g.line === b.line);
    if (lineDiff !== 0) return lineDiff;
    return TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
  });

  const names = new Map<string, string>();
  for (const group of groups) names.set(group.key, productName(group));
  const slugs = new Set(
    ordered.map((group) => slugify(names.get(group.key) as string)),
  );
  if (slugs.size !== ordered.length) {
    throw new Error('Hay productos con el mismo nombre y no se pueden crear');
  }

  const categories = new Map<string, string>();
  for (const [index, brand] of BRANDS.entries()) {
    const category = await prisma.productCategory.upsert({
      where: { name: brand.name },
      update: {
        description: brand.description,
        displayOrder: index,
        isActive: true,
        slug: slugify(brand.name),
      },
      create: {
        name: brand.name,
        slug: slugify(brand.name),
        description: brand.description,
        displayOrder: index,
      },
    });
    categories.set(brand.name, category.id);
  }

  const stale = await prisma.product.findMany({
    where: { slug: { notIn: [...slugs] } },
    select: { id: true },
  });
  const staleIds = stale.map((product) => product.id);
  await prisma.$transaction([
    prisma.productViewLog.deleteMany({
      where: { productId: { in: staleIds } },
    }),
    prisma.treatmentProductRecommendation.deleteMany({
      where: { productId: { in: staleIds } },
    }),
    prisma.productTagAssignment.deleteMany({
      where: { productId: { in: staleIds } },
    }),
    prisma.productVariant.deleteMany({
      where: { productId: { in: staleIds } },
    }),
    prisma.product.deleteMany({ where: { id: { in: staleIds } } }),
    prisma.productCategory.deleteMany({
      where: { name: { notIn: BRANDS.map((brand) => brand.name) } },
    }),
  ]);
  console.log(
    `[catálogo] Productos fuera del catálogo eliminados: ${staleIds.length}`,
  );

  const report: ReportRow[] = [];
  let order = 0;

  for (const group of ordered) {
    order += 1;
    const name = names.get(group.key) as string;
    const slug = slugify(name);
    const siblings = (byLine.get(`${group.brand}|${group.line}`) ?? [])
      .filter((other) => other.key !== group.key)
      .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type))
      .map((other) => names.get(other.key) as string)
      .slice(0, 3);
    const { content, verification } = composeContent(group, siblings);

    const variants = group.rows.map((row) => ({
      brand: group.brand === 'Otras marcas' ? 'Por confirmar' : group.brand,
      presentation: row.presentation ?? 'Presentación única',
      price: row.price,
    }));
    const active = variants.some((variant) => variant.price > 0);

    const data = {
      name,
      slug,
      productCategoryId: categories.get(group.brand) as string,
      description: content.description,
      tagline: content.tagline,
      purpose: content.purpose,
      benefits: content.benefits,
      howToUse: content.howToUse,
      idealFor: content.idealFor,
      usageFrequency: content.usageFrequency,
      precautions: content.precautions,
      isActive: active,
      isFeatured: FEATURED_NAMES.has(name),
      displayOrder: order,
    };

    const product = await prisma.product.upsert({
      where: { slug },
      update: data,
      create: data,
    });

    await prisma.productVariant.deleteMany({
      where: {
        productId: product.id,
        presentation: {
          notIn: variants.map((variant) => variant.presentation),
        },
      },
    });
    for (const variant of variants) {
      await prisma.productVariant.upsert({
        where: {
          productId_brand_presentation: {
            productId: product.id,
            brand: variant.brand,
            presentation: variant.presentation,
          },
        },
        update: { price: variant.price, isActive: variant.price > 0 },
        create: {
          productId: product.id,
          brand: variant.brand,
          presentation: variant.presentation,
          price: variant.price,
          isActive: variant.price > 0,
        },
      });
    }

    await prisma.productTagAssignment.deleteMany({
      where: { productId: product.id },
    });
    for (const tagName of content.tags) {
      const tag = await prisma.productTag.upsert({
        where: { name: tagName },
        update: { isActive: true },
        create: { name: tagName, slug: slugify(tagName) },
      });
      await prisma.productTagAssignment.create({
        data: { productId: product.id, tagId: tag.id },
      });
    }

    report.push({
      name,
      brand: group.brand,
      variants: variants
        .map(
          (variant) =>
            `${variant.presentation}: $${variant.price.toLocaleString('es-CO')}`,
        )
        .join(' / '),
      codes: group.rows.map((row) => row.code).join(', '),
      verification,
      brandInferred: group.rows.some((row) => row.brandInferred),
      active,
    });
  }

  writeReport(report);
  console.log(
    `[catálogo] Productos cargados: ${ordered.length} en ${BRANDS.length} categorías.`,
  );
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Este script reemplaza el catálogo de productos y no puede ejecutarse en producción sin revisión',
    );
  }

  const prisma = new PrismaClient();
  try {
    await seed(prisma);
  } finally {
    await prisma.$disconnect();
  }
  await invalidateCache();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
