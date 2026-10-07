import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

const context = {
  getHandler: () => undefined,
  getClass: () => undefined,
} as unknown as ExecutionContext;

const guardFor = (isPublic: boolean) =>
  new JwtAuthGuard({
    getAllAndOverride: () => isPublic,
  } as unknown as Reflector);

describe('JwtAuthGuard.handleRequest', () => {
  const admin = { id: 'u1', role: 'ADMIN' };

  it('ruta pública con sesión válida: adjunta el usuario', () => {
    expect(guardFor(true).handleRequest(null, admin, undefined, context)).toBe(
      admin,
    );
  });

  it('ruta pública sin sesión: sigue como anónimo sin lanzar', () => {
    expect(
      guardFor(true).handleRequest(null, false, undefined, context),
    ).toBeUndefined();
  });

  it('ruta pública con sesión inválida: ignora el error', () => {
    expect(
      guardFor(true).handleRequest(
        new UnauthorizedException(),
        false,
        undefined,
        context,
      ),
    ).toBeUndefined();
  });

  it('ruta protegida sin sesión: 401', () => {
    expect(() =>
      guardFor(false).handleRequest(null, false, undefined, context),
    ).toThrow(UnauthorizedException);
  });

  it('ruta protegida con sesión válida: devuelve el usuario', () => {
    expect(guardFor(false).handleRequest(null, admin, undefined, context)).toBe(
      admin,
    );
  });
});
