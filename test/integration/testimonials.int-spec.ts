import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CloudinaryService } from 'src/infrastructure/cloudinary/cloudinary.service';
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

const json = <T>(res: { body: unknown }) => res.body as T;

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

interface TestimonialBody {
  id: string;
  authorName: string;
  beforeImageUrl: string | null;
  afterImageUrl: string | null;
  isPublished: boolean;
  displayOrder: number;
}

describe('Testimonios: CRUD de administración y lista pública', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: HttpServer;
  let admin: Session;
  let destroyed: string[];

  const valid = {
    authorName: 'M.R.',
    quote: 'Llevaba años sin poder usar el cabello suelto por la caída.',
    treatmentName: 'Terapia anticaída',
    consentConfirmed: true,
  };

  const asAdmin = (method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
    request(server)
      [method](`${API}${path}`)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf);

  const create = async (overrides: Record<string, unknown> = {}) =>
    json<TestimonialBody>(
      await asAdmin('post', '/testimonials').send({ ...valid, ...overrides }),
    );

  beforeAll(async () => {
    ({ app, prisma } = await createSecurityApp());
    server = app.getHttpServer() as HttpServer;
    await resetDatabase(prisma.client);
    await seedAdmin(prisma);
    const login = await request(server)
      .post(`${API}/auth/login`)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    admin = toSession(login.headers['set-cookie']);
    const cloudinary = app.get(CloudinaryService);
    destroyed = [];
    cloudinary.destroyImage = (publicId: string) => {
      destroyed.push(publicId);
      return Promise.resolve();
    };
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    resetThrottle(app);
    destroyed.length = 0;
    await prisma.client.testimonial.deleteMany();
  });

  it('las rutas de administración exigen sesión y la lista pública no', async () => {
    expect((await request(server).get(`${API}/testimonials`)).status).toBe(200);
    for (const [method, path] of [
      ['get', '/testimonials/admin'],
      ['post', '/testimonials'],
      ['post', '/testimonials/reorder'],
    ] as const) {
      expect((await request(server)[method](`${API}${path}`)).status).toBe(401);
    }
  });

  it('crear exige la confirmación de autorización de la clienta', async () => {
    const res = await asAdmin('post', '/testimonials').send({
      ...valid,
      consentConfirmed: false,
    });
    expect(res.status).toBe(400);
    const missing = await asAdmin('post', '/testimonials').send({
      authorName: valid.authorName,
      quote: valid.quote,
      treatmentName: valid.treatmentName,
    });
    expect(missing.status).toBe(400);
  });

  it.each([
    ['autor corto', { authorName: 'M' }],
    ['frase corta', { quote: 'Muy bien' }],
    ['frase enorme', { quote: 'x'.repeat(501) }],
    ['tratamiento vacío', { treatmentName: ' ' }],
  ])('rechaza datos inválidos: %s', async (_label, override) => {
    const res = await asAdmin('post', '/testimonials').send({
      ...valid,
      ...override,
    });
    expect(res.status).toBe(400);
  });

  it('crea con orden consecutivo, publicado por defecto y espacios normalizados', async () => {
    const first = await create({ authorName: '  M.R.   ' });
    const second = await create({ authorName: 'D.C.' });
    expect(first.authorName).toBe('M.R.');
    expect(first.isPublished).toBe(true);
    expect(second.displayOrder).toBe(first.displayOrder + 1);
  });

  it('la lista pública solo muestra publicados y no filtra datos internos', async () => {
    const shown = await create();
    await create({ authorName: 'Oculta', isPublished: false });

    const res = await request(server).get(`${API}/testimonials`);
    const list = json<Record<string, unknown>[]>(res);
    expect(list.map((item) => item.id)).toEqual([shown.id]);
    expect(Object.keys(list[0]).sort()).toEqual([
      'afterImageUrl',
      'authorName',
      'beforeImageUrl',
      'id',
      'quote',
      'treatmentName',
    ]);
    expect(JSON.stringify(res.body)).not.toContain('PublicId');
    expect(JSON.stringify(res.body)).not.toContain('consent');
  });

  it('edita campos y permite ocultar y volver a publicar', async () => {
    const item = await create();
    const hidden = await asAdmin('patch', `/testimonials/${item.id}`).send({
      isPublished: false,
      quote: 'Ahora siento mi cabello fuerte otra vez, gracias.',
    });
    expect(hidden.status).toBe(200);
    expect(
      json<unknown[]>(await request(server).get(`${API}/testimonials`)),
    ).toHaveLength(0);
    await asAdmin('patch', `/testimonials/${item.id}`).send({
      isPublished: true,
    });
    expect(
      json<unknown[]>(await request(server).get(`${API}/testimonials`)),
    ).toHaveLength(1);
  });

  it('un testimonio inexistente responde 404 y un id mal formado 400', async () => {
    const missing = '3f2a8f0e-1b7e-4c58-9a55-2d6f0c1e7a11';
    expect(
      (
        await asAdmin('patch', `/testimonials/${missing}`).send({
          quote: valid.quote,
        })
      ).status,
    ).toBe(404);
    expect((await asAdmin('delete', `/testimonials/${missing}`)).status).toBe(
      404,
    );
    expect((await asAdmin('delete', '/testimonials/no-es-uuid')).status).toBe(
      400,
    );
  });

  describe('fotos de antes y después', () => {
    it('sube cada foto a su espacio y la lista pública las expone', async () => {
      const item = await create();
      const before = await asAdmin(
        'post',
        `/testimonials/${item.id}/images/before`,
      ).attach('image', PNG, { filename: 'a.png', contentType: 'image/png' });
      expect(before.status).toBe(201);
      const after = await asAdmin(
        'post',
        `/testimonials/${item.id}/images/after`,
      ).attach('image', PNG, { filename: 'b.png', contentType: 'image/png' });
      const body = json<TestimonialBody>(after);
      expect(body.beforeImageUrl).toContain('fake.test');
      expect(body.afterImageUrl).toContain('fake.test');
      expect(body.beforeImageUrl).not.toBe(body.afterImageUrl);

      const pub = json<TestimonialBody[]>(
        await request(server).get(`${API}/testimonials`),
      );
      expect(pub[0].beforeImageUrl).toBe(body.beforeImageUrl);
    });

    it('reemplazar una foto borra la anterior de Cloudinary', async () => {
      const item = await create();
      const url = `/testimonials/${item.id}/images/before`;
      await asAdmin('post', url).attach('image', PNG, {
        filename: 'a.png',
        contentType: 'image/png',
      });
      const stored = await prisma.client.testimonial.findUniqueOrThrow({
        where: { id: item.id },
      });
      await asAdmin('post', url).attach('image', PNG, {
        filename: 'a.png',
        contentType: 'image/png',
      });
      expect(destroyed).toEqual([stored.beforeImagePublicId]);
    });

    it('rechaza archivos que no son imagen, espacios inválidos y fotos ausentes', async () => {
      const item = await create();
      const notImage = await asAdmin(
        'post',
        `/testimonials/${item.id}/images/before`,
      ).attach('image', Buffer.from('no soy una imagen'), {
        filename: 'x.png',
        contentType: 'image/png',
      });
      expect(notImage.status).toBe(400);
      const slot = await asAdmin(
        'post',
        `/testimonials/${item.id}/images/lateral`,
      ).attach('image', PNG, { filename: 'a.png', contentType: 'image/png' });
      expect(slot.status).toBe(400);
      expect(
        (await asAdmin('delete', `/testimonials/${item.id}/images/after`))
          .status,
      ).toBe(404);
    });

    it('quitar una foto la borra de Cloudinary y la deja vacía', async () => {
      const item = await create();
      await asAdmin('post', `/testimonials/${item.id}/images/after`).attach(
        'image',
        PNG,
        { filename: 'a.png', contentType: 'image/png' },
      );
      const res = await asAdmin(
        'delete',
        `/testimonials/${item.id}/images/after`,
      );
      expect(res.status).toBe(200);
      expect(json<TestimonialBody>(res).afterImageUrl).toBeNull();
      expect(destroyed).toHaveLength(1);
    });

    it('eliminar el testimonio borra sus dos fotos', async () => {
      const item = await create();
      for (const slot of ['before', 'after']) {
        await asAdmin('post', `/testimonials/${item.id}/images/${slot}`).attach(
          'image',
          PNG,
          { filename: 'a.png', contentType: 'image/png' },
        );
      }
      const res = await asAdmin('delete', `/testimonials/${item.id}`);
      expect(res.status).toBe(204);
      expect(destroyed).toHaveLength(2);
      expect(await prisma.client.testimonial.count()).toBe(0);
    });
  });

  describe('orden', () => {
    it('reordena toda la lista y la lista pública respeta el orden', async () => {
      const a = await create({ authorName: 'A.A.' });
      const b = await create({ authorName: 'B.B.' });
      const c = await create({ authorName: 'C.C.' });
      const res = await asAdmin('post', '/testimonials/reorder').send({
        ids: [c.id, a.id, b.id],
      });
      expect(res.status).toBe(200);
      expect(json<TestimonialBody[]>(res).map((t) => t.id)).toEqual([
        c.id,
        a.id,
        b.id,
      ]);
      const pub = json<TestimonialBody[]>(
        await request(server).get(`${API}/testimonials`),
      );
      expect(pub.map((t) => t.authorName)).toEqual(['C.C.', 'A.A.', 'B.B.']);
    });

    it('rechaza un orden incompleto o con ids ajenos sin tocar nada', async () => {
      const a = await create({ authorName: 'A.A.' });
      const b = await create({ authorName: 'B.B.' });
      const partial = await asAdmin('post', '/testimonials/reorder').send({
        ids: [b.id],
      });
      expect(partial.status).toBe(409);
      const foreign = await asAdmin('post', '/testimonials/reorder').send({
        ids: [b.id, '3f2a8f0e-1b7e-4c58-9a55-2d6f0c1e7a11'],
      });
      expect(foreign.status).toBe(409);
      const duplicated = await asAdmin('post', '/testimonials/reorder').send({
        ids: [a.id, a.id],
      });
      expect(duplicated.status).toBe(400);
      const all = json<TestimonialBody[]>(
        await asAdmin('get', '/testimonials/admin'),
      );
      expect(all.map((t) => t.id)).toEqual([a.id, b.id]);
    });
  });
});
