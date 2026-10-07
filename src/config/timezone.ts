export const BUSINESS_TIMEZONE = 'America/Bogota';

export function assertBusinessTimezone(): void {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (resolved !== BUSINESS_TIMEZONE) {
    throw new Error(
      `El proceso corre en "${resolved}" pero el negocio exige "${BUSINESS_TIMEZONE}". ` +
        `Define TZ=${BUSINESS_TIMEZONE} en el entorno de despliegue antes de arrancar.`,
    );
  }
}
