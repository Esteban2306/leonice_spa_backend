import 'express';

declare module 'express' {
  interface Request {
    rawBody?: Buffer;
    user?: { id: string; email?: string; role?: string; isActive?: boolean };
  }
}
