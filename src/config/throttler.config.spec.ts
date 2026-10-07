import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isSafeMethod, shouldSkipThrottle } from './throttler.config';

interface FakeRequest {
  method: string;
  headers: Record<string, string>;
  user?: { role: string };
}

const buildContext = (request: Partial<FakeRequest>): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', headers: {}, ...request }),
    }),
  }) as unknown as ExecutionContext;

const config = {
  get: (key: string) =>
    key === 'CONDUIT_TOOL_API_KEY' ? 'conduit-key' : undefined,
} as unknown as ConfigService;

describe('throttler skip rules', () => {
  describe('shouldSkipThrottle', () => {
    it('exime a un administrador autenticado', () => {
      expect(
        shouldSkipThrottle(buildContext({ user: { role: 'ADMIN' } }), config),
      ).toBe(true);
    });

    it('exime a Conduit con API key válida', () => {
      expect(
        shouldSkipThrottle(
          buildContext({ headers: { 'x-api-key': 'conduit-key' } }),
          config,
        ),
      ).toBe(true);
    });

    it('no exime a un anónimo ni a una API key incorrecta', () => {
      expect(shouldSkipThrottle(buildContext({}), config)).toBe(false);
      expect(
        shouldSkipThrottle(
          buildContext({ headers: { 'x-api-key': 'otra' } }),
          config,
        ),
      ).toBe(false);
    });
  });

  describe('isSafeMethod', () => {
    it.each(['GET', 'HEAD', 'OPTIONS', 'get'])('%s es lectura', (method) => {
      expect(isSafeMethod(buildContext({ method }))).toBe(true);
    });

    it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('%s es escritura', (method) => {
      expect(isSafeMethod(buildContext({ method }))).toBe(false);
    });
  });
});
