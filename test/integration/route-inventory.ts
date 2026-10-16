import { INestApplication, RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  PATH_METADATA,
  VERSION_METADATA,
} from '@nestjs/common/constants';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from 'src/auth/decorators/public.decorator';
import { SKIP_CSRF_KEY } from 'src/auth/decorators/skip-csrf.decorator';
import { ROLES_KEY } from 'src/auth/decorators/roles.decorator';
import { CONDUIT_TOOL_OPTIONS } from 'src/conduit/interceptors/conduit-contact.interceptor';

export interface RouteInfo {
  method: string;
  template: string;
  url: string;
  isPublic: boolean;
  skipCsrf: boolean;
  roles: string[] | undefined;
  isConduitTool: boolean;
  controller: string;
}

const METHOD_NAMES: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
};

const join = (...parts: (string | undefined)[]) =>
  '/' +
  parts
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');

export const SAMPLE_UUID = '00000000-0000-4000-8000-000000000001';

export function collectRoutes(app: INestApplication): RouteInfo[] {
  const discovery = app.get(DiscoveryService);
  const reflector = app.get(Reflector);
  const routes: RouteInfo[] = [];

  for (const wrapper of discovery.getControllers()) {
    const metatype = wrapper.metatype as
      (new (...args: never[]) => object) | null;
    if (!metatype) continue;
    const prefix = Reflect.getMetadata(PATH_METADATA, metatype) as
      string | undefined;
    const version =
      (Reflect.getMetadata(VERSION_METADATA, metatype) as string | undefined) ??
      '1';
    for (const name of Object.getOwnPropertyNames(metatype.prototype)) {
      if (name === 'constructor') continue;
      const handler = (metatype.prototype as Record<string, unknown>)[name];
      if (typeof handler !== 'function') continue;
      const methodCode = Reflect.getMetadata(METHOD_METADATA, handler) as
        number | undefined;
      if (methodCode === undefined) continue;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as
        string | undefined;
      const template = join('api', `v${version}`, prefix, path);
      const targets = [handler, metatype];
      routes.push({
        method: METHOD_NAMES[methodCode] ?? String(methodCode),
        template,
        url: template.replace(/:[A-Za-z]+/g, SAMPLE_UUID),
        isPublic:
          reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) === true,
        skipCsrf:
          reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, targets) === true,
        roles: reflector.getAllAndOverride<string[] | undefined>(
          ROLES_KEY,
          targets,
        ),
        isConduitTool:
          reflector.getAllAndOverride(CONDUIT_TOOL_OPTIONS, targets) !==
          undefined,
        controller: metatype.name,
      });
    }
  }
  return routes.sort((a, b) =>
    (a.template + a.method).localeCompare(b.template + b.method),
  );
}
