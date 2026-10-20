import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { createSecurityApp, HttpServer, resetDatabase } from './app-harness';

const API = '/api/v1';

describe('Catálogo: el orden curado de los tratamientos se respeta en todas las vistas públicas', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: HttpServer;

  beforeAll(async () => {
    ({ app, prisma } = await createSecurityApp());
    server = app.getHttpServer() as HttpServer;
    await resetDatabase(prisma.client);
    const category = await prisma.client.category.create({
      data: { name: 'Orden', slug: 'orden', showOnWebsite: true },
    });
    const treatments = [
      { slug: 'zeta-primero', displayOrder: 0 },
      { slug: 'alfa-tercero', displayOrder: 2 },
      { slug: 'beta-segundo', displayOrder: 1 },
    ];
    for (const { slug, displayOrder } of treatments) {
      await prisma.client.treatment.create({
        data: {
          categoryId: category.id,
          name: slug,
          slug,
          displayOrder,
          basePriceMin: 100,
          basePriceMax: 100,
          baseDurationMinMinutes: 60,
          baseDurationMaxMinutes: 60,
        },
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /treatments devuelve primero el de menor orden de visualización y desempata por nombre', async () => {
    const res = await request(server).get(`${API}/treatments`);
    expect(res.status).toBe(200);
    const names = (res.body as { name: string }[]).map((t) => t.name);
    expect(names).toEqual(['zeta-primero', 'beta-segundo', 'alfa-tercero']);
  });

  it('el escaparate de la categoría usa el mismo orden', async () => {
    const res = await request(server).get(`${API}/showcase/categories/orden`);
    expect(res.status).toBe(200);
    const slugs = (
      res.body as { treatments: { slug: string }[] }
    ).treatments.map((t) => t.slug);
    expect(slugs).toEqual(['zeta-primero', 'beta-segundo', 'alfa-tercero']);
  });
});
