import { Transform } from 'class-transformer';

export function CollapseWhitespace() {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  );
}
