import request from 'supertest';
import { API, createE2eApp, E2eContext } from './support/e2e-app';

describe('E2E: salud y arranque (PostgreSQL y Redis reales)', () => {
  let ctx: E2eContext;

  beforeAll(async () => {
    ctx = await createE2eApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('el endpoint de salud responde 200 con la base y Redis conectados', async () => {
    const res = await request(ctx.server).get(`${API}/health`);
    expect(res.status).toBe(200);
  });
});
