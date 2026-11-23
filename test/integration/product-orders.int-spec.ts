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
const PHONE = '+573001118888';
const OTHER_PHONE = '+573001117777';
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

describe('Pedidos de productos: del chat al panel', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: HttpServer;
  let admin: Session;
  let orderId = '';
  const apiKey = process.env.CONDUIT_TOOL_API_KEY as string;

  const asConduit = (method: 'get' | 'post', path: string, phone = PHONE) =>
    request(server)
      [method](`${API}${path}`)
      .set('X-API-Key', apiKey)
      .set('X-Conduit-Conversation-Id', `conversacion-${phone}`)
      .set('X-Conduit-Contact-Phone', phone)
      .set('X-Conduit-Idempotency-Key', `pedido-${Math.random()}`);

  const asAdmin = (method: 'get' | 'patch', path: string) =>
    request(server)
      [method](`${API}${path}`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf);

  beforeAll(async () => {
    ({ app, prisma } = await createSecurityApp());
    server = app.getHttpServer() as HttpServer;
    await resetDatabase(prisma.client);
    const db = prisma.client;
    await db.productOrderItem.deleteMany();
    await db.productOrder.deleteMany();
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
    const kit = await db.product.create({
      data: {
        name: 'Ritual Jolly Kids',
        slug: 'ritual-jolly-kids',
        productCategoryId: care.id,
        variants: {
          create: { brand: 'Amazônica', presentation: 'Ritual', price: 245000 },
        },
      },
    });
    const now = Date.now();
    await db.promotion.create({
      data: {
        name: 'Kits con 20 %',
        discountPercentage: 20,
        startsAt: new Date(now - 3_600_000),
        endsAt: new Date(now + 86_400_000),
        productId: kit.id,
      },
    });
    await db.businessSettings.upsert({
      where: { id: 'default' },
      update: { productPaymentInstructions: 'Nequi 310 000 1122' },
      create: {
        id: 'default',
        productPaymentInstructions: 'Nequi 310 000 1122',
      },
    });
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

  it('el bot crea el pedido con el precio de promoción, el total y la cuenta de pago', async () => {
    const res = await asConduit(
      'post',
      '/conduit/products/purchase-request',
    ).send({
      items: [{ producto: 'kit jolly kids', cantidad: 2 }],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      requested: true,
      updated: false,
      orderCode: expect.stringMatching(/^P-\d{4}$/) as unknown,
      total: '$392.000',
      paymentInstructions: 'Nequi 310 000 1122',
    });
  });

  it('si la clienta cambia el pedido se actualiza el mismo, sin crear otro', async () => {
    const res = await asConduit(
      'post',
      '/conduit/products/purchase-request',
    ).send({
      items: [{ producto: 'Ritual Jolly Kids', cantidad: 1 }],
    });
    expect(res.body).toMatchObject({ updated: true, total: '$196.000' });
    expect(await prisma.client.productOrder.count()).toBe(1);
  });

  it('depositos_pendientes cuenta que tiene un pedido abierto aunque no esté registrada', async () => {
    const res = await asConduit('get', '/deposits/pending');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      candidates: [],
      openProductOrder: { status: 'PENDIENTE_PAGO', total: '$196.000' },
    });
  });

  it('el comprobante deja el pedido por verificar y compara el monto', async () => {
    const res = await asConduit('post', '/conduit/product-orders/payment').send(
      {
        imageBase64: PNG,
        montoComprobante: 196000,
      },
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, amountMatches: true });
    const order = await prisma.client.productOrder.findFirstOrThrow();
    orderId = order.id;
    expect(order.status).toBe('PAGO_EN_REVISION');
    expect(order.proofImageUrl).toBe(`https://fake.test/${order.id}.jpg`);
  });

  it('otra clienta sin pedido recibe la pista de qué hacer y nada se sube', async () => {
    const res = await asConduit(
      'post',
      '/conduit/product-orders/payment',
      OTHER_PHONE,
    ).send({ imageBase64: PNG });
    expect(res.body).toMatchObject({ expected: true, code: 'NO_OPEN_ORDER' });
  });

  it('el panel lo muestra por verificar y lo verifica con un clic', async () => {
    const summary = await asAdmin('get', '/product-orders/summary');
    expect(summary.body).toMatchObject({ toVerify: 1 });
    const list = await asAdmin(
      'get',
      '/product-orders?status=PAGO_EN_REVISION',
    );
    expect((list.body as { items: unknown[] }).items[0]).toMatchObject({
      id: orderId,
      amountMatches: true,
    });
    const verified = await asAdmin(
      'patch',
      `/product-orders/${orderId}/verify-payment`,
    );
    expect(verified.status).toBe(200);
    expect((verified.body as { status: string }).status).toBe('PAGADO');
    const delivered = await asAdmin(
      'patch',
      `/product-orders/${orderId}/deliver`,
    );
    expect((delivered.body as { status: string }).status).toBe('ENTREGADO');
  });

  it('sin sesión de administrador no se ven los pedidos', async () => {
    const res = await request(server).get(`${API}/product-orders`);
    expect(res.status).toBe(401);
  });
});
