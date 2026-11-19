import type { CatalogProductRecord } from '../../products/catalog/product-catalog.repository';

interface Concern {
  key: string;
  label: string;
  said: RegExp;
  catalog: RegExp;
}

const CONCERNS: Concern[] = [
  {
    key: 'caida',
    label: 'caída del cabello',
    said: /\b(?:caida|anticaida|se (?:me |le )?(?:cae|caen|esta cayendo|estan cayendo)|cayendo|perdida de(?:l)? (?:cabello|pelo)|se me sale|calvicie|entradas|ralo)\b/,
    catalog:
      /\b(?:anticaida|caida del cabello|tendencia a la caida|control(?: de)?(?: la)? caida|cuidado de la caida|caida visible|cabello fino o con caida)\b/,
  },
  {
    key: 'frizz',
    label: 'frizz',
    said: /\b(?:frizz|friz|encrespad\w*|esponjad\w*|crespo)\b/,
    catalog: /\bfrizz\b/,
  },
  {
    key: 'resequedad',
    label: 'resequedad',
    said: /\b(?:resec\w*|seco|seca|resequedad|aspero|opaco|sin brillo|deshidratad\w*)\b/,
    catalog: /\b(?:resec\w*|seco|aspero|opaco|hidrat\w*|deshidrat\w*)\b/,
  },
  {
    key: 'grasa',
    label: 'grasa en la raíz',
    said: /\b(?:grasa|grasoso|grasosa|graso|grasos|engrasa\w*|oleos\w*)\b/,
    catalog: /\b(?:gras\w*|engrasa\w*|oleos\w*)\b/,
  },
  {
    key: 'caspa',
    label: 'caspa o picor',
    said: /\b(?:caspa|descamacion|pica|picor|rasquiña|comezon)\b/,
    catalog: /\b(?:caspa|descamacion|picor)\b/,
  },
  {
    key: 'puntas',
    label: 'puntas abiertas',
    said: /\b(?:puntas|orzuela\w*|horquilla\w*)\b/,
    catalog: /\bpuntas\b/,
  },
  {
    key: 'dano',
    label: 'cabello dañado o quebradizo',
    said: /\b(?:dañad\w*|danad\w*|quebradiz\w*|se (?:me )?(?:quiebra|parte|rompe)|quemad\w*|decolorad\w*|quimic\w*|maltratad\w*)\b/,
    catalog:
      /\b(?:quiebr\w*|dano|danado|decolor\w*|quimic\w*|debilitad\w*|reconstru\w*|proteina\w*)\b/,
  },
  {
    key: 'color',
    label: 'color o canas',
    said: /\b(?:color|tinte|tenido|tenida|canas|reflejos|matiz\w*)\b/,
    catalog: /\b(?:color|canas|tono|pigment\w*)\b/,
  },
  {
    key: 'volumen',
    label: 'poco volumen o cabello fino',
    said: /\b(?:volumen|fino|delgado|poquito|poco cabello|aplastad\w*)\b/,
    catalog: /\b(?:volumen|fino|densidad)\b/,
  },
  {
    key: 'liso',
    label: 'quiere el cabello liso',
    said: /\b(?:liso|lisito|alisar|alisado|ondas|ondulado)\b/,
    catalog: /\b(?:liso|alisad\w*|ondas)\b/,
  },
];

const MAX_TREATMENTS = 3;
const MAX_PRODUCTS = 4;
const MAX_WHY = 2;

export const normalizeNeed = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function detectConcerns(need: string): Concern[] {
  const text = normalizeNeed(need);
  return CONCERNS.filter((concern) => concern.said.test(text));
}

interface RecommendableTreatment {
  name: string;
  idealFor?: string[] | null;
  benefits?: string[] | null;
}

function why(lines: string[], concerns: Concern[]): string[] {
  return lines
    .filter((line) => concerns.some((c) => c.catalog.test(normalizeNeed(line))))
    .slice(0, MAX_WHY);
}

function score(lines: string[], concerns: Concern[]): number {
  return concerns.filter((concern) =>
    lines.some((line) => concern.catalog.test(normalizeNeed(line))),
  ).length;
}

export interface RecommendedTreatment<T> {
  item: T;
  why: string[];
}

export function matchTreatments<T extends RecommendableTreatment>(
  treatments: readonly T[],
  concerns: Concern[],
): RecommendedTreatment<T>[] {
  return treatments
    .map((treatment) => {
      const lines = treatment.idealFor ?? [];
      return {
        treatment,
        score: score(lines, concerns),
        why: why(lines, concerns),
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.why.length - a.why.length)
    .slice(0, MAX_TREATMENTS)
    .map((entry) => ({ item: entry.treatment, why: entry.why }));
}

export interface RecommendedProduct {
  type: 'producto' | 'ritual';
  name: string;
  price: string;
  why: string[];
}

const pesos = (value: number) =>
  `$${Math.round(value).toLocaleString('es-CO')}`;

export function matchProducts(
  catalog: readonly CatalogProductRecord[],
  concerns: Concern[],
): RecommendedProduct[] {
  return catalog
    .filter((product) => product.variants.length > 0)
    .map((product) => {
      const lines = [
        product.tagline ?? '',
        product.purpose ?? '',
        ...product.idealFor,
        ...product.benefits,
        ...product.tagAssignments.map((assignment) => assignment.tag.name),
      ].filter(Boolean);
      return {
        product,
        score: score(lines, concerns),
        why: why([...product.idealFor, ...product.benefits], concerns),
        combo: product.kind === 'COMBO' ? 1 : 0,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.combo - a.combo)
    .slice(0, MAX_PRODUCTS)
    .map(({ product, why: reasons }) => {
      const prices = product.variants.map((variant) => Number(variant.price));
      const low = Math.min(...prices);
      const high = Math.max(...prices);
      return {
        type: product.kind === 'COMBO' ? 'ritual' : 'producto',
        name: product.name,
        price: low === high ? pesos(low) : `desde ${pesos(low)}`,
        why: reasons,
      };
    });
}

export const NO_MATCH_HINT =
  'Nada del catálogo está pensado para eso: dilo con honestidad, sin prometer resultados, y ofrécele que el equipo la oriente (pasar_a_persona solo si acepta).';

export const NEED_UNCLEAR_HINT =
  'No se reconoció la necesidad: pregúntale en una frase qué siente o qué quiere mejorar en su cabello.';
