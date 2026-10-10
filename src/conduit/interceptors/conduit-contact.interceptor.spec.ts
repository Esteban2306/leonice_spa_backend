import { Reflector } from '@nestjs/core';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import {
  ConduitContactInterceptor,
  type RequestWithConduitContact,
} from './conduit-contact.interceptor';
import { AppException } from '../../common/errors/app.exception';

function run(
  req: Partial<RequestWithConduitContact>,
  options: { requiresVerifiedContact?: boolean } = {},
) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(options),
  } as unknown as Reflector;
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  const next: CallHandler = { handle: () => of('ok') };
  return new ConduitContactInterceptor(reflector).intercept(context, next);
}

describe('ConduitContactInterceptor', () => {
  it('reemplaza el teléfono del cuerpo por el verificado del chat', () => {
    const req = {
      headers: { 'x-conduit-contact-phone': '+573001112233' },
      body: { phone: '3009999999', client: { phone: '3009999999', name: 'X' } },
      query: {},
    } as unknown as RequestWithConduitContact;

    run(req);

    const body = req.body as { phone: string; client: { phone: string } };
    expect(body.phone).toBe('+573001112233');
    expect(body.client.phone).toBe('+573001112233');
    expect(req.conduitContact).toEqual({ phone: '+573001112233', lid: null });
  });

  it('rechaza una consulta por query con otro teléfono', () => {
    const req = {
      headers: { 'x-conduit-contact-phone': '+573001112233' },
      body: undefined,
      query: { phone: '+573009999999' },
    } as unknown as RequestWithConduitContact;

    expect(() => run(req)).toThrow(AppException);
  });

  it('acepta la query si es el mismo número en otro formato', () => {
    const req = {
      headers: { 'x-conduit-contact-phone': '+573001112233' },
      query: { phone: '3001112233' },
    } as unknown as RequestWithConduitContact;

    expect(() => run(req)).not.toThrow();
  });

  it('chat solo con LID: bloquea herramientas sobre clientes existentes', () => {
    const req = {
      headers: { 'x-conduit-contact-lid': '123456789012345' },
      body: { phone: '3001112233' },
      query: {},
    } as unknown as RequestWithConduitContact;

    expect(() => run(req, { requiresVerifiedContact: true })).toThrow(
      AppException,
    );
  });

  it('chat solo con LID: permite herramientas de catálogo o nueva reserva', () => {
    const req = {
      headers: { 'x-conduit-contact-lid': '123456789012345' },
      body: { phone: '3001112233' },
      query: {},
    } as unknown as RequestWithConduitContact;

    expect(() => run(req)).not.toThrow();
    expect((req.body as { phone: string }).phone).toBe('3001112233');
  });
});
