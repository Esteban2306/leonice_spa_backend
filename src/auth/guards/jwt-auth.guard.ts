import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Rutas protegidas: exige sesión válida (401 si no).
 * Rutas @Public(): identifica al usuario si trae una sesión válida (para que los
 * guards siguientes, p. ej. el throttler, sepan que es un admin) pero nunca rechaza:
 * sin sesión o con sesión inválida la petición sigue como anónima.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.isPublic(context)) {
      return (await super.canActivate(context)) as boolean;
    }

    try {
      await super.canActivate(context);
    } catch {
      // Ruta pública: una sesión ausente o inválida no bloquea, solo deja al usuario anónimo.
    }
    return true;
  }

  handleRequest<TUser>(
    err: unknown,
    user: unknown,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (this.isPublic(context)) {
      return (user || undefined) as TUser;
    }
    return super.handleRequest<TUser>(err, user, info, context);
  }

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }
}
