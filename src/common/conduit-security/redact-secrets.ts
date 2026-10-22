export const SECRET_MASK = '••••';

const SECRET_SHAPES: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g,
  /sk-or-[A-Za-z0-9_-]{8,}/g,
  /sk-proj-[A-Za-z0-9_-]{8,}/g,
  /\bsk-[A-Za-z0-9]{16,}/g,
  /\bAIza[0-9A-Za-z_-]{20,}/g,
  /\bgsk_[A-Za-z0-9]{16,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /\benc:v1:[0-9a-f:]{16,}/g,
];

const SECRET_FIELD_NAMES =
  /^(api[-_]?key|apikey|secret|authorization|x-api-key|password|token|access[-_]?token|refresh[-_]?token|auth[-_]?secret)$/i;

const MAX_DEPTH = 25;

export function maskSecrets(text: string): string {
  return SECRET_SHAPES.reduce(
    (out, shape) => out.replace(shape, SECRET_MASK),
    text,
  );
}

export function looksLikeSecret(value: string): boolean {
  return SECRET_SHAPES.some((shape) => {
    shape.lastIndex = 0;
    return shape.test(value);
  });
}

function isSecretField(key: string): boolean {
  return SECRET_FIELD_NAMES.test(key);
}

export function scrubSecrets<T>(value: T, depth = 0): T {
  if (depth > MAX_DEPTH || value === null || value === undefined) return value;
  if (typeof value === 'string') return maskSecrets(value) as T;
  if (typeof value !== 'object' || value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map((item: unknown) => scrubSecrets(item, depth + 1)) as T;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      isSecretField(key) && child !== null && child !== undefined
        ? SECRET_MASK
        : scrubSecrets(child, depth + 1),
    ]),
  ) as T;
}

export function findSecrets(value: unknown, path = '$', depth = 0): string[] {
  if (depth > MAX_DEPTH || value === null || value === undefined) return [];
  if (typeof value === 'string') {
    return looksLikeSecret(value) ? [`${path} (valor con forma de clave)`] : [];
  }
  if (typeof value !== 'object' || value instanceof Date) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) =>
      findSecrets(item, `${path}[${i}]`, depth + 1),
    );
  }
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => {
      const here = `${path}.${key}`;
      const named =
        isSecretField(key) &&
        child !== null &&
        child !== undefined &&
        child !== SECRET_MASK
          ? [`${here} (campo de secreto)`]
          : [];
      return [...named, ...findSecrets(child, here, depth + 1)];
    },
  );
}
