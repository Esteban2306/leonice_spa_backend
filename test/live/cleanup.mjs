// Cancela (soft) las reservas vivas de clientes sintéticos (+999…) creadas por la verificación.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const BASE = 'http://localhost:3921/api/v1'; const jar = new Map();
const keep = (res) => { for (const c of res.headers.getSetCookie()) { const [p] = c.split(';'); const i = p.indexOf('='); jar.set(p.slice(0, i), p.slice(i + 1)); } };
const sql = (q) => execFileSync('docker', ['exec', '-i', 'leonice-postgres', 'sh', '-c', 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "$0"', q], { encoding: 'utf8' }).trim();
const resetThrottle = () => { const k = execFileSync('docker', ['exec', 'leonice-redis', 'redis-cli', '--scan', '--pattern', '{*'], { encoding: 'utf8' }).split('\n').filter((x) => /\}:(hits|blocked)$/.test(x)); if (k.length) execFileSync('docker', ['exec', 'leonice-redis', 'redis-cli', 'del', ...k]); };
const { email, password } = JSON.parse(readFileSync(new URL('.qa-admin.json', import.meta.url), 'utf8'));
let res = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) }); keep(res);
const ids = sql(`select r.id from reservations r join clients c on c.id=r.client_id where c.phone like '+999%' and r.status not in ('CANCELADA','COMPLETADA','NO_SHOW','REPROGRAMADA')`).split('\n').filter(Boolean);
for (const id of ids) {
  resetThrottle();
  res = await fetch(`${BASE}/reservations/${id}/admin-cancel`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), 'x-csrf-token': jar.get('csrf_token') }, body: JSON.stringify({ notifyClient: false, reason: 'Limpieza verificación fase 0' }) });
  console.log(res.status, id);
}
console.log('vivas restantes:', sql(`select count(*) from reservations r join clients c on c.id=r.client_id where c.phone like '+999%' and r.status not in ('CANCELADA','COMPLETADA','NO_SHOW','REPROGRAMADA')`));
console.log('clientes sintéticos:', sql(`select count(*) from clients where phone like '+999%'`), '| reservas sintéticas:', sql(`select count(*) from reservations r join clients c on c.id=r.client_id where c.phone like '+999%'`));
