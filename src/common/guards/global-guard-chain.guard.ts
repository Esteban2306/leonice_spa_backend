import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { isObservable, lastValueFrom } from 'rxjs';
import { CsrfGuard } from '../../auth/guards/csrf.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ClientThrottlerGuard } from '../../reservations/guards/client-throttler.guard';

/**
 * Único guard global de la aplicación. Ejecuta la cadena en un orden explícito
 * en vez de depender del orden en que Nest recorre los módulos con APP_GUARD:
 *
 *   1. JwtAuthGuard        → identifica al usuario (req.user)
 *   2. RolesGuard          → autoriza según @Roles
 *   3. CsrfGuard           → valida doble cookie en métodos no seguros
 *   4. ClientThrottlerGuard → rate limit; necesita req.user para eximir a admins
 *
 * La cadena se corta en el primer guard que niegue o lance.
 */
@Injectable()
export class GlobalGuardChain implements CanActivate {
  private readonly chain: readonly CanActivate[];

  constructor(
    jwtAuthGuard: JwtAuthGuard,
    rolesGuard: RolesGuard,
    csrfGuard: CsrfGuard,
    throttlerGuard: ClientThrottlerGuard,
  ) {
    this.chain = [jwtAuthGuard, rolesGuard, csrfGuard, throttlerGuard];
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    for (const guard of this.chain) {
      const result = guard.canActivate(context);
      const allowed = isObservable(result)
        ? await lastValueFrom(result)
        : await result;
      if (!allowed) return false;
    }
    return true;
  }
}
