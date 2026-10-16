import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

const signer = new JwtService();
const jwt = {
  sign: (
    payload: object,
    secret: string,
    options: { expiresIn?: number } = {},
  ) => signer.sign(payload, { secret, ...options }),
};
import request from 'supertest';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import {
  ADMIN_EMAIL,
  bodyOf,
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

describe('S1. Autenticación, expiración, renovación y logout', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: HttpServer;

  beforeAll(async () => {
    ({ app, prisma } = await createSecurityApp());
    server = app.getHttpServer() as HttpServer;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    resetThrottle(app);
    await resetDatabase(prisma.client);
    await seedAdmin(prisma);
  });

  const login = async (password = ADMIN_PASSWORD, email = ADMIN_EMAIL) =>
    request(server).post(`${API}/auth/login`).send({ email, password });

  const loggedIn = async (): Promise<Session> => {
    const res = await login();
    expect(res.status).toBe(201);
    const session = toSession(res.headers['set-cookie']);
    return { ...session };
  };

  const me = (access: string) =>
    request(server)
      .get(`${API}/auth/me`)
      .set('Cookie', `access_token=${access}`);

  const refreshWith = (refresh: string, csrf: string) =>
    request(server)
      .post(`${API}/auth/refresh`)
      .set('Cookie', `refresh_token=${refresh}; csrf_token=${csrf}`)
      .set('X-CSRF-Token', csrf);

  describe('inicio de sesión', () => {
    it('emite cookies HttpOnly, SameSite=Lax y con vigencias de diseño (acceso 15 min, refresh 30 días con path restringido)', async () => {
      const res = await login();
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ email: ADMIN_EMAIL, role: 'ADMIN' });
      expect(JSON.stringify(res.body)).not.toMatch(/token|hash|password/i);

      const cookies = res.headers['set-cookie'] as unknown as string[];
      const access = cookies.find((c) => c.startsWith('access_token='))!;
      const refresh = cookies.find((c) => c.startsWith('refresh_token='))!;
      const csrf = cookies.find((c) => c.startsWith('csrf_token='))!;
      expect(access).toMatch(/HttpOnly/i);
      expect(access).toMatch(/SameSite=Lax/i);
      expect(access).toMatch(/Max-Age=900/);
      expect(refresh).toMatch(/HttpOnly/i);
      expect(refresh).toMatch(/Path=\/api\/v1\/auth\/refresh/);
      expect(refresh).toMatch(/Max-Age=2592000/);
      expect(csrf).not.toMatch(/HttpOnly/i);
    });

    it('en producción las tres cookies llevan el atributo Secure', async () => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const res = await login();
        const cookies = res.headers['set-cookie'] as unknown as string[];
        expect(cookies).toHaveLength(3);
        for (const cookie of cookies) expect(cookie).toMatch(/;\s*Secure/i);
      } finally {
        process.env.NODE_ENV = previous;
      }
    });

    it('credenciales inválidas y usuario inexistente responden igual (sin enumeración de cuentas)', async () => {
      const wrongPassword = await login('incorrecta');
      const unknownUser = await login('incorrecta', 'nadie@leonice.test');
      expect(wrongPassword.status).toBe(401);
      expect(unknownUser.status).toBe(401);
      expect(bodyOf(wrongPassword).message).toBe(bodyOf(unknownUser).message);
      expect(bodyOf(wrongPassword).code).toBe(bodyOf(unknownUser).code);
    });

    it('una cuenta bloqueada no revela su existencia: el mensaje es idéntico al de credenciales inválidas', async () => {
      for (let i = 0; i < 5; i++) await login('incorrecta');
      resetThrottle(app);
      const locked = await login(ADMIN_PASSWORD);
      const unknownUser = await login('incorrecta', 'nadie@leonice.test');
      expect(locked.status).toBe(401);
      expect(bodyOf(locked).message).toBe(bodyOf(unknownUser).message);
    });

    it('5 intentos fallidos bloquean la cuenta aun con la contraseña correcta, y el bloqueo expira', async () => {
      for (let i = 0; i < 5; i++) await login('incorrecta');
      resetThrottle(app);
      expect((await login(ADMIN_PASSWORD)).status).toBe(401);

      await prisma.client.user.updateMany({
        data: { lockedUntil: new Date(Date.now() - 1000) },
      });
      const ok = await login(ADMIN_PASSWORD);
      expect(ok.status).toBe(201);
      const user = await prisma.client.user.findFirstOrThrow();
      expect(user.failedLoginAttempts).toBe(0);
      expect(user.lockedUntil).toBeNull();
    });

    it('guarda la contraseña con argon2id y nunca la devuelve', async () => {
      const user = await prisma.client.user.findFirstOrThrow();
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.passwordHash).not.toContain(ADMIN_PASSWORD);
    });

    it('una cuenta desactivada no puede iniciar sesión', async () => {
      await prisma.client.user.updateMany({ data: { isActive: false } });
      expect((await login()).status).toBe(401);
    });

    it('rechaza cuerpos malformados sin llegar a la verificación', async () => {
      for (const body of [
        {},
        { email: 'x' },
        { email: ADMIN_EMAIL },
        { email: ADMIN_EMAIL, password: 123 },
        { email: { $ne: null }, password: { $ne: null } },
      ]) {
        const res = await request(server).post(`${API}/auth/login`).send(body);
        expect(res.status).toBe(400);
      }
    });
  });

  describe('token de acceso', () => {
    it('/auth/me responde con el usuario y sin datos sensibles', async () => {
      const s = await loggedIn();
      const res = await me(s.access);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual([
        'email',
        'id',
        'isActive',
        'role',
      ]);
    });

    it('sin cookie, con token basura, con firma ajena o con alg=none responde 401', async () => {
      expect((await request(server).get(`${API}/auth/me`)).status).toBe(401);
      expect((await me('basura')).status).toBe(401);

      const user = await prisma.client.user.findFirstOrThrow();
      const foreign = jwt.sign(
        { sub: user.id, email: user.email, role: 'ADMIN' },
        'otra-clave-distinta-de-32-caracteres!!',
      );
      expect((await me(foreign)).status).toBe(401);

      const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, role: 'ADMIN', exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url')}.`;
      expect((await me(none)).status).toBe(401);
    });

    it('un token de acceso vencido responde 401', async () => {
      const user = await prisma.client.user.findFirstOrThrow();
      const expired = jwt.sign(
        { sub: user.id, email: user.email, role: 'ADMIN' },
        process.env.JWT_SECRET as string,
        { expiresIn: -10 },
      );
      expect((await me(expired)).status).toBe(401);
    });

    it('un token firmado correctamente pero sin la versión de sesión vigente responde 401', async () => {
      const user = await prisma.client.user.findFirstOrThrow();
      const stale = jwt.sign(
        {
          sub: user.id,
          email: user.email,
          role: 'ADMIN',
          sv: user.sessionVersion + 1,
        },
        process.env.JWT_SECRET as string,
        { expiresIn: 600 },
      );
      const missing = jwt.sign(
        { sub: user.id, email: user.email, role: 'ADMIN' },
        process.env.JWT_SECRET as string,
        { expiresIn: 600 },
      );
      expect((await me(stale)).status).toBe(401);
      expect((await me(missing)).status).toBe(401);
    });

    it('el token de refresh no sirve como token de acceso', async () => {
      const s = await loggedIn();
      expect((await me(s.refresh)).status).toBe(401);
    });

    it('el rol sale de la base de datos, no del token', async () => {
      const user = await prisma.client.user.findFirstOrThrow();
      const forged = jwt.sign(
        {
          sub: user.id,
          email: 'otro@x.test',
          role: 'SUPERADMIN',
          sv: user.sessionVersion,
        },
        process.env.JWT_SECRET as string,
        { expiresIn: 600 },
      );
      const res = await me(forged);
      expect(res.status).toBe(200);
      expect(bodyOf(res).role).toBe('ADMIN');
      expect(bodyOf(res).email).toBe(ADMIN_EMAIL);
    });

    it('desactivar al usuario corta el acceso de inmediato aunque el token siga vigente', async () => {
      const s = await loggedIn();
      expect((await me(s.access)).status).toBe(200);
      await prisma.client.user.updateMany({ data: { isActive: false } });
      expect((await me(s.access)).status).toBe(401);
    });
  });

  describe('renovación de sesión', () => {
    const expireGrace = () =>
      prisma.client.user.updateMany({
        data: { refreshRotatedAt: new Date(Date.now() - 5 * 60_000) },
      });

    it('rota el refresh token: el nuevo funciona y, pasado el margen de gracia, el anterior queda inválido', async () => {
      const s = await loggedIn();
      const res = await refreshWith(s.refresh, s.csrf);
      expect(res.status).toBe(201);
      const renewed = toSession(res.headers['set-cookie']);
      expect(renewed.refresh).not.toBe(s.refresh);
      expect((await me(renewed.access)).status).toBe(200);

      await expireGrace();
      const replay = await refreshWith(s.refresh, s.csrf);
      expect(replay.status).toBe(401);
    });

    it('dentro del margen de gracia el refresh anterior solo obtiene un nuevo acceso, sin rotar ni emitir otro refresh', async () => {
      const s = await loggedIn();
      const first = await refreshWith(s.refresh, s.csrf);
      const renewed = toSession(first.headers['set-cookie']);
      const late = await refreshWith(s.refresh, s.csrf);
      expect(late.status).toBe(201);
      const cookies = (late.headers['set-cookie'] as unknown as string[]).join(
        '|',
      );
      expect(cookies).toMatch(/access_token=/);
      expect(cookies).not.toMatch(/refresh_token=/);
      expect((await refreshWith(renewed.refresh, renewed.csrf)).status).toBe(
        201,
      );
    });

    it('reutilizar un refresh ya rotado fuera del margen de gracia revoca toda la sesión (detección de robo), incluido el acceso vigente', async () => {
      const s = await loggedIn();
      const renewed = toSession(
        (await refreshWith(s.refresh, s.csrf)).headers['set-cookie'],
      );
      await expireGrace();

      expect((await refreshWith(s.refresh, s.csrf)).status).toBe(401);
      expect((await refreshWith(renewed.refresh, renewed.csrf)).status).toBe(
        401,
      );
      expect((await me(renewed.access)).status).toBe(401);
    });

    it('dos pestañas que renuevan a la vez con el mismo refresh no deben cerrar la sesión legítima', async () => {
      const s = await loggedIn();
      const [a, b] = await Promise.all([
        refreshWith(s.refresh, s.csrf),
        refreshWith(s.refresh, s.csrf),
      ]);
      const winners = [a, b].filter((r) => r.status === 201);
      expect(winners).toHaveLength(2);
      const user = await prisma.client.user.findFirstOrThrow();
      expect(user.refreshTokenHash).not.toBeNull();
      const finalSession = toSession(
        [a, b].flatMap(
          (r) => (r.headers['set-cookie'] as unknown as string[]) ?? [],
        ),
      );
      expect((await me(finalSession.access)).status).toBe(200);
    });

    it('exige el token CSRF y un refresh cookie válido', async () => {
      const s = await loggedIn();
      const noCsrf = await request(server)
        .post(`${API}/auth/refresh`)
        .set('Cookie', `refresh_token=${s.refresh}`);
      expect(noCsrf.status).toBe(403);
      const noCookie = await request(server)
        .post(`${API}/auth/refresh`)
        .set('Cookie', `csrf_token=${s.csrf}`)
        .set('X-CSRF-Token', s.csrf);
      expect(noCookie.status).toBe(401);
    });

    it('un refresh vencido o manipulado responde 401', async () => {
      const s = await loggedIn();
      const user = await prisma.client.user.findFirstOrThrow();
      const expired = jwt.sign(
        { sub: user.id },
        process.env.JWT_REFRESH_SECRET as string,
        { expiresIn: -10 },
      );
      expect((await refreshWith(expired, s.csrf)).status).toBe(401);
      expect((await refreshWith(`${s.refresh}x`, s.csrf)).status).toBe(401);
      const signedWithAccessSecret = jwt.sign(
        { sub: user.id },
        process.env.JWT_SECRET as string,
        { expiresIn: 600 },
      );
      expect((await refreshWith(signedWithAccessSecret, s.csrf)).status).toBe(
        401,
      );
    });

    it('una cuenta desactivada no puede renovar', async () => {
      const s = await loggedIn();
      await prisma.client.user.updateMany({ data: { isActive: false } });
      expect((await refreshWith(s.refresh, s.csrf)).status).toBe(401);
    });
  });

  describe('logout y cambio de contraseña', () => {
    const logout = (s: Session) =>
      request(server)
        .post(`${API}/auth/logout`)
        .set('Cookie', s.cookie)
        .set('X-CSRF-Token', s.csrf);

    it('logout exige sesión y token CSRF', async () => {
      const s = await loggedIn();
      expect((await request(server).post(`${API}/auth/logout`)).status).toBe(
        401,
      );
      expect(
        (
          await request(server)
            .post(`${API}/auth/logout`)
            .set('Cookie', s.cookie)
        ).status,
      ).toBe(403);
    });

    it('logout borra las cookies y revoca el refresh token', async () => {
      const s = await loggedIn();
      const res = await logout(s);
      expect(res.status).toBe(201);
      const cleared = res.headers['set-cookie'] as unknown as string[];
      expect(cleared.join('|')).toMatch(/access_token=;/);
      expect(cleared.join('|')).toMatch(/refresh_token=;/);

      expect((await refreshWith(s.refresh, s.csrf)).status).toBe(401);
      const user = await prisma.client.user.findFirstOrThrow();
      expect(user.refreshTokenHash).toBeNull();
    });

    it('tras el logout el token de acceso anterior deja de funcionar', async () => {
      const s = await loggedIn();
      expect((await me(s.access)).status).toBe(200);
      await logout(s);
      expect((await me(s.access)).status).toBe(401);
    });

    it('cambiar la contraseña revoca el refresh y exige la contraseña actual y una nueva fuerte', async () => {
      const s = await loggedIn();
      const change = (body: object) =>
        request(server)
          .patch(`${API}/auth/password`)
          .set('Cookie', s.cookie)
          .set('X-CSRF-Token', s.csrf)
          .send(body);

      expect(
        (
          await change({
            currentPassword: 'mala',
            newPassword: 'Nueva#Clave-456',
          })
        ).status,
      ).toBeGreaterThanOrEqual(400);
      expect(
        (
          await change({
            currentPassword: ADMIN_PASSWORD,
            newPassword: 'debil',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await change({
            currentPassword: ADMIN_PASSWORD,
            newPassword: ADMIN_PASSWORD,
          })
        ).status,
      ).toBeGreaterThanOrEqual(400);

      const ok = await change({
        currentPassword: ADMIN_PASSWORD,
        newPassword: 'Nueva#Clave-456',
      });
      expect(ok.status).toBe(200);
      const continued = toSession(ok.headers['set-cookie']);
      expect((await me(continued.access)).status).toBe(200);
      expect((await refreshWith(s.refresh, s.csrf)).status).toBe(401);
      expect((await login(ADMIN_PASSWORD)).status).toBe(401);
      expect((await login('Nueva#Clave-456')).status).toBe(201);
    });

    it('tras cambiar la contraseña el token de acceso anterior deja de funcionar', async () => {
      const s = await loggedIn();
      await request(server)
        .patch(`${API}/auth/password`)
        .set('Cookie', s.cookie)
        .set('X-CSRF-Token', s.csrf)
        .send({
          currentPassword: ADMIN_PASSWORD,
          newPassword: 'Nueva#Clave-456',
        });
      expect((await me(s.access)).status).toBe(401);
    });
  });

  describe('CSRF', () => {
    it('toda mutación privada exige cabecera X-CSRF-Token igual a la cookie', async () => {
      const s = await loggedIn();
      const target = `${API}/business-settings`;
      const base = () =>
        request(server).put(target).set('Cookie', s.cookie).send({});
      expect((await base()).status).toBe(403);
      expect((await base().set('X-CSRF-Token', 'otro')).status).toBe(403);
      const withToken = await base().set('X-CSRF-Token', s.csrf);
      expect(withToken.status).not.toBe(403);
      expect(withToken.status).not.toBe(401);
    });

    it('las lecturas (GET) no exigen CSRF y siguen requiriendo sesión', async () => {
      const s = await loggedIn();
      expect(
        (
          await request(server)
            .get(`${API}/business-settings`)
            .set('Cookie', s.cookie)
        ).status,
      ).toBe(200);
      expect(
        (await request(server).get(`${API}/business-settings`)).status,
      ).toBe(401);
    });
  });

  it('JwtService de la aplicación usa secretos distintos para acceso y refresh', () => {
    expect(process.env.JWT_SECRET).toBeTruthy();
    expect(process.env.JWT_REFRESH_SECRET).toBeTruthy();
    expect(process.env.JWT_SECRET).not.toBe(process.env.JWT_REFRESH_SECRET);
    expect((process.env.JWT_SECRET as string).length).toBeGreaterThanOrEqual(
      32,
    );
    expect(
      (process.env.JWT_REFRESH_SECRET as string).length,
    ).toBeGreaterThanOrEqual(32);
    expect(app.get(JwtService)).toBeDefined();
  });
});
