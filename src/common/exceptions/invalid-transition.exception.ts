import { AppException } from '../errors/app.exception';

export class InvalidTransitionException extends AppException {
  constructor(message: string) {
    super('RESERVATION_INVALID_TRANSITION', { message });
  }
}
