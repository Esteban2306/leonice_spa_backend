export interface MatchableTreatment {
  id: string;
  name: string;
  slug?: string | null;
}

export type TreatmentMatch<T extends MatchableTreatment> =
  | { status: 'found'; treatment: T }
  | { status: 'ambiguous'; options: T[] }
  | { status: 'not_found' };

const STOP_WORDS = new Set([
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'de',
  'del',
  'al',
  'en',
  'con',
  'para',
  'por',
  'mi',
  'su',
  'tu',
  'que',
  'tratamiento',
  'tratamientos',
  'servicio',
  'servicios',
  'procedimiento',
]);

const MAX_OPTIONS = 5;

export function significantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return (
    short.length >= 4 &&
    long.startsWith(short) &&
    long.length - short.length <= 2
  );
}

function covers(nameTokens: string[], queryTokens: string[]): boolean {
  return queryTokens.every((q) => nameTokens.some((n) => sameWord(n, q)));
}

/**
 * Busca el tratamiento que la clienta nombró. Solo acepta un acierto cuando
 * TODAS las palabras significativas de la consulta aparecen en el nombre: si
 * varios tratamientos cumplen y ninguno es exactamente lo pedido, es ambiguo
 * (se le pregunta cuál); si ninguno cumple, no se adivina.
 */
export function matchTreatment<T extends MatchableTreatment>(
  query: string,
  treatments: T[],
): TreatmentMatch<T> {
  const queryTokens = significantTokens(query);
  if (queryTokens.length === 0) return { status: 'not_found' };

  const candidates = treatments.filter((t) =>
    covers(
      significantTokens(`${t.name} ${(t.slug ?? '').replace(/-/g, ' ')}`),
      queryTokens,
    ),
  );
  if (candidates.length === 0) return { status: 'not_found' };
  if (candidates.length === 1) {
    return { status: 'found', treatment: candidates[0] };
  }

  const exact = candidates.filter((t) => {
    const nameTokens = significantTokens(t.name);
    return (
      nameTokens.length === queryTokens.length &&
      covers(nameTokens, queryTokens)
    );
  });
  if (exact.length === 1) return { status: 'found', treatment: exact[0] };

  return { status: 'ambiguous', options: candidates.slice(0, MAX_OPTIONS) };
}
