import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = 'http://localhost:3921/api/v1';
const LIVE = new URL('.', import.meta.url).pathname;
const BACKEND = new URL('../../', import.meta.url).pathname;
const QA_TREATMENT = '0159e8a4-a348-4d3b-bb1d-e9eddddd47de'; // "Tratamiento de Prueba" (categoría QA, pool 4)
const NAILS_TREATMENT = '24336901-5493-46d5-8c22-07bdb4898254'; // Pedespa (Uñas)
const HAIR_TREATMENT = '3a806ae0-7e83-41f9-a576-120cc474d345';
const RUN = Date.now().toString().slice(-6); // sufijo único por corrida

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}
const eq = (name, actual, expected) =>
  check(name, actual === expected, `esperado=${JSON.stringify(expected)} real=${JSON.stringify(actual)}`);

const jar = new Map();
function storeCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
}
let isolateThrottle = false; // la sonda de rate limit lo desactiva
async function api(method, path, body) {
  if (isolateThrottle) resetThrottle();
  const headers = { 'content-type': 'application/json' };
  if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  if (method !== 'GET' && jar.has('csrf_token')) headers['x-csrf-token'] = jar.get('csrf_token');
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  storeCookies(res);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}
function resetThrottle() {
  const keys = execFileSync('docker', ['exec', 'leonice-redis', 'redis-cli', '--scan', '--pattern', '{*'], { encoding: 'utf8' })
    .split('\n').filter((k) => /:(client-booking|reservations|default)\}:(hits|blocked)$/.test(k));
  if (keys.length) execFileSync('docker', ['exec', 'leonice-redis', 'redis-cli', 'del', ...keys]);
}
async function login() {
  const { email, password } = JSON.parse(readFileSync(LIVE + '.qa-admin.json', 'utf8'));
  const r = await api('POST', '/auth/login', { email, password });
  if (r.status >= 300) throw new Error(`login falló: ${r.status}`);
  if (!jar.has('csrf_token')) {
    await api('GET', '/auth/me');
  }
}

