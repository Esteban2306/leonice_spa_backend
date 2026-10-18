import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import type { RequestWithConduitContact } from '../interceptors/conduit-contact.interceptor';

export const VerifiedPhone = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const req = context.switchToHttp().getRequest<RequestWithConduitContact>();
    const phone = req.conduitContact?.phone;
    if (!phone) throw new AppException('CONTACT_NOT_VERIFIED');
    return phone;
  },
);
