import { applyDecorators, UseGuards, UseInterceptors } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator';
import { SkipCsrf } from '../../auth/decorators/skip-csrf.decorator';
import { ConduitToolAuthGuard } from '../guards/conduit-tool-auth.guard';
import {
  ConduitContactInterceptor,
  ConduitToolOptionsMeta,
  type ConduitToolOptions,
} from '../interceptors/conduit-contact.interceptor';

/**
 * Marca una ruta (o controlador) como herramienta del bot de Conduit.
 * Conduit solo envía `X-API-Key`: sin JWT ni cookie CSRF, por lo que la
 * ruta debe salir de la cadena global de sesión y quedar protegida
 * únicamente por `ConduitToolAuthGuard`. Además se impone el teléfono
 * verificado del chat (ver ConduitContactInterceptor).
 */
export const ConduitTool = (options: ConduitToolOptions = {}) =>
  applyDecorators(
    Public(),
    SkipCsrf(),
    UseGuards(ConduitToolAuthGuard),
    ConduitToolOptionsMeta(options),
    UseInterceptors(ConduitContactInterceptor),
  );
