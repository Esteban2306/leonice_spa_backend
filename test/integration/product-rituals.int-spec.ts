import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  createSecurityApp,
  HttpServer,
  resetDatabase,
  seedAdmin,
  Session,
  toSession,
} from './app-harness';

const API = '/api/v1';

interface AdminProduct {
  id: string;
  kind: 'SINGLE' | 'COMBO';
  variants: { id: string; brand: string; presentation: string }[];
  ritual: {
    pricePesos: number;
    separatePricePesos: number;
    savingsPesos: number;
    savingsPercent: number;
    isComplete: boolean;
    items: { productName: string; quantity: number }[];
  } | null;
  includedInRituals: { name: string }[];
}

interface CatalogCard {
  slug: string;
  kind: string;
  ritual: { separatePricePesos: number; savingsPercent: number } | null;
}

describe('Rituales de productos: armado en el admin y vista pública', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: HttpServer;
  let admin: Session;
  const variant: Record<string, string> = {};
  const product: Record<string, string> = {};

  const asAdmin = (
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    path: string,
  ) =>
    request(server)
      [method](`${API}${path}`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf);

  const ritualBody = () => ({
    name: 'Ritual Hair Therapy Amazônica',
    tagline: 'Anticaída y control de grasa para tu rutina en casa',
    benefits: ['Menos caída', 'Raíz sin grasa'],
    howToUse: ['Shampoo', 'Mascarilla 3 a 5 minutos', 'Acondicionador'],
    price: 215000,
    items: [
      { variantId: variant.shampoo, quantity: 1 },
      { variantId: variant.acondicionador, quantity: 1 },
      { variantId: variant.mascarilla, quantity: 1 },
    ],
  });

  beforeAll(async () => {
    ({ app, prisma } = await createSecurityApp());
    server = app.getHttpServer() as HttpServer;
    await resetDatabase(prisma.client);
    const db = prisma.client;
    await db.productComboItem.deleteMany();
    await db.productTagAssignment.deleteMany();
    await db.productViewLog.deleteMany();
    await db.treatmentProductRecommendation.deleteMany();
    await db.productVariant.deleteMany();
    await db.product.deleteMany();
    await db.productCategory.deleteMany({ where: { slug: { not: 'combos' } } });
    await db.productCategory.upsert({
      where: { slug: 'combos' },
      update: { isActive: true },
      create: { name: 'Combos', slug: 'combos', displayOrder: -1 },
    });
    const brand = await db.productCategory.create({
      data: { name: 'Amazônica', slug: 'amazonica' },
    });
    const prices = { shampoo: 80000, acondicionador: 80000, mascarilla: 90000 };
    for (const [key, price] of Object.entries(prices)) {
      const created = await db.product.create({
        data: {
          name: `${key} Hair Therapy`,
          slug: `${key}-hair-therapy`,
          productCategoryId: brand.id,
          variants: {
            create: { brand: 'Amazônica', presentation: '300 ml', price },
          },
        },
        include: { variants: true },
      });
      product[key] = created.id;
      variant[key] = created.variants[0].id;
    }

    await seedAdmin(prisma);
    const login = await request(server)
      .post(`${API}/auth/login`)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    admin = toSession(login.headers['set-cookie']);
  });

  afterAll(async () => {
    await app.close();
  });

  let ritualId: string;

  it('crea el Ritual en Combos con su precio fijo y el ahorro calculado', async () => {
    const res = await asAdmin('post', '/products/rituals').send(ritualBody());
    expect(res.status).toBe(201);
    const ritual = res.body as AdminProduct;
    ritualId = ritual.id;
    expect(ritual.kind).toBe('COMBO');
    expect(ritual.variants).toEqual([
      expect.objectContaining({
        brand: 'Amazônica',
        presentation: 'Ritual de 3 productos',
      }),
    ]);
    expect(ritual.ritual).toMatchObject({
      pricePesos: 215000,
      separatePricePesos: 250000,
      savingsPesos: 35000,
      savingsPercent: 14,
      isComplete: true,
    });
  });

  it('el catálogo público muestra el Ritual con su ahorro y la relación con cada producto', async () => {
    const list = await request(server).get(
      `${API}/catalog/products?category=combos`,
    );
    expect(list.status).toBe(200);
    const [card] = (list.body as { items: CatalogCard[] }).items;
    expect(card).toMatchObject({
      slug: 'ritual-hair-therapy-amazonica',
      kind: 'ritual',
      ritual: { separatePricePesos: 250000, savingsPercent: 14 },
    });

    const detail = await request(server).get(
      `${API}/catalog/products/ritual-hair-therapy-amazonica`,
    );
    expect(
      (
        detail.body as { ritualItems: { productSlug: string }[] }
      ).ritualItems.map((item) => item.productSlug),
    ).toEqual([
      'shampoo-hair-therapy',
      'acondicionador-hair-therapy',
      'mascarilla-hair-therapy',
    ]);

    const component = await request(server).get(
      `${API}/catalog/products/shampoo-hair-therapy`,
    );
    expect(
      (component.body as { includedIn: { slug: string }[] }).includedIn,
    ).toEqual([
      expect.objectContaining({ slug: 'ritual-hair-therapy-amazonica' }),
    ]);
  });

  it('el admin filtra por Rituales y cada producto incluido sabe en qué Ritual está', async () => {
    const rituals = await asAdmin('get', '/products/admin?kind=COMBO');
    expect((rituals.body as AdminProduct[]).map((p) => p.id)).toEqual([
      ritualId,
    ]);
    const shampoo = await asAdmin('get', `/products/admin/${product.shampoo}`);
    expect((shampoo.body as AdminProduct).includedInRituals).toEqual([
      expect.objectContaining({ name: 'Ritual Hair Therapy Amazônica' }),
    ]);
  });

  it('no deja borrar un producto incluido y lo explica con el nombre del Ritual', async () => {
    const res = await asAdmin('delete', `/products/${product.shampoo}`);
    expect(res.status).toBe(409);
    expect((res.body as { message: string }).message).toContain(
      'Ritual Hair Therapy Amazônica',
    );
    const variantRes = await asAdmin(
      'delete',
      `/products/variants/${variant.shampoo}`,
    );
    expect(variantRes.status).toBe(409);
  });

  it('al desactivar un producto incluido el Ritual queda incompleto y se oculta de la web', async () => {
    await asAdmin('patch', `/products/${product.mascarilla}/toggle`).expect(
      200,
    );
    const detail = await asAdmin('get', `/products/admin/${ritualId}`);
    expect((detail.body as AdminProduct).ritual?.isComplete).toBe(false);
    const list = await request(server).get(
      `${API}/catalog/products?category=combos`,
    );
    expect((list.body as { items: unknown[] }).items).toEqual([]);
    await asAdmin('patch', `/products/${product.mascarilla}/toggle`).expect(
      200,
    );
  });

  it('reemplaza lo incluido y actualiza la etiqueta de unidades', async () => {
    const res = await asAdmin(
      'put',
      `/products/rituals/${ritualId}/items`,
    ).send({
      items: [
        { variantId: variant.shampoo, quantity: 2 },
        { variantId: variant.mascarilla, quantity: 1 },
      ],
    });
    expect(res.status).toBe(200);
    const ritual = res.body as AdminProduct;
    expect(ritual.variants[0].presentation).toBe('Ritual de 3 productos');
    expect(ritual.ritual?.separatePricePesos).toBe(250000);
    expect(ritual.ritual?.items.map((item) => item.quantity)).toEqual([2, 1]);
  });

  it('rechaza un Ritual con un solo producto, con otro Ritual adentro o fuera de Combos', async () => {
    const single = await asAdmin('post', '/products/rituals').send({
      ...ritualBody(),
      items: [{ variantId: variant.shampoo, quantity: 1 }],
    });
    expect(single.status).toBe(400);

    const ritualVariant = await prisma.client.productVariant.findFirstOrThrow({
      where: { productId: ritualId },
    });
    const nested = await asAdmin('post', '/products/rituals').send({
      ...ritualBody(),
      name: 'Ritual anidado',
      items: [
        { variantId: variant.shampoo, quantity: 1 },
        { variantId: ritualVariant.id, quantity: 1 },
      ],
    });
    expect(nested.status).toBe(409);

    const moved = await asAdmin('patch', `/products/${ritualId}`).send({
      productCategoryId: (
        await prisma.client.productCategory.findUniqueOrThrow({
          where: { slug: 'amazonica' },
        })
      ).id,
    });
    expect(moved.status).toBe(400);
  });

  it('borrar el Ritual no toca los productos incluidos', async () => {
    await asAdmin('delete', `/products/${ritualId}`).expect(204);
    expect(
      await prisma.client.productComboItem.count({
        where: { comboProductId: ritualId },
      }),
    ).toBe(0);
    expect(
      await prisma.client.product.count({
        where: { id: { in: Object.values(product) } },
      }),
    ).toBe(3);
  });
});
