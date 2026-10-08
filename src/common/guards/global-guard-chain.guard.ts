import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { isObservable, lastValueFrom } from 'rxjs';
import { CsrfGuard } from '../../auth/guards/csrf.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ClientThrottlerGuard } from '../../reservations/guards/client-throttler.guard';

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
