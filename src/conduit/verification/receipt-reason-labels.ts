const LABELS: Record<string, string> = {
  AMOUNT_GTE_FAILED: 'el monto es menor al abono mínimo',
  AMOUNT_MISSING: 'no se alcanzó a leer el monto',
  DESTINATION_WITHIN_FAILED: 'la cuenta destino no coincide con la del spa',
  DESTINATION_MISSING: 'no se alcanzó a leer la cuenta destino',
  DATE_WITHIN_DAYS_FAILED: 'la fecha del comprobante es muy antigua',
  DATE_MISSING: 'no se alcanzó a leer la fecha',
  ALREADY_USED: 'ese comprobante ya se había usado',
  REUSED_OTHER_CONTACT: 'ese comprobante ya lo usó otra persona',
  NOT_EXPECTED_DOCUMENT: 'la imagen no parece un comprobante',
  ILLEGIBLE: 'la foto no se lee bien',
};

const FALLBACK = 'el sistema no pudo validarlo por sí solo';

/** Motivos legibles para el equipo; nunca incluyen datos del comprobante. */
export function describeReceiptReasons(codes: readonly string[]): string {
  const labels = codes
    .map((code) => LABELS[code])
    .filter((label): label is string => Boolean(label));
  return labels.length > 0 ? [...new Set(labels)].join('; ') : FALLBACK;
}
