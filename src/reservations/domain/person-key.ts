export function personKey(
  clientId: string,
  dependentId: string | null,
): string {
  return `${clientId}:${dependentId ?? ''}`;
}
