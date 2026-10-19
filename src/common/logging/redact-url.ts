const SENSITIVE_QUERY_KEYS = new Set([
  'phone',
  'clientphone',
  'whatsappjid',
  'email',
  'name',
  'q',
  'search',
  'token',
  'password',
]);

const TOKEN_PATH_PATTERNS: readonly RegExp[] = [
  /(\/cancellation-links\/)[^/?#]+/i,
  /(\/auth\/reset\/)[^/?#]+/i,
];

const REDACTED = '[redactado]';

export function redactUrl(url: string): string {
  const queryStart = url.indexOf('?');
  const path = queryStart === -1 ? url : url.slice(0, queryStart);
  const query = queryStart === -1 ? '' : url.slice(queryStart + 1);

  const safePath = TOKEN_PATH_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, `$1${REDACTED}`),
    path,
  );
  if (query === '') return safePath;

  const safeQuery = query
    .split('&')
    .map((pair) => {
      const separator = pair.indexOf('=');
      const key = separator === -1 ? pair : pair.slice(0, separator);
      let decoded = key;
      try {
        decoded = decodeURIComponent(key);
      } catch {
        decoded = key;
      }
      return SENSITIVE_QUERY_KEYS.has(decoded.toLowerCase())
        ? `${key}=${REDACTED}`
        : pair;
    })
    .join('&');
  return `${safePath}?${safeQuery}`;
}