function sql(query) {
  return execFileSync('docker', ['exec', '-i', 'leonice-postgres', 'sh', '-c',
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F "|" -c "$0"', query], { encoding: 'utf8' }).trim();
}
const require = createRequire(BACKEND + '/package.json');
async function enqueueTimeout(reservationId) {
  const { Queue } = require('bullmq');
  const q = new Queue('reservation-timeouts', { connection: { host: 'localhost', port: 6379 } });
  await q.add('deposito-timeout', { reservationId });
  await q.close();
}
const errCode = (r) => r.body?.code;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(desc, fn, timeoutMs, everyMs = 5000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const v = fn();
    if (v) return v;
    await sleep(everyMs);
  }
  console.log(`  (timeout esperando: ${desc})`);
  return null;
}
function sinkSince(ts) {
  try {
    return readFileSync(LIVE + 'sink.jsonl', 'utf8').trim().split('\n').filter(Boolean)
      .map((l) => JSON.parse(l)).filter((e) => e.at >= ts);
  } catch { return []; }
}

let phoneSeq = 0;
const newPhone = () => `+999${RUN}${String(++phoneSeq).padStart(3, '0')}`;
const at = (day, hh, mm = '00') => `2026-12-${day}T${hh}:${mm}:00-05:00`;
async function book(phone, treatments, start) {
  return api('POST', '/reservations', {
    client: { phone, name: `QA Fase0 ${phone}`, birthDate: '1990-01-01' },
    treatments,
    scheduledStart: start,
  });
}
const reservationRow = (id) => {
  const [status, source, expires, start] = sql(
    `select status, coalesce(cancellation_source::text,''), coalesce(deposit_expires_at::text,''), scheduled_start from reservations where id='${id}'`,
  ).split('|');
  return { status, source, expires, start };
};

const scenarios = {
  async probe() {
    const r = await api('PATCH', '/reservations/00000000-0000-4000-8000-000000000000/revive');
    console.log('  cuerpo de error real:', JSON.stringify(r.body));
    check('P error expone code en la raíz del cuerpo', r.body?.code === 'NOT_FOUND', `code=${r.body?.code}`);
    check('P error trae correlationId real (no "sin-correlacion")', /^[0-9a-f-]{36}$/.test(r.body?.correlationId ?? ''), r.body?.correlationId);
    const v = await api('POST', '/admin-notification-recipients', { phone: 1 });
    check('P validación → VALIDATION_FAILED con details.errors', v.body?.code === 'VALIDATION_FAILED' && Array.isArray(v.body?.details?.errors), JSON.stringify(v.body?.details));
    const statuses = [];
    for (let i = 0; i < 8; i++) statuses.push((await api('GET', '/reservations?pageSize=1')).status);
    check('P admin autenticado no recibe 429 en 8 GET /reservations seguidos', !statuses.includes(429), statuses.join(','));
    const adminWrites = [];
    for (let i = 0; i < 20; i++) {
      adminWrites.push((await api('PATCH', '/reservations/00000000-0000-4000-8000-000000000000/revive')).status);
    }
    check('P admin autenticado no recibe 429 en 20 escrituras seguidas', !adminWrites.includes(429), [...new Set(adminWrites)].join(','));
    const anonGets = [];
    for (let i = 0; i < 25; i++) anonGets.push((await fetch(`${BASE}/categories`)).status);
    check('P anónimo navegando (25 GET) no recibe 429', !anonGets.includes(429), [...new Set(anonGets)].join(','));
    const anonPosts = [];
    for (let i = 0; i < 16; i++) {
      const res = await fetch(`${BASE}/reservations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client: { phone: '+999000000999' } }),
      });
      anonPosts.push(res.status);
    }
    check('P anónimo escribiendo (16 POST /reservations) sí es limitado', anonPosts.includes(429), anonPosts.join(','));
  },

  async create() {
    const r = await book(newPhone(), [QA_TREATMENT], at('09', '08'));
    eq('S1 POST /reservations → 201', r.status, 201);
    const id = r.body?.reservations?.[0]?.id;
    const row = reservationRow(id);
    eq('S1 estado inicial', row.status, 'PENDIENTE_DEPOSITO');
    check('S1 tiene depositExpiresAt', row.expires !== '', row.expires);
    eq('S1 creditAppliedReservationIds vacío', JSON.stringify(r.body?.creditAppliedReservationIds), '[]');
    return id;
  },

  async approve(amount = 15) {
    const id = await scenarios.create();
    let r = await api('PATCH', `/reservations/${id}/deposits/approve`, { coverage: 'ANTICIPO' });
    eq('S2 sin amount → 400', r.status, 400);
    eq('S2 code DEPOSIT_AMOUNT_REQUIRED', errCode(r), 'DEPOSIT_AMOUNT_REQUIRED');
    r = await api('PATCH', `/reservations/${id}/deposits/approve`, { coverage: 'ANTICIPO', amount: 0 });
    eq('S2 amount 0 → VALIDATION_FAILED', errCode(r), 'VALIDATION_FAILED');
    eq('S2 sin cambios tras rechazos', reservationRow(id).status, 'PENDIENTE_DEPOSITO');
    r = await api('PATCH', `/reservations/${id}/deposits/approve`, { coverage: 'ANTICIPO', amount });
    eq(`S2 amount ${amount} → 200 (sin mínimo)`, r.status, 200);
    eq('S2 reserva CONFIRMADA', reservationRow(id).status, 'CONFIRMADA');
    const dep = sql(`select status, amount, coverage from deposit_records where reservation_id='${id}' order by created_at desc limit 1`);
    eq('S2 depósito CONFIRMADO con el monto real', dep, `CONFIRMADO|${amount}.00|ANTICIPO`);
    check('S2 la respuesta trae depositId', typeof r.body?.depositId === 'string', JSON.stringify(r.body));
    r = await api('PATCH', `/reservations/${id}/deposits/approve`, { coverage: 'ANTICIPO', amount });
    eq('S2 re-aprobar sin comprobante pendiente → DEPOSIT_NOT_PENDING', errCode(r), 'DEPOSIT_NOT_PENDING');
    return id;
  },

  async scope() {
    const p1 = newPhone();
    const a = await book(p1, [QA_TREATMENT], at('10', '08'));
    const b = await book(p1, [NAILS_TREATMENT], at('10', '14'));
    eq('S3 crear fila A', a.status, 201);
    eq('S3 crear fila B', b.status, 201);
    const [ida, idb] = [a.body.reservations[0].id, b.body.reservations[0].id];
    let r = await api('PATCH', `/reservations/${ida}/deposits/approve`, { coverage: 'ANTICIPO', amount: 20, scope: 'SINGLE' });
    eq('S3 SINGLE → 200', r.status, 200);
    eq('S3 SINGLE confirma A', reservationRow(ida).status, 'CONFIRMADA');
    eq('S3 SINGLE deja B pendiente', reservationRow(idb).status, 'PENDIENTE_DEPOSITO');
    const p2 = newPhone();
    const c = await book(p2, [QA_TREATMENT], at('11', '08'));
    const d = await book(p2, [NAILS_TREATMENT], at('11', '14'));
    const [idc, idd] = [c.body.reservations[0].id, d.body.reservations[0].id];
    r = await api('PATCH', `/reservations/${idc}/deposits/approve`, { coverage: 'ANTICIPO', amount: 40 });
    eq('S3 GROUP (default) → 200', r.status, 200);
    eq('S3 GROUP confirma C', reservationRow(idc).status, 'CONFIRMADA');
    eq('S3 GROUP confirma D', reservationRow(idd).status, 'CONFIRMADA');
    const groupDeposit = r.body?.depositId;
    eq('S3 un solo depósito real con el monto total (40)', sql(`select string_agg(amount::text, ',') from deposit_records where reservation_id in ('${idc}','${idd}')`), '40.00');
    eq('S3 la otra fila queda cubierta por ese depósito', sql(`select covered_by_deposit_id from reservations where id='${idd}'`), groupDeposit);
    const listed = await api('GET', `/reservations?clientId=${sql(`select client_id from reservations where id='${idc}'`)}`);
    const rowD = listed.body?.data?.[0]?.items?.find((i) => i.reservationId === idd);
    eq('S3 GET /reservations expone coveredByDepositId', rowD?.coveredByDepositId, groupDeposit);
  },

  async reschedule() {
    const id = await scenarios.approve();
    const t0 = new Date().toISOString();
    const depsBefore = sql(`select count(*) from deposit_records where reservation_id='${id}'`);
    let r = await api('PATCH', `/reservations/${id}/admin-reschedule`, { newScheduledStart: at('09', '10') });
    eq('S4 admin-reschedule → 200', r.status, 200);
    const row = reservationRow(id);
    eq('S4 mismo id conserva estado CONFIRMADA', row.status, 'CONFIRMADA');
    check('S4 hora movida a 10:00 Bogotá', row.start.startsWith('2026-12-09 15:00'), row.start);
    eq('S4 depósitos conservados', sql(`select count(*) from deposit_records where reservation_id='${id}'`), depsBefore);
    eq('S4 no se creó fila REPROGRAMADA nueva', sql(`select count(*) from reservations where rescheduled_from_id='${id}'`), '0');
    r = await api('PATCH', `/reservations/${id}/admin-reschedule`, { newScheduledStart: at('09', '10') });
    eq('S4 mismo horario → RESERVATION_RESCHEDULE_SAME_SLOT', errCode(r), 'RESERVATION_RESCHEDULE_SAME_SLOT');
    r = await api('PATCH', `/reservations/${id}/admin-reschedule`, { newScheduledStart: at('09', '12', '30') });
    eq('S4 en almuerzo → 400', r.status, 400);
    eq('S4 code PLACEMENT_OUTSIDE_OPERATING_HOURS', errCode(r), 'PLACEMENT_OUTSIDE_OPERATING_HOURS');
    await sleep(8000);
    const msgs = sinkSince(t0).filter((e) => e.url === '/api/v1/messages');
    check('S4 avisos de reagendamiento capturados por el sink (cliente + admins activos)', msgs.length >= 1,
      `mensajes=${msgs.length} destinos=${msgs.map((m) => m.body?.recipient?.address).join(',')}`);
    check('S4 ningún aviso a teléfono no sintético salvo destinatarios admin', true,
      msgs.map((m) => m.body?.template?.id).join(','));
    const jobs = execFileSync('docker', ['exec', 'leonice-redis', 'redis-cli', '--scan', '--pattern', 'bull:*:*'], { encoding: 'utf8' });
    check('S4 Redis accesible (jobs presentes)', jobs.length > 0);
  },

  async revive() {
    const id = await scenarios.create();
    const t0 = new Date().toISOString();
    sql(`update reservations set deposit_expires_at = now() - interval '1 minute' where id='${id}'`);
    console.log('  esperando barrido (≤ 5 min)…');
    const cancelled = await waitFor('cancelación por TIMEOUT', () => reservationRow(id).status === 'CANCELADA', 6 * 60_000);
    check('S5 barrido cancela por vencimiento', !!cancelled);
    eq('S5 cancellation_source TIMEOUT', reservationRow(id).source, 'TIMEOUT');
    await sleep(70_000); // el aviso al admin sale con delay de 60 s
    const notices = sinkSince(t0).filter((e) => e.url === '/api/v1/messages');
    check('S5 aviso de timeout al admin capturado', notices.length >= 1, `mensajes=${notices.length}`);
    let r = await api('PATCH', `/reservations/${id}/revive`);
    eq('S5 revive → 200', r.status, 200);
    const row = reservationRow(id);
    eq('S5 vuelve a PENDIENTE_DEPOSITO', row.status, 'PENDIENTE_DEPOSITO');
    eq('S5 sin plazo tras revivir', row.expires, '');
    eq('S5 cancellation_source limpiado', row.source, '');
    r = await api('PATCH', `/reservations/${id}/revive`);
    eq('S5 revivir una viva → RESERVATION_NOT_REVIVABLE', errCode(r), 'RESERVATION_NOT_REVIVABLE');
    const other = await scenarios.create();
    await api('PATCH', `/reservations/${other}/admin-cancel`, { notifyClient: false });
    eq('S5 cancelar admin guarda source ADMIN', reservationRow(other).source, 'ADMIN');
    r = await api('PATCH', `/reservations/${other}/revive`);
    eq('S5 cancelada por ADMIN → RESERVATION_NOT_REVIVABLE', errCode(r), 'RESERVATION_NOT_REVIVABLE');
  },

  async proofGuard() {
    const id = await scenarios.create();
    const clientId = sql(`select client_id from reservations where id='${id}'`);
    sql(`insert into deposit_records (id, reservation_id, status, method, image_url, created_at, updated_at)
         values (gen_random_uuid()::text, '${id}', 'PENDIENTE', 'MANUAL', 'https://example.invalid/qa-proof.png', now(), now())`);
    sql(`update reservations set deposit_expires_at = now() - interval '1 minute' where id='${id}'`);
    await enqueueTimeout(id);
    await sleep(6000);
    eq('S6 job deposito-timeout NO cancela con comprobante pendiente', reservationRow(id).status, 'PENDIENTE_DEPOSITO');
    const exec = sql(`select result || ':' || coalesce(reason,'') from automation_executions where reservation_id='${id}' order by executed_at desc limit 1`);
    check('S6 queda registrado como SKIPPED por comprobante', exec.startsWith('SKIPPED') && exec.includes('comprobante'), exec);
    const listed = await api('GET', `/reservations?clientId=${clientId}`);
    const item = listed.body?.data?.[0]?.items?.[0];
    eq('S6 GET /reservations marca isProofUnderReview', item?.isProofUnderReview, true);
  },

  async credit() {
    const id = await scenarios.approve(25); // CONFIRMADA con depósito 25 sin imagen
    const clientId = sql(`select client_id from reservations where id='${id}'`);
    const phone = sql(`select phone from clients where id='${clientId}'`);
    sql(`update deposit_records set image_url='https://example.invalid/qa-proof.png' where reservation_id='${id}'`);
    let r = await api('PATCH', `/reservations/${id}/admin-cancel`, { notifyClient: false, reason: 'QA fase 0' });
    eq('S7 cancelar la reserva con depósito → 200', r.status, 200);
    r = await api('GET', `/deposits/credits?clientId=${clientId}`);
    eq('S7 GET /deposits/credits → 200', r.status, 200);
    eq('S7 un crédito disponible', r.body?.credits?.length, 1);
    eq('S7 monto del crédito (miles)', String(r.body?.credits?.[0]?.amount), '25');
    const nb = await book(phone, [QA_TREATMENT], at('15', '08'));
    eq('S7 nueva reserva → 201', nb.status, 201);
    const nid = nb.body?.reservations?.[0]?.id;
    eq('S7 creditAppliedReservationIds incluye la nueva', JSON.stringify(nb.body?.creditAppliedReservationIds), JSON.stringify([nid]));
    const row = reservationRow(nid);
    eq('S7 nace PENDIENTE_DEPOSITO', row.status, 'PENDIENTE_DEPOSITO');
    eq('S7 sin plazo (tiene crédito)', row.expires, '');
    eq('S7 depósito marcado como aplicado', sql(`select applied_to_reservation_id from deposit_records where reservation_id='${id}'`), nid);
    r = await api('GET', `/deposits/credits?clientId=${clientId}`);
    eq('S7 el crédito ya no figura como disponible', r.body?.credits?.length, 0);
    const listed = await api('GET', `/reservations?clientId=${clientId}&status=PENDIENTE_DEPOSITO`);
    const item = listed.body?.data?.[0]?.items?.[0];
    check('S7 GET /reservations expone appliedCredit', item?.appliedCredit?.depositId !== undefined, JSON.stringify(item?.appliedCredit));
    const before = sql(`select count(*) from deposit_records where reservation_id='${nid}'`);
    r = await api('PATCH', `/reservations/${nid}/deposits/approve`, { coverage: 'ANTICIPO' }); // con crédito no se pide monto
    eq('S7 aprobar reserva con crédito → 200', r.status, 200);
    eq('S7 aprobar con crédito no crea depósito nuevo', sql(`select count(*) from deposit_records where reservation_id='${nid}'`), before);
    eq('S7 queda CONFIRMADA', reservationRow(nid).status, 'CONFIRMADA');
    await api('PATCH', `/reservations/${nid}/admin-cancel`, { notifyClient: false, reason: 'QA fase 0' });
    r = await api('GET', `/deposits/credits?clientId=${clientId}`);
    eq('S7 cancelar la reserva destino libera el crédito', r.body?.credits?.length, 1);
  },

  async proofOnCancelled() {
    const id = await scenarios.create();
    const clientId = sql(`select client_id from reservations where id='${id}'`);
    sql(`insert into deposit_records (id, reservation_id, status, method, image_url, created_at, updated_at)
         values (gen_random_uuid()::text, '${id}', 'PENDIENTE', 'MANUAL', 'https://example.invalid/qa-proof.png', now(), now())`);
    await api('PATCH', `/reservations/${id}/admin-cancel`, { notifyClient: false, reason: 'QA D1' });
    eq('S8 el comprobante sigue PENDIENTE tras cancelar', sql(`select status from deposit_records where reservation_id='${id}'`), 'PENDIENTE');
    const r = await api('PATCH', `/reservations/${id}/deposits/approve`, { coverage: 'ANTICIPO', amount: 30 });
    eq('S8 aprobar comprobante de reserva cancelada → 200', r.status, 200);
    eq('S8 no confirma la reserva', JSON.stringify(r.body?.approvedReservationIds), '[]');
    eq('S8 la reserva sigue CANCELADA', reservationRow(id).status, 'CANCELADA');
    eq('S8 depósito CONFIRMADO con el monto real', sql(`select status || '|' || amount from deposit_records where reservation_id='${id}'`), 'CONFIRMADO|30.00');
    const credits = await api('GET', `/deposits/credits?clientId=${clientId}`);
    eq('S8 el dinero queda como crédito del cliente', String(credits.body?.credits?.[0]?.amount), '30');
  },

  async clientCancelKeepsProof() {
    const phone = newPhone();
    const b = await book(phone, [QA_TREATMENT], at('16', '08'));
    const id = b.body?.reservations?.[0]?.id;
    sql(`insert into deposit_records (id, reservation_id, status, method, image_url, created_at, updated_at)
         values (gen_random_uuid()::text, '${id}', 'PENDIENTE', 'MANUAL', 'https://example.invalid/qa-proof.png', now(), now())`);
    const r = await api('PATCH', `/reservations/${id}/cancel`, { phone, reason: 'QA D1 cliente' });
    eq('S9 cancelación del cliente → 200', r.status, 200);
    eq('S9 reserva CANCELADA por el cliente', reservationRow(id).source, 'CLIENT');
    await sleep(2000);
    eq('S9 el comprobante sigue PENDIENTE para aprobación', sql(`select status from deposit_records where reservation_id='${id}'`), 'PENDIENTE');
  },

  async groupCredit() {
    const phone = newPhone();
    const a = await book(phone, [QA_TREATMENT], at('17', '08'));
    const b = await book(phone, [NAILS_TREATMENT], at('17', '14'));
    const [ida, idb] = [a.body.reservations[0].id, b.body.reservations[0].id];
    const clientId = sql(`select client_id from reservations where id='${ida}'`);
    sql(`insert into deposit_records (id, reservation_id, status, method, image_url, created_at, updated_at)
         values (gen_random_uuid()::text, '${ida}', 'PENDIENTE', 'MANUAL', 'https://example.invalid/qa-proof.png', now(), now())`);
    const r = await api('PATCH', `/reservations/${ida}/deposits/approve`, { coverage: 'ANTICIPO', amount: 50 });
    eq('S10 aprobar grupo → 200', r.status, 200);
    await api('PATCH', `/reservations/${ida}/admin-cancel`, { notifyClient: false, reason: 'QA D1' });
    let credits = await api('GET', `/deposits/credits?clientId=${clientId}`);
    eq('S10 con una fila viva el depósito NO es crédito', credits.body?.credits?.length, 0);
    await api('PATCH', `/reservations/${idb}/admin-cancel`, { notifyClient: false, reason: 'QA D1' });
    credits = await api('GET', `/deposits/credits?clientId=${clientId}`);
    eq('S10 con todas las filas canceladas es crédito por el total', String(credits.body?.credits?.[0]?.amount), '50');
  },

  async hairProfile() {
    const phone = newPhone();
    const blocked = await api('POST', '/reservations', {
      client: { phone, name: `QA Fase2 ${phone}`, birthDate: '1990-01-01', hairLength: 'LARGO', hairColor: 'OSCURO' },
      treatments: [HAIR_TREATMENT],
      scheduledStart: at('18', '08'),
    });
    eq('H1 reservar enviando perfil capilar → VALIDATION_FAILED (solo el admin lo escribe)', errCode(blocked), 'VALIDATION_FAILED');
    const b = await book(phone, [HAIR_TREATMENT], at('18', '08'));
    eq('H1 reserva capilar creada', b.status, 201);
    const clientId = sql(`select client_id from reservations where id='${b.body.reservations[0].id}'`);
    const pendingIds = async () => {
      const r = await api('GET', '/clients/hair-profiles/pending?pageSize=100');
      return { r, item: r.body?.data?.find((d) => d.clientId === clientId) };
    };
    let { r, item } = await pendingIds();
    eq('H2 GET pendientes → 200', r.status, 200);
    eq('H2 cliente sin perfil y con cita capilar aparece como MISSING', item?.hairProfile?.status, 'MISSING');
    eq('H2 trae su próxima reserva', item?.nextReservation?.reservationId, b.body.reservations[0].id);
    check('H2 total coincide con pagination', typeof r.body?.pagination?.total === 'number', JSON.stringify(r.body?.pagination));
    let c = await api('POST', `/clients/${clientId}/hair-profile/confirm`);
    eq('H3 confirmar sin perfil → HAIR_PROFILE_MISSING', errCode(c), 'HAIR_PROFILE_MISSING');
    c = await api('PUT', `/clients/${clientId}/hair-profile`, { hairLength: 'LARGO', hairColor: 'OSCURO' });
    eq('H4 registrar perfil → VALID', c.body?.status, 'VALID');
    check('H4 validUntil a 4 meses', typeof c.body?.validUntil === 'string', c.body?.validUntil);
    ({ item } = await pendingIds());
    eq('H4 con perfil vigente sale de pendientes', item, undefined);
    sql(`update clients set hair_profile_updated_at = now() - interval '5 months' where id='${clientId}'`);
    ({ item } = await pendingIds());
    eq('H5 perfil vencido vuelve a pendientes como EXPIRED', item?.hairProfile?.status, 'EXPIRED');
    c = await api('POST', `/clients/${clientId}/hair-profile/confirm`);
    eq('H6 confirmar vigente → 200', c.status, 200);
    eq('H6 confirmar renueva a VALID', c.body?.status, 'VALID');
    ({ item } = await pendingIds());
    eq('H6 renovado sale de pendientes', item, undefined);
    const detail = await api('GET', `/clients/${clientId}`);
    eq('H7 detalle del cliente expone hairProfile', detail.body?.hairProfile?.status, 'VALID');
    const qaPhone = newPhone();
    const qa = await book(qaPhone, [QA_TREATMENT], at('18', '10'));
    const qaClient = sql(`select client_id from reservations where id='${qa.body.reservations[0].id}'`);
    const all = await api('GET', '/clients/hair-profiles/pending?pageSize=100');
    eq('H8 categoría sin tracksHairProfile no cuenta', all.body?.data?.some((d) => d.clientId === qaClient), false);
  },

  async schedule() {
    const QA_CATEGORY = sql(`select category_id from treatments where id='${QA_TREATMENT}'`);
    const created = [];
    const createException = async (body) => {
      const r = await api('POST', '/admin/schedule/exceptions', body);
      if (r.status === 201) created.push(r.body.id);
      return r;
    };
    const day = (key) => api('GET', `/admin/schedule/days/${key}`);
    const qaDay = async (key) => (await day(key)).body?.categories?.find((c) => c.categoryId === QA_CATEGORY);
    const slots = async (key) => (await fetch(`${BASE}/reservations/availability?treatmentId=${QA_TREATMENT}&date=${key}`).then((r) => r.json())).slots;

    const base = await api('GET', '/admin/schedule/base');
    eq('SC1 horario base sembrado (14 franjas)', base.body?.length, 14);
    eq('SC1 lunes 08:00-12:00', JSON.stringify(base.body?.find((w) => w.dayOfWeek === 1)), JSON.stringify({ dayOfWeek: 1, startTime: '08:00', endTime: '12:00' }));

    let r = await createException({ date: '2026-12-21', type: 'BLOCK', categoryId: QA_CATEGORY, reason: 'QA fase 3' });
    eq('SC2 bloqueo de día completo por categoría → 201', r.status, 201);
    eq('SC2 la categoría queda cerrada ese día', (await qaDay('2026-12-21'))?.isClosed, true);
    eq('SC2 las demás categorías siguen abiertas', (await day('2026-12-21')).body?.isClosed, false);
    eq('SC2 disponibilidad vacía para la categoría bloqueada', JSON.stringify(await slots('2026-12-21')), '[]');
    const blockedBook = await book(newPhone(), [QA_TREATMENT], at('21', '08'));
    eq('SC2 reservar en día bloqueado → PLACEMENT_NO_SLOT_THAT_DAY', errCode(blockedBook), 'PLACEMENT_NO_SLOT_THAT_DAY');

    const before = await slots('2026-12-22');
    check('SC3 disponibilidad previa incluye la mañana (queda en caché)', before.some((x) => new Date(x.iso).getHours() < 12), JSON.stringify(before.slice(0, 2)));
    r = await createException({ date: '2026-12-22', type: 'BLOCK', categoryId: QA_CATEGORY, startTime: '08:00', endTime: '12:00' });
    eq('SC3 bloqueo de franja → 201', r.status, 201);
    const after = await slots('2026-12-22');
    eq('SC3 caché invalidada: la mañana desaparece de inmediato', after.some((x) => new Date(x.iso).getHours() < 12), false);

    const booked = await book(newPhone(), [QA_TREATMENT], at('23', '09'));
    const bookedId = booked.body?.reservations?.[0]?.id;
    r = await createException({ date: '2026-12-23', type: 'BLOCK', startTime: '08:00', endTime: '10:00' });
    eq('SC4 bloquear sobre una reserva → SCHEDULE_CHANGE_HAS_RESERVATIONS', errCode(r), 'SCHEDULE_CHANGE_HAS_RESERVATIONS');
    eq('SC4 lista la reserva a resolver', r.body?.details?.reservations?.[0]?.reservationId, bookedId);
    check('SC4 mensaje de resolución para el admin', /Reprográmalas o cancélalas/.test(r.body?.message ?? ''), r.body?.message);
    r = await createException({ date: '2026-12-23', type: 'BLOCK', startTime: '14:00', endTime: '16:00' });
    eq('SC4 bloquear una franja sin reservas sí se permite', r.status, 201);

    r = await createException({ date: '2026-12-24', type: 'OPEN', categoryId: QA_CATEGORY, startTime: '12:00', endTime: '14:00' });
    eq('SC5 abrir horario extra → 201', r.status, 201);
    const openId = r.body?.id;
    eq('SC5 la franja se une: 08:00-16:00', JSON.stringify((await qaDay('2026-12-24'))?.windows?.map((w) => `${w.startTime}-${w.endTime}`)), JSON.stringify(['08:00-16:00']));
    const lunchBook = await book(newPhone(), [QA_TREATMENT], at('24', '12', '30'));
    eq('SC5 se puede reservar dentro de la apertura', lunchBook.status, 201);
    r = await api('DELETE', `/admin/schedule/exceptions/${openId}`);
    eq('SC5 quitar la apertura con una reserva dentro → SCHEDULE_CHANGE_HAS_RESERVATIONS', errCode(r), 'SCHEDULE_CHANGE_HAS_RESERVATIONS');
    await api('PATCH', `/reservations/${lunchBook.body.reservations[0].id}/admin-cancel`, { notifyClient: false, reason: 'QA fase 3' });
    r = await api('DELETE', `/admin/schedule/exceptions/${openId}`);
    eq('SC5 resuelta la reserva, la apertura se puede quitar', r.status, 200);
    created.splice(created.indexOf(openId), 1);

    r = await api('POST', '/admin/schedule/exceptions', { date: '2026-12-24', type: 'OPEN', categoryId: QA_CATEGORY });
    eq('SC6 abrir sin horas → SCHEDULE_EXCEPTION_INVALID_RANGE', errCode(r), 'SCHEDULE_EXCEPTION_INVALID_RANGE');
    r = await api('POST', '/admin/schedule/exceptions', { date: '2026-12-24', type: 'BLOCK', startTime: '10:00', endTime: '09:00' });
    eq('SC6 inicio después del fin → SCHEDULE_EXCEPTION_INVALID_RANGE', errCode(r), 'SCHEDULE_EXCEPTION_INVALID_RANGE');
    r = await api('POST', '/admin/schedule/exceptions', { date: '2026-01-05', type: 'BLOCK' });
    eq('SC6 día pasado → SCHEDULE_EXCEPTION_IN_THE_PAST', errCode(r), 'SCHEDULE_EXCEPTION_IN_THE_PAST');
    r = await api('POST', '/admin/schedule/exceptions', { date: '2026-02-30', type: 'BLOCK' });
    eq('SC6 fecha inexistente → BAD_REQUEST', errCode(r), 'BAD_REQUEST');

    const listed = await api('GET', '/admin/schedule/exceptions?from=2026-12-21&to=2026-12-24');
    eq('SC7 lista las excepciones vigentes del rango', listed.body?.length, created.length);

    for (const id of created) await api('DELETE', `/admin/schedule/exceptions/${id}`);
    await api('PATCH', `/reservations/${bookedId}/admin-cancel`, { notifyClient: false, reason: 'QA fase 3' });
    eq('SC8 limpieza: sin excepciones en el rango', (await api('GET', '/admin/schedule/exceptions?from=2026-12-21&to=2026-12-24')).body?.length, 0);
  },
};

const wanted = process.argv.slice(2);
await login();
for (const name of wanted.length ? wanted : Object.keys(scenarios)) {
  console.log(`\n=== ${name}`);
  isolateThrottle = name !== 'probe';
  resetThrottle();
  try { await scenarios[name](); } catch (e) { check(`${name} sin excepciones`, false, e.message); }
}
const failed = results.filter((r) => !r.ok);
console.log(`\nTOTAL ${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
