import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.isPublic(context)) {
      return (await super.canActivate(context)) as boolean;
    }

    await this.identifyOptionalUser(context);
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

  private async identifyOptionalUser(context: ExecutionContext): Promise<void> {
    try {
      await super.canActivate(context);
    } catch {
      return;
    }
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
