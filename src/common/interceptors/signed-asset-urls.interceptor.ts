import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CloudinaryService } from '../../infrastructure/cloudinary/cloudinary.service';

const MARKER = '/image/authenticated/';
const MAX_DEPTH = 12;

export function signAuthenticatedUrls(
  value: unknown,
  sign: (url: string) => string,
  depth = 0,
): unknown {
  if (depth > MAX_DEPTH) return value;
  if (typeof value === 'string') {
    return value.includes(MARKER) ? sign(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => signAuthenticatedUrls(item, sign, depth + 1));
  }
  if (
    value === null ||
    typeof value !== 'object' ||
    value instanceof Date ||
    Buffer.isBuffer(value)
  ) {
    return value;
  }
  const serializable = value as { toJSON?: () => unknown };
  if (typeof serializable.toJSON === 'function') {
    return signAuthenticatedUrls(serializable.toJSON(), sign, depth + 1);
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = signAuthenticatedUrls(item, sign, depth + 1);
  }
  return out;
}

@Injectable()
export class SignedAssetUrlsInterceptor implements NestInterceptor {
  constructor(private readonly cloudinary: CloudinaryService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const isAdmin =
      (req.user as { role?: string } | undefined)?.role === 'ADMIN';
    if (!isAdmin) return next.handle();
    return next
      .handle()
      .pipe(
        map((body: unknown) =>
          signAuthenticatedUrls(body, (url) =>
            this.cloudinary.signAuthenticatedUrl(url),
          ),
        ),
      );
  }
}
