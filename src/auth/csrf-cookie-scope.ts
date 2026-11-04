export function csrfCookieScope(env: NodeJS.ProcessEnv = process.env): {
  domain?: string;
} {
  const domain = env.COOKIE_DOMAIN?.trim();
  return domain ? { domain } : {};
}
