const fromEnv = (key: string) => process.env[key] ?? '';

export const CONDUIT_TEMPLATE_IDS = {
  get RESERVATION_REMINDER() {
    return fromEnv('CONDUIT_TEMPLATE_RESERVATION_REMINDER');
  },
  get REACTIVATION() {
    return fromEnv('CONDUIT_TEMPLATE_REACTIVATION');
  },
  get REACTIVATION_WITH_PROMO() {
    return fromEnv('CONDUIT_TEMPLATE_REACTIVATION_PROMO');
  },
};
