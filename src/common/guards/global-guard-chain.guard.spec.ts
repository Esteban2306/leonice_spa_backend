import { CanActivate, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { CsrfGuard } from '../../auth/guards/csrf.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ClientThrottlerGuard } from '../../reservations/guards/client-throttler.guard';
import { GlobalGuardChain } from './global-guard-chain.guard';

interface FakeRequest {
  user?: { role: string };
}

const buildContext = (request: FakeRequest): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const fakeGuard = (
  name: string,
  calls: string[],
  behavior: (request: FakeRequest) => ReturnType<CanActivate['canActivate']>,
): CanActivate => ({
  canActivate: (context: ExecutionContext) => {
    calls.push(name);
    return behavior(context.switchToHttp().getRequest<FakeRequest>());
  },
});

const buildChain = (guards: {
  jwt: CanActivate;
  roles: CanActivate;
  csrf: CanActivate;
  throttler: CanActivate;
}) =>
  new GlobalGuardChain(
    guards.jwt as unknown as JwtAuthGuard,
    guards.roles as unknown as RolesGuard,
    guards.csrf as unknown as CsrfGuard,
    guards.throttler as unknown as ClientThrottlerGuard,
  );

describe('GlobalGuardChain', () => {
  it('ejecuta auth → roles → csrf → throttler en ese orden', async () => {
    const calls: string[] = [];
    const chain = buildChain({
      jwt: fakeGuard('jwt', calls, () => true),
      roles: fakeGuard('roles', calls, () => Promise.resolve(true)),
      csrf: fakeGuard('csrf', calls, () => of(true)),
      throttler: fakeGuard('throttler', calls, () => true),
    });

    await expect(chain.canActivate(buildContext({}))).resolves.toBe(true);
    expect(calls).toEqual(['jwt', 'roles', 'csrf', 'throttler']);
  });

  it('el throttler ve el usuario que resolvió el guard de autenticación', async () => {
    const calls: string[] = [];
    let roleSeenByThrottler: string | undefined;
    const chain = buildChain({
      jwt: fakeGuard('jwt', calls, (req) => {
        req.user = { role: 'ADMIN' };
        return true;
      }),
      roles: fakeGuard('roles', calls, () => true),
      csrf: fakeGuard('csrf', calls, () => true),
      throttler: fakeGuard('throttler', calls, (req) => {
        roleSeenByThrottler = req.user?.role;
        return true;
      }),
    });

    await chain.canActivate(buildContext({}));
    expect(roleSeenByThrottler).toBe('ADMIN');
  });

  it('corta la cadena en el primer guard que niega', async () => {
    const calls: string[] = [];
    const chain = buildChain({
      jwt: fakeGuard('jwt', calls, () => true),
      roles: fakeGuard('roles', calls, () => false),
      csrf: fakeGuard('csrf', calls, () => true),
      throttler: fakeGuard('throttler', calls, () => true),
    });

    await expect(chain.canActivate(buildContext({}))).resolves.toBe(false);
    expect(calls).toEqual(['jwt', 'roles']);
  });

  it('propaga la excepción de un guard sin ejecutar los siguientes', async () => {
    const calls: string[] = [];
    const chain = buildChain({
      jwt: fakeGuard('jwt', calls, () => true),
      roles: fakeGuard('roles', calls, () => true),
      csrf: fakeGuard('csrf', calls, () => {
        throw new Error('csrf inválido');
      }),
      throttler: fakeGuard('throttler', calls, () => true),
    });

    await expect(chain.canActivate(buildContext({}))).rejects.toThrow(
      'csrf inválido',
    );
    expect(calls).toEqual(['jwt', 'roles', 'csrf']);
  });
});
