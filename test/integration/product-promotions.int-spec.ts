import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  createSecurityApp,
  HttpServer,
  resetDatabase,
  resetThrottle,
  seedAdmin,
  Session,
  toSession,
} from './app-harness';

const API = '/api/v1';
const PHONE = '+573001119999';

interface BotProduct {
  name: string;
  type: string;
  variants: { price: number; promoPrice?: number }[];
  promotion: { discount: string; priceFrom: number } | null;
  ritual: { savings: number } | null;
}

describe('Promociones de productos y kits', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: HttpServer;
  let admin: Session;
  const ids: Record<string, string> = {};
  const apiKey = process.env.CONDUIT_TOOL_API_KEY as string;

  const asAdmin = (method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
    request(server)
      [method](`${API}${path}`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf);

  const asConduit = (path: string) =>
    request(server)
      .get(`${API}${path}`)
      .set('X-API-Key', apiKey)
      .set('X-Conduit-Conversation-Id', 'conversacion-promos')
      .set('X-Conduit-Contact-Phone', PHONE)
      .set('X-Conduit-Idempotency-Key', `promo-${Math.random()}`);

  const window = () => {
    const now = Date.now();
    return {
      startsAt: new Date(now - 3_600_000).toISOString(),
      endsAt: new Date(now + 7 * 86_400_000).toISOString(),
    };
  };

  beforeAll(async () => {
    ({ app, prisma } = await createSecurityApp());
    server = app.getHttpServer() as HttpServer;
    await resetDatabase(prisma.client);
    const db = prisma.client;
    await db.promotion.deleteMany();
    await db.productComboItem.deleteMany();
    await db.productTagAssignment.deleteMany();
    await db.productViewLog.deleteMany();
    await db.treatmentProductRecommendation.deleteMany();
    await db.productVariant.deleteMany();
    await db.product.deleteMany();
    await db.productCategory.deleteMany({ where: { slug: { not: 'combos' } } });
    const care = await db.productCategory.create({
      data: { name: 'Cuidado en casa', slug: 'cuidado-en-casa' },
    });
    const combos = await db.productCategory.upsert({
      where: { slug: 'combos' },
      update: { isActive: true },
      create: { name: 'Combos', slug: 'combos', displayOrder: -1 },
    });
    ids.care = care.id;
    ids.combos = combos.id;
    const variants: Record<string, string> = {};
    for (const [key, price] of Object.entries({
      shampoo: 40000,
      mascarilla: 60000,
    })) {
      const created = await db.product.create({
        data: {
          name: `${key} hidratante`,
          slug: `${key}-hidratante`,
          productCategoryId: care.id,
          variants: {
            create: { brand: 'Leonice', presentation: '300 ml', price },
          },
        },
        include: { variants: true },
      });
      ids[key] = created.id;
      variants[key] = created.variants[0].id;
    }
    const kit = await db.product.create({
      data: {
        name: 'Kit hidratante',
        slug: 'kit-hidratante',
        kind: 'COMBO',
        productCategoryId: combos.id,
        variants: {
          create: {
            brand: 'Leonice',
            presentation: 'Ritual de 2 productos',
            price: 85000,
          },
        },
        comboItems: {
          create: [
            { variantId: variants.shampoo, quantity: 1, position: 0 },
            { variantId: variants.mascarilla, quantity: 1, position: 1 },
          ],
        },
      },
    });
    ids.kit = kit.id;

    await seedAdmin(prisma);
    const login = await request(server)
      .post(`${API}/auth/login`)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    admin = toSession(login.headers['set-cookie']);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetThrottle(app);
  });

  it('el admin crea una promoción para un kit y otra para una categoría de productos', async () => {
    const kit = await asAdmin('post', '/promotions').send({
      name: 'Kits de noviembre',
      discountPercentage: 20,
      productId: ids.kit,
      ...window(),
    });
    expect(kit.status).toBe(201);
    expect(kit.body).toMatchObject({
      productId: ids.kit,
      treatmentId: null,
      product: { name: 'Kit hidratante', kind: 'COMBO' },
    });

    const category = await asAdmin('post', '/promotions').send({
      name: 'Semana del cuidado',
      discountPercentage: 10,
      productCategoryId: ids.care,
      ...window(),
    });
    expect(category.status).toBe(201);
    expect(category.body).toMatchObject({
      productCategory: { name: 'Cuidado en casa' },
    });
  });

  it('no deja dos promociones activas para el mismo kit en las mismas fechas', async () => {
    const res = await asAdmin('post', '/promotions').send({
      name: 'Otra para el kit',
      discountPercentage: 5,
      productId: ids.kit,
      ...window(),
    });
    expect(res.status).toBe(409);
  });

  it('el panel filtra las promociones de productos aparte de las de servicios', async () => {
    const products = await asAdmin('get', '/promotions?domain=PRODUCTS');
    expect((products.body as unknown[]).length).toBe(2);
    const services = await asAdmin('get', '/promotions?domain=SERVICES');
    expect(services.body).toEqual([]);
  });

  it('el bot ve el precio con promoción del kit y de los productos de la categoría', async () => {
    const res = await asConduit('/conduit/products');
    expect(res.status).toBe(200);
    const products = (res.body as { products: BotProduct[] }).products;
    const kit = products.find((p) => p.name === 'Kit hidratante');
    expect(kit).toMatchObject({
      promotion: { discount: '20 %', priceFrom: 68000 },
      ritual: { savings: 22000 },
    });
    const shampoo = products.find((p) => p.name === 'shampoo hidratante');
    expect(shampoo?.variants[0]).toEqual(
      expect.objectContaining({ price: 40000, promoPrice: 36000 }),
    );
  });

  it('promociones_vigentes reúne productos y kits en promoción', async () => {
    const res = await asConduit('/conduit/promotions');
    expect(res.status).toBe(200);
    const names = (
      res.body as { offers: { name: string; type: string }[] }
    ).offers.map((o) => `${o.type}:${o.name}`);
    expect(names).toEqual(
      expect.arrayContaining([
        'kit:Kit hidratante',
        'producto:shampoo hidratante',
        'producto:mascarilla hidratante',
      ]),
    );
  });

  it('al borrar un producto se borran sus promociones', async () => {
    await prisma.client.productComboItem.deleteMany({
      where: { comboProductId: ids.kit },
    });
    await prisma.client.productVariant.deleteMany({
      where: { productId: ids.kit },
    });
    await prisma.client.product.delete({ where: { id: ids.kit } });
    expect(
      await prisma.client.promotion.count({ where: { productId: ids.kit } }),
    ).toBe(0);
  });
});
