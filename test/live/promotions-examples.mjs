import { readFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:3920/api/v1';
const DAYS = Number(process.env.DAYS ?? 7);
const MODE = process.argv[2] ?? 'crear';
const PREFIX = '[Ejemplo]';
const LIVE = new URL('.', import.meta.url).pathname;

const jar = new Map();
function storeCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
}
async function api(method, path, body) {
  const headers = { 'content-type': 'application/json' };
  if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  if (method !== 'GET' && jar.has('csrf_token')) headers['x-csrf-token'] = jar.get('csrf_token');
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  storeCookies(res);
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (res.status >= 400) throw new Error(`${method} ${path} → ${res.status} ${json?.code ?? ''} ${json?.message ?? ''}`);
  return json;
}
const list = (body) => body?.data ?? body ?? [];

const { email, password } = JSON.parse(readFileSync(LIVE + '.qa-admin.json', 'utf8'));
await api('POST', '/auth/login', { email, password });
await api('GET', '/auth/me');

const existing = list(await api('GET', `/promotions?name=${encodeURIComponent(PREFIX)}`)).filter((p) => p.name.startsWith(PREFIX));

if (MODE === 'quitar') {
  for (const promo of existing.filter((p) => p.isActive)) {
    await api('PATCH', `/promotions/${promo.id}/deactivate`);
    console.log(`Desactivada: ${promo.name}`);
  }
  console.log('Listo. Las promociones de ejemplo ya no aplican en la web ni en el bot.');
  process.exit(0);
}

const categories = list(await api('GET', '/categories'));
const treatments = list(await api('GET', '/treatments'));
const nails = categories.find((c) => /uñas/i.test(c.name));
const hair = categories.find((c) => /capilar/i.test(c.name));
const hairTreatment = treatments.find((t) => t.categoryId === hair?.id && t.isActive !== false);
if (!nails || !hairTreatment) throw new Error('No encontré la categoría Uñas o un servicio de Spa Capilar');

const startsAt = new Date();
const endsAt = new Date(startsAt.getTime() + DAYS * 24 * 3600e3);
const examples = [
  { name: `${PREFIX} Semana de uñas 15%`, discountPercentage: 15, categoryId: nails.id },
  { name: `${PREFIX} ${hairTreatment.name} 20%`, discountPercentage: 20, treatmentId: hairTreatment.id },
];

for (const example of examples) {
  const current = existing.find((p) => p.name === example.name);
  if (current) {
    await api('PATCH', `/promotions/${current.id}`, { isActive: true, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
    console.log(`Reactivada: ${example.name}`);
  } else {
    await api('POST', '/promotions', { ...example, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
    console.log(`Creada: ${example.name}`);
  }
}

const after = list(await api('GET', '/treatments'));
const show = (t) => `${t.name}: ${t.basePriceMin}${t.basePriceMax !== t.basePriceMin ? `–${t.basePriceMax}` : ''} → ${t.effectiveBasePriceMin}${t.effectiveBasePriceMax !== t.effectiveBasePriceMin ? `–${t.effectiveBasePriceMax}` : ''} (miles COP, ${t.activePromotion.discountPercentage}%)`;
console.log(`\nVigentes hasta ${endsAt.toLocaleString('es-CO', { timeZone: 'America/Bogota' })}:`);
for (const t of after.filter((t) => t.activePromotion?.name?.startsWith(PREFIX))) console.log(`  · ${show(t)}`);
console.log(`
Cómo emularlas:
  Web/panel  → /admin/services muestra la insignia de promoción y el precio con descuento;
               una reserva creada por la web guarda ese precio con descuento.
  WhatsApp   → con la herramienta listar_tratamientos activa, escríbele al bot
               "¿tienen promociones?" o "¿cuánto vale ${hairTreatment.name}?" y agenda;
               la reserva queda con el precio con descuento.
Quitar      → node test/live/promotions-examples.mjs quitar`);
