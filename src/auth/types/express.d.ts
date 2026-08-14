import type { AuthenticatedUser } from './authenticated-user.type';

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- el declaration merging de Express exige "interface", "type" no sirve aquí
    interface User extends AuthenticatedUser {}
  }
}

export {};
